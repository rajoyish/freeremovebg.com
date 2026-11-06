import { needsLowMemoryProcessing, type ModelMode } from './processingPolicy';

type RemovalResult = { blob: Blob; usedModel: string };
type WorkerResponse =
  | ({ id: number; ok: true } & RemovalResult)
  | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let nextId = 0;
let work: Promise<unknown> = Promise.resolve();
const REQUEST_TIMEOUT_MS = 180_000;

function processImage(mode: ModelMode, file: Blob, lowMemory: boolean): Promise<RemovalResult> {
  return new Promise((resolve, reject) => {
    const w = worker ??= new Worker(new URL('./removal.worker.ts', import.meta.url), { type: 'module' });
    const id = ++nextId;

    const finish = (error?: Error, result?: RemovalResult) => {
      clearTimeout(timeout);
      w.onmessage = null;
      w.onerror = null;
      w.onmessageerror = null;
      // WASM heaps and cached model sessions survive a completed request.
      // Terminating the mobile worker releases them before rendering.
      if (lowMemory || error) {
        w.terminate();
        if (worker === w) worker = null;
      }
      if (error) reject(error);
      else resolve(result!);
    };

    const timeout = setTimeout(() => {
      finish(new Error('Background removal timed out. Please try again.'));
    }, REQUEST_TIMEOUT_MS);

    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.ok) finish(undefined, { blob: msg.blob, usedModel: msg.usedModel });
      else finish(new Error(msg.error));
    };
    w.onerror = (e) => {
      e.preventDefault();
      finish(new Error(e.message || 'Background-removal worker crashed.'));
    };
    w.onmessageerror = () => finish(new Error('Could not read the background-removal result.'));
    try {
      w.postMessage({ id, mode, file, lowMemory });
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function runRemovalInWorker(
  mode: ModelMode,
  file: Blob,
  lowMemory = needsLowMemoryProcessing()
): Promise<RemovalResult> {
  // Serialize here too, so other callers cannot run overlapping inferences
  // or initialize duplicate model sessions.
  const result = work.then(() => processImage(mode, file, lowMemory));
  work = result.catch(() => {});
  return result;
}
