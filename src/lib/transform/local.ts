// Fallback engine: encode in the visitor's browser.
//
// JPEG and PNG (and WebP outside Safari) come from the browser's native canvas
// encoders, which are fast and add no download. AVIF, and WebP where the canvas
// cannot produce it, go to WASM encoders in a worker (encode.worker.ts), loaded
// only the first time they are needed.

import { decodeToCanvas } from '../core/image';
import { FORMATS, type OutputFormat } from './formats';

export interface LocalOptions {
  format: OutputFormat;
  quality: number;
}

type WorkerResponse = { id: number; ok: true; buffer: ArrayBuffer } | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (b: ArrayBuffer) => void; reject: (e: Error) => void }>();
const ENCODE_TIMEOUT_MS = 120_000;

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./encode.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    if (msg.ok) job.resolve(msg.buffer);
    else job.reject(new Error(msg.error));
  };
  w.onerror = (e) => {
    e.preventDefault();
    const error = new Error(e.message || 'The image encoder crashed.');
    pending.forEach((job) => job.reject(error));
    pending.clear();
    w.terminate();
    if (worker === w) worker = null;
  };
  return (worker = w);
}

function encodeInWorker(format: 'avif' | 'webp', image: ImageData, quality: number): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Encoding timed out.'));
    }, ENCODE_TIMEOUT_MS);
    pending.set(id, {
      resolve: (b) => { clearTimeout(timer); resolve(b); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    getWorker().postMessage({ id, format, image, quality }, [image.data.buffer]);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality / 100));
}

/** JPEG has no alpha: paint the image over white, as the edge engine does. */
function flattenOnWhite(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

export async function encodeLocally(file: File, { format, quality }: LocalOptions): Promise<Blob> {
  const { mime } = FORMATS[format];
  const canvases: HTMLCanvasElement[] = [];
  try {
    let canvas = await decodeToCanvas(file);
    canvases.push(canvas);
    if (format === 'jpeg') {
      canvas = flattenOnWhite(canvas);
      canvases.push(canvas);
    }

    if (format !== 'avif') {
      const blob = await canvasToBlob(canvas, mime, quality);
      // Browsers that cannot write a type silently return PNG instead.
      if (blob && blob.type === mime) return blob;
      if (format !== 'webp') throw new Error(`This browser could not encode ${FORMATS[format].label}.`);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is unavailable in this browser.');
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const buffer = await encodeInWorker(format as 'avif' | 'webp', image, quality);
    return new Blob([buffer], { type: mime });
  } finally {
    // Release canvas backing stores now rather than at the next GC; mobile
    // Safari runs out of canvas memory quickly on batches.
    for (const c of canvases) { c.width = 0; c.height = 0; }
  }
}

/** Natural size of an image, or null if the browser cannot decode it. */
export async function probeDimensions(file: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}
