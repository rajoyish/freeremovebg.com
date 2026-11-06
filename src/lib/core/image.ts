import { fitDimensions } from './processingPolicy';

function drawToCanvas(source: CanvasImageSource, width: number, height: number, maxDimension: number) {
  const canvas = document.createElement('canvas');
  const size = fitDimensions(width, height, maxDimension);
  canvas.width = size.width;
  canvas.height = size.height;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is unavailable in this browser.');
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  } catch (error) {
    canvas.width = 0;
    canvas.height = 0;
    throw error;
  }
}

export async function decodeToCanvas(file: File, maxDimension = Infinity): Promise<HTMLCanvasElement> {
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
        return drawToCanvas(bitmap, width, height, maxDimension);
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
    return drawToCanvas(img, width, height, maxDimension);
  } finally {
    URL.revokeObjectURL(url);
    img.src = '';
  }
}

export async function normalizeToPng(file: File, maxDimension = Infinity): Promise<Blob> {
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = await decodeToCanvas(file, maxDimension);
    const blob = await new Promise<Blob | null>((resolve) => canvas!.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to convert the image to PNG.');
    return blob;
  } finally {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
