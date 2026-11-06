/// <reference lib="webworker" />
// WASM encoders for the formats the browser's own canvas cannot write: AVIF
// everywhere, and WebP in Safari. They run off the main thread because an AVIF
// encode of a large photo can take several seconds.

type EncodeRequest = { id: number; format: 'avif' | 'webp'; image: ImageData; quality: number };
type EncodeResponse = { id: number; ok: true; buffer: ArrayBuffer } | { id: number; ok: false; error: string };

self.onmessage = async (e: MessageEvent<EncodeRequest>) => {
  const { id, format, image, quality } = e.data;
  try {
    let buffer: ArrayBuffer;
    if (format === 'avif') {
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
