// Main-thread client for the background-removal worker.
//
// Owns a single lazily-created worker and correlates request/response pairs by
// id. Mirrors the old runRemoval() signature minus the objectUrl argument — the
// worker creates its own object URL from the blob.
import type { ModelMode } from './model';

interface PendingResolver {
  resolve: (value: { blob: Blob; usedModel: string }) => void;
  reject: (reason: Error) => void;
}

type WorkerResponse =
  | { id: number; ok: true; blob: Blob; usedModel: string }
  | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, PendingResolver>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./removal.worker.ts', import.meta.url), { type: 'module' });

  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    const resolver = pending.get(msg.id);
    if (!resolver) return;
    pending.delete(msg.id);
    if (msg.ok) resolver.resolve({ blob: msg.blob, usedModel: msg.usedModel });
    else resolver.reject(new Error(msg.error));
  };

  // A fatal worker error can't be tied to one request — fail everything in
  // flight so callers don't hang, and drop the worker so the next call respawns.
  worker.onerror = (e) => {
    const err = new Error(e.message || 'Background-removal worker crashed.');
    for (const { reject } of pending.values()) reject(err);
    pending.clear();
    worker?.terminate();
    worker = null;
  };

  return worker;
}

export function runRemovalInWorker(
  mode: ModelMode,
  file: Blob
): Promise<{ blob: Blob; usedModel: string }> {
  const w = getWorker();
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, mode, file });
  });
}
