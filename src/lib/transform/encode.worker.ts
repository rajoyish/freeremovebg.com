/// <reference lib="webworker" />
// Encoders the browser's own canvas cannot replace: AVIF everywhere, WebP in
// Safari, and the optimizer's palette PNG. They run off the main thread because
// an AVIF encode or a palette reduction of a large image can take seconds.

import { pngColorsFor } from './formats';

type EncodeRequest = { id: number; format: 'avif' | 'webp' | 'png'; image: ImageData; quality: number };
type EncodeResponse = { id: number; ok: true; buffer: ArrayBuffer } | { id: number; ok: false; error: string };

self.onmessage = async (e: MessageEvent<EncodeRequest>) => {
  const { id, format, image, quality } = e.data;
  try {
    let buffer: ArrayBuffer;
    if (format === 'png') {
      const { default: UPNG } = await import('upng-js');
      const encode = (colors: number) =>
        UPNG.encode([image.data.buffer as ArrayBuffer], image.width, image.height, colors);
      // Flat graphics can come out smaller lossless than as a palette, so
      // keep whichever is smaller. UPNG's lossless output already beats the
      // canvas encoder because it picks PNG filters per row.
      const colors = pngColorsFor(quality);
      buffer = encode(0);
      if (colors > 0) {
        const palette = encode(colors);
        if (palette.byteLength < buffer.byteLength) buffer = palette;
      }
    } else if (format === 'avif') {
      const { default: encode } = await import('@jsquash/avif/encode');
      // speed 6 is the library default, balancing size against encode time.
      buffer = await encode(image, { quality, speed: 6 });
    } else {
      const { default: encode } = await import('@jsquash/webp/encode');
      buffer = await encode(image, { quality });
    }
    self.postMessage({ id, ok: true, buffer } satisfies EncodeResponse, [buffer]);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies EncodeResponse);
  }
};
