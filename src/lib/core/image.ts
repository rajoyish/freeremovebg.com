/**
 * Image decoding & normalization (pure algorithmic layer).
 *
 * Dual-path decoder with explicit fallback so every downstream engine
 * (transformers, @imgly/background-removal) receives a reliable PNG.
 *
 * IMPORTANT:
 * - ZERO references to application UI DOM (no getElementById, querySelector,
 *   thumbGrid, etc.). Only offscreen canvas / ImageBitmap / Image for compute.
 * - Temporary object URLs created here are ALWAYS revoked in finally.
 * - Canvas backing stores are eagerly zeroed to release memory (esp. Safari).
 */

export async function decodeToCanvas(file: File): Promise<HTMLCanvasElement> {
  // Path 1: createImageBitmap (preferred).
  // Most tolerant; matches what @imgly uses internally. Honours EXIF orientation.
  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Some engines reject the options bag; retry plain before falling back.
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

  // Path 2: <img>.decode() fallback.
  // Only reached if createImageBitmap unavailable or rejected the input.
  // We still revoke the temp URL and clear src to avoid leaks.
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
    // Free memory eagerly. Browsers (notably Safari/iOS) cap canvas backing-store
    // memory and will kill the tab when the cap is hit.
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
