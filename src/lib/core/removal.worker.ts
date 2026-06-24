// Background-removal worker.
//
// All ML inference (DETR detection, MODNet, ISNet) runs here, off the main
// thread, so the page stays interactive while a cutout is in flight. The
// libraries are worker-safe: @huggingface/transformers resolves to its web
// build and supports workers; @imgly/background-removal prefers OffscreenCanvas
// (available here) over document.createElement.
import { env } from '@huggingface/transformers';
import * as ort from 'onnxruntime-web';

import { runRemoval, type ModelMode } from './model';

// Engine config — moved verbatim from the page script. Single-threaded, no
// SharedArrayBuffer (no COEP headers), no nested worker proxy.
env.allowLocalModels = false;
env.allowRemoteModels = true;

try {
  let threads = 1;
  Object.defineProperty(ort.env.wasm, 'numThreads', {
    configurable: true,
    enumerable: true,
    get: () => threads,
    set: (v: number) => { threads = (typeof v === 'number' && v > 0) ? Math.min(v, 1) : 1; },
  });
} catch {
  ort.env.wasm.numThreads = 1;
}
ort.env.wasm.proxy = false;
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
}

interface RemovalRequest {
  id: number;
  mode: ModelMode;
  file: Blob;
}

type RemovalResponse =
  | { id: number; ok: true; blob: Blob; usedModel: string }
  | { id: number; ok: false; error: string };

self.onmessage = async (e: MessageEvent<RemovalRequest>) => {
  const { id, mode, file } = e.data;
  // runRemoval needs an object URL for the transformers pipelines; the worker
  // owns its lifecycle.
  const objectUrl = URL.createObjectURL(file);
  try {
    const { blob, usedModel } = await runRemoval(mode, file, objectUrl);
    const res: RemovalResponse = { id, ok: true, blob, usedModel };
    (self as unknown as Worker).postMessage(res);
  } catch (err) {
    const res: RemovalResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(res);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};
