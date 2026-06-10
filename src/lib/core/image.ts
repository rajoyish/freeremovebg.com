export async function decodeToCanvas(file: File): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      try { bitmap = await createImageBitmap(file); } catch { bitmap = null; }
    }
    if (bitmap) {
      try {
        const { width, height } = bitmap;
        if (!width || !height) throw new Error(`"${file.name}" has no readable image data.`);
        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context is unavailable in this browser.');
        ctx.drawImage(bitmap, 0, 0);
        return canvas;
      } finally {
        bitmap.close();
      }
    }
  }

  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    img.decoding = 'async';
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error(`Could not decode "${file.name}". The file may be corrupt or an unsupported format.`);
    }
    const width  = img.naturalWidth;
    const height = img.naturalHeight;
    if (!width || !height) throw new Error(`"${file.name}" has no readable image data.`);
    const canvas = document.createElement('canvas');
    canvas.width  = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is unavailable in this browser.');
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
    img.src = '';
  }
}

export async function normalizeToPng(file: File): Promise<Blob> {
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = await decodeToCanvas(file);
    const blob = await new Promise<Blob | null>((resolve) => canvas!.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to convert the image to PNG.');
    return blob;
  } finally {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
