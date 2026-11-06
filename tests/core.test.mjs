import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './load-module.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const photo = name => new File(['photo'], name, { type: 'image/jpeg' });
const png = new Blob(['png'], { type: 'image/png' });

test('mobile policy covers Safari, Chrome on iOS, iPad desktop UA and low-memory PCs', async () => {
  const { needsLowMemoryProcessing: lowMemory, fitDimensions } = await loadModule('../src/lib/core/processingPolicy.ts');
  for (const userAgent of ['iPhone Safari', 'iPhone CriOS', 'Android Chrome']) {
    assert.equal(lowMemory({ userAgent }), true);
  }
  assert.equal(lowMemory({ userAgent: 'Macintosh Safari', maxTouchPoints: 5 }), true);
  assert.equal(lowMemory({ userAgent: 'Windows Chrome', deviceMemory: 4 }), true);
  assert.equal(lowMemory({ userAgent: 'Macintosh Safari', maxTouchPoints: 0 }), false);
  for (const [width, height] of [[8064, 6048], [6048, 8064], [500, 900], [100, 50000]]) {
    const size = fitDimensions(width, height, 2048);
    assert.ok(Math.max(size.width, size.height) <= 2048);
    assert.ok(size.width <= width && size.height <= height);
    assert.ok(Math.abs(size.width / size.height - width / height) < 0.01);
  }
  assert.equal(fitDimensions(8064, 6048, Infinity).width, 8064);
});

test('mobile Smart and Objects modes load only quantized ISNet, while Portrait stays explicit', async () => {
  const calls = [];
  const env = { backends: { onnx: { wasm: {} } } };
  const { runRemoval } = await loadModule('../src/lib/core/model.ts', {
    '@huggingface/transformers': { env, pipeline: async (_task, model) => {
      calls.push(model);
      return async () => ({ toBlob: async () => png });
    } },
    '@imgly/background-removal': { removeBackground: async (_file, config) => {
      calls.push(config); return png;
    } },
  });
  await runRemoval('auto', png, 'blob:photo', true);
  await runRemoval('general', png, 'blob:photo', true);
  assert.equal(calls.length, 2);
  for (const config of calls) {
    assert.equal(config.model, 'isnet_quint8');
    assert.equal(config.device, 'cpu');
    assert.equal(config.proxyToWorker, false);
  }
  await runRemoval('portrait', png, 'blob:photo', true);
  assert.equal(calls.at(-1), 'Xenova/modnet');
  assert.equal(env.backends.onnx.wasm.numThreads, 1);
});

function workerHarness() {
  const instances = [];
  class Worker {
    terminated = false;
    constructor() { instances.push(this); }
    postMessage(request) { this.request = request; }
    terminate() { this.terminated = true; }
    succeed() { this.onmessage({ data: { id: this.request.id, ok: true, blob: png, usedModel: 'test' } }); }
  }
  return { instances, Worker };
}

test('mobile worker requests serialize and terminate before the next image', async () => {
  const { instances, Worker } = workerHarness();
  const { runRemovalInWorker } = await loadModule('../src/lib/core/removalClient.ts', {}, { Worker });
  const first = runRemovalInWorker('auto', png, true);
  const second = runRemovalInWorker('general', png, true);
  await tick();
  assert.equal(instances.length, 1);
  instances[0].succeed();
  await first;
  await tick();
  assert.equal(instances[0].terminated, true);
  assert.equal(instances.length, 2);
  instances[1].succeed();
  await second;
  assert.equal(instances[1].terminated, true);
});

test('desktop worker is reused after success', async () => {
  const { instances, Worker } = workerHarness();
  const { runRemovalInWorker } = await loadModule('../src/lib/core/removalClient.ts', {}, { Worker });
  for (let i = 0; i < 2; i++) {
    const result = runRemovalInWorker('general', png, false);
    await tick();
    instances[0].succeed();
    await result;
  }
  assert.equal(instances.length, 1);
  assert.equal(instances[0].terminated, false);
});

for (const failure of ['error', 'messageerror', 'postMessage', 'timeout']) {
  test(`worker ${failure} releases memory and allows the next request`, async () => {
    const { instances, Worker } = workerHarness();
    let timeout;
    if (failure === 'postMessage') Worker.prototype.postMessage = function () { throw new Error('clone failed'); };
    const { runRemovalInWorker } = await loadModule('../src/lib/core/removalClient.ts', {}, {
      Worker, setTimeout: callback => { timeout = callback; return 1; }, clearTimeout: () => {},
    });
    const result = runRemovalInWorker('auto', png, true);
    const rejected = assert.rejects(result);
    await tick();
    if (failure === 'error') instances[0].onerror({ message: 'crash', preventDefault() {} });
    if (failure === 'messageerror') instances[0].onmessageerror();
    if (failure === 'timeout') timeout();
    await rejected;
    assert.equal(instances[0].terminated, true);
    Worker.prototype.postMessage = function (request) { this.request = request; };
    const retry = runRemovalInWorker('auto', png, true);
    await tick();
    instances[1].succeed();
    await retry;
  });
}

async function queueHarness() {
  const calls = [], normalizations = [], cards = [], statuses = [], shown = [], revoked = [];
  const noop = () => {};
  const { QueueManager } = await loadModule('../src/lib/core/QueueManager.ts', {
    './image': { normalizeToPng: async (file, limit) => { normalizations.push({ file, limit }); return png; } },
    './glitch': { isGlitched: async () => false },
    './removalClient': { runRemovalInWorker: (mode, file, lowMemory) => new Promise((resolve, reject) => {
      calls.push({ mode, file, lowMemory, resolve, reject });
    }) },
    '../counter': { recordSuccessfulCutout: noop },
  }, { URL: { createObjectURL: () => `blob:${Math.random()}`, revokeObjectURL: url => revoked.push(url) },
    console: { error: noop } });
  const queue = new QueueManager({
    thumbs: { showInZone: items => shown.push(...items), setStatus: (id, status) => statuses.push([id, status]),
      setPreview: noop, updateCount: noop, removeThumb: (_id, done) => done?.(), reset: noop },
    cards: { addCard: (...args) => cards.push(args), removeCard: noop, reset: () => { cards.length = 0; } },
    progress: { show: noop, hide: noop, set: noop, scheduleHide: noop }, showToast: noop,
  }, {});
  return { queue, calls, normalizations, cards, statuses, shown, revoked };
}

test('adding uploads during processing serializes decoding and prevents removing the active photo', async () => {
  const { queue, calls, normalizations, cards, shown } = await queueHarness();
  const first = queue.addFiles([photo('first.jpg')]);
  await tick();
  queue.remove(shown[0].id);
  const second = queue.addFiles([photo('second.jpg')]);
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(normalizations.length, 1);
  assert.equal(normalizations[0].limit, 2048);
  calls[0].resolve({ blob: png, usedModel: 'test' });
  await tick();
  assert.equal(cards.length, 1);
  assert.equal(calls.length, 2);
  calls[1].resolve({ blob: png, usedModel: 'test' });
  await Promise.all([first, second]);
  assert.equal(cards.length, 2);
  assert.ok(shown.every(item => item.status === 'done'));
});

test('a failed image stays in the queue and does not block later uploads', async () => {
  const { queue, calls, cards, shown } = await queueHarness();
  const work = queue.addFiles([photo('bad.jpg'), photo('good.jpg')]);
  await tick();
  calls[0].reject(new Error('model download failed'));
  await tick();
  assert.equal(shown[0].status, 'error');
  assert.equal(shown[0].file.name, 'bad.jpg');
  calls[1].resolve({ blob: png, usedModel: 'test' });
  await work;
  assert.equal(cards.length, 1);
});

test('reset during processing discards stale results and preserves newly added photos', async () => {
  const { queue, calls, cards, shown, revoked } = await queueHarness();
  const first = queue.addFiles([photo('old.jpg')]);
  await tick();
  queue.reset();
  const second = queue.addFiles([photo('new.jpg')]);
  assert.notEqual(shown[0].id, shown[1].id);
  calls[0].resolve({ blob: png, usedModel: 'test' });
  await tick();
  assert.equal(cards.length, 0);
  assert.equal(revoked.length, 1);
  calls[1].resolve({ blob: png, usedModel: 'test' });
  await Promise.all([first, second]);
  assert.equal(cards.length, 1);
  assert.match(cards[0][0], /new/);
});

test('large image normalization bounds the canvas and closes the bitmap even on encode failure', async () => {
  for (const fails of [false, true]) {
    let closed = false, dimensions;
    const canvas = { width: 0, height: 0,
      getContext: () => ({ drawImage: (_image, _x, _y, width, height) => { dimensions = [width, height]; } }),
      toBlob: done => done(fails ? null : png),
    };
    const { normalizeToPng } = await loadModule('../src/lib/core/image.ts', {}, {
      createImageBitmap: async () => ({ width: 8064, height: 6048, close() { closed = true; } }),
      document: { createElement: () => canvas },
    });
    const result = normalizeToPng(photo('camera.jpg'), 2048);
    if (fails) await assert.rejects(result, /convert/);
    else await result;
    assert.deepEqual(dimensions, [2048, 1536]);
    assert.equal(closed, true);
    assert.equal(canvas.width, 0);
    assert.equal(canvas.height, 0);
  }
});

test('image element fallback bounds portrait images and revokes its object URL', async () => {
  let image, dimensions, revoked;
  const canvas = { width: 0, height: 0,
    getContext: () => ({ drawImage: (_image, _x, _y, width, height) => { dimensions = [width, height]; } }),
    toBlob: done => done(png),
  };
  const { normalizeToPng } = await loadModule('../src/lib/core/image.ts', {}, {
    createImageBitmap: async () => { throw new Error('unsupported format'); },
    Image: class {
      naturalWidth = 3024;
      naturalHeight = 4032;
      constructor() { image = this; }
      async decode() {}
    },
    URL: { createObjectURL: () => 'blob:input', revokeObjectURL: url => { revoked = url; } },
    document: { createElement: () => canvas },
  });
  await normalizeToPng(photo('portrait.jpg'), 2048);
  assert.deepEqual(dimensions, [1536, 2048]);
  assert.equal(revoked, 'blob:input');
  assert.equal(image.src, '');
  assert.equal(canvas.width, 0);
});

test('canvas allocation failure frees the canvas and decoded bitmap', async () => {
  let closed = false;
  const canvas = { width: 0, height: 0, getContext: () => null };
  const { normalizeToPng } = await loadModule('../src/lib/core/image.ts', {}, {
    createImageBitmap: async () => ({ width: 8064, height: 6048, close() { closed = true; } }),
    document: { createElement: () => canvas },
  });
  await assert.rejects(normalizeToPng(photo('camera.jpg'), 2048), /context/);
  assert.equal(closed, true);
  assert.equal(canvas.width, 0);
  assert.equal(canvas.height, 0);
});

test('a previous batch cannot hide progress for newly added images', async () => {
  let hide, hidden = false, cancelled = false;
  const { ProgressView } = await loadModule('../src/lib/ui/progress.ts', {}, {
    setTimeout: callback => { hide = callback; return 1; },
    clearTimeout: timer => { if (timer === 1) cancelled = true; },
  });
  const progress = new ProgressView({ progressState: { classList: {
    add: () => { hidden = true; }, remove: () => { hidden = false; },
  } } });
  progress.scheduleHide();
  progress.show();
  if (!cancelled) hide();
  assert.equal(hidden, false);
  assert.equal(cancelled, true);
});
