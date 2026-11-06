import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './load-module.mjs';

const globals = { Headers, Response, FormData };
const load = (path) => loadModule(path, {}, globals);

const jpeg = (name = 'photo.jpg', size = 5) => new File(['x'.repeat(size)], name, { type: 'image/jpeg' });

/**
 * A fake fetch for the edge pipeline. `transform` decides what the
 * /cdn-cgi/image/ request returns; every call is recorded.
 */
function edgeFetch({ upload, transform }) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', accept: new Headers(init.headers).get('accept') });
    if (String(url).startsWith('/api/upload-temp') && init.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    if (String(url) === '/api/upload-temp') {
      return upload ? upload() : Response.json({ key: 'tmp/k.jpg', url: 'https://temp.example.com/tmp/k.jpg' }, { status: 201 });
    }
    return transform();
  };
  fn.calls = calls;
  return fn;
}

const image = (type, body = 'img') => new Response(body, { status: 200, headers: { 'content-type': type, 'cf-resized': 'internal=ok' } });

test('format helpers name outputs and choose formats', async () => {
  const f = await load('../src/lib/transform/formats.ts');
  const used = new Set();
  assert.equal(f.outputName('Holiday Photo.JPG', 'webp', used), 'Holiday Photo.webp');
  assert.equal(f.outputName('holiday photo.png', 'webp', used), 'holiday photo-2.webp');
  assert.equal(f.outputName('a/b:c.png', 'jpeg', used), 'a-b-c.jpg');
  assert.equal(f.outputName('.png', 'png', used), 'image.png');

  assert.equal(f.formatFromMime('image/jpg'), 'jpeg');
  assert.equal(f.formatFromMime('image/gif'), null);
  assert.equal(f.keepFormatFor('image/png'), 'png');
  assert.equal(f.keepFormatFor('image/gif'), 'webp');

  assert.equal(f.isRasterImage(new File([''], 'x.svg', { type: 'image/svg+xml' })), false);
  assert.equal(f.isRasterImage(new File([''], 'x.heic', { type: '' })), true);
  assert.equal(f.FORMATS.png.edge, false, 'png is not a valid /cdn-cgi/image/ format value');

  assert.equal(f.formatBytes(512), '512 B');
  assert.equal(f.formatBytes(1536), '1.5 KB');
  assert.equal(f.percentChange(200, 50), -75);
});

test('transform URL carries format, clamped quality and a JPEG background', async () => {
  const { buildTransformUrl } = await load('../src/lib/transform/edge.ts');
  assert.equal(
    buildTransformUrl('https://temp.example.com/tmp/a.png', { format: 'webp', quality: 0 }),
    '/cdn-cgi/image/format=webp,quality=1,metadata=none/https://temp.example.com/tmp/a.png',
  );
  assert.match(buildTransformUrl('https://t/x', { format: 'jpeg', quality: 80 }), /background=%23FFFFFF/);
});

test('edge pipeline returns the image and deletes the temp object', async () => {
  const { transformAtEdge } = await load('../src/lib/transform/edge.ts');
  const fetch = edgeFetch({ transform: () => image('image/webp') });
  const blob = await transformAtEdge(jpeg(), { format: 'webp', quality: 80 }, fetch);
  assert.equal(blob.type, 'image/webp');
  assert.deepEqual(fetch.calls.map((c) => c.method), ['POST', 'GET', 'DELETE']);
  assert.match(fetch.calls[1].url, /^\/cdn-cgi\/image\/format=webp,quality=80,metadata=none\/https:\/\/temp\.example\.com\//);
  // Without it the edge negotiates down to JPEG (fetch() defaults to */*).
  assert.match(fetch.calls[1].accept, /^image\/webp,/);
});

test('edge errors say whether the edge is down for everyone or just this image', async () => {
  const { transformAtEdge, EdgeError } = await load('../src/lib/transform/edge.ts');
  const run = (opts) => transformAtEdge(jpeg(), { format: 'webp', quality: 80 }, edgeFetch(opts)).then(
    () => assert.fail('expected an EdgeError'),
    (e) => { assert.ok(e instanceof EdgeError); return e; },
  );

  const limit = await run({ transform: () => new Response('ERROR 9422', { status: 403, headers: { 'cf-resized': 'err=9422' } }) });
  assert.equal(limit.code, '9422');
  assert.equal(limit.systemic, true);

  const bodyOnly = await run({ transform: () => new Response('error code: 9422', { status: 429 }) });
  assert.equal(bodyOnly.systemic, true);

  const network = await run({ transform: () => { throw new TypeError('Failed to fetch'); } });
  assert.equal(network.systemic, true);

  const noEndpoint = await run({ upload: () => new Response('Not found', { status: 404 }) });
  assert.equal(noEndpoint.systemic, true, 'astro dev has no /api/upload-temp');

  const tooBig = await run({ upload: () => new Response('', { status: 413 }) });
  assert.equal(tooBig.systemic, false);

  const unsupported = await run({ transform: () => new Response('bad', { status: 415, headers: { 'cf-resized': 'err=9520' } }) });
  assert.equal(unsupported.systemic, false);

  const substituted = await run({ transform: () => image('image/jpeg') });
  assert.equal(substituted.systemic, false, 'edge served a different format than requested');
});

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
}

const webp = (body) => new Blob([body], { type: 'image/webp' });

test('hybrid uses the edge first and never sends PNG there', async () => {
  const { HybridProcessor } = await load('../src/lib/transform/hybrid.ts');
  const local = [];
  const p = new HybridProcessor({
    edge: async () => webp('edge'),
    local: async (file) => { local.push(file.name); return webp('local'); },
    probe: async () => ({ width: 800, height: 600 }),
    storage: fakeStorage(),
  });
  assert.equal((await p.process(jpeg(), { format: 'webp', quality: 80 })).engine, 'edge');
  assert.equal((await p.process(jpeg('a.jpg'), { format: 'png', quality: 80 })).engine, 'local');
  assert.deepEqual(local, ['a.jpg']);
});

test('a 9422 midway through a batch routes every remaining image locally', async () => {
  const { HybridProcessor, EdgeError } = await load('../src/lib/transform/hybrid.ts');
  let edgeCalls = 0;
  const storage = fakeStorage();
  const p = new HybridProcessor({
    edge: async () => {
      if (++edgeCalls === 3) throw new EdgeError('Edge error 9422', true, '9422');
      return webp('e');
    },
    local: async () => webp('l'),
    probe: async () => ({ width: 100, height: 100 }),
    storage,
    now: () => 1_000,
  });

  const engines = [];
  for (let i = 0; i < 6; i++) engines.push((await p.process(jpeg(`${i}.jpg`), { format: 'webp', quality: 70 })).engine);
  assert.deepEqual(engines, ['edge', 'edge', 'local', 'local', 'local', 'local']);
  assert.equal(edgeCalls, 3, 'no edge attempts after the limit was hit');
  assert.equal(p.edgeAvailable, false);

  // Another processor in the same tab remembers, until the cool-off expires.
  const later = (t) => new HybridProcessor({ storage, now: () => t });
  assert.equal(later(2_000).edgeAvailable, false);
  assert.equal(later(1_000 + 16 * 60 * 1000).edgeAvailable, true);
});

test('unexpected errors disable the edge; per-image errors do not', async () => {
  const { HybridProcessor, EdgeError } = await load('../src/lib/transform/hybrid.ts');
  const make = (edge) => new HybridProcessor({
    edge, local: async () => webp('l'), probe: async () => null, storage: fakeStorage(),
  });

  const perImage = make(async (file) => {
    if (file.name === 'bad.jpg') throw new EdgeError('Edge error 9520', false, '9520');
    return webp('e');
  });
  assert.equal((await perImage.process(jpeg('bad.jpg'), { format: 'webp', quality: 80 })).engine, 'local');
  assert.equal(perImage.edgeAvailable, true);
  assert.equal((await perImage.process(jpeg('ok.jpg'), { format: 'webp', quality: 80 })).engine, 'edge');

  const crashed = make(async () => { throw new TypeError('boom'); });
  assert.equal((await crashed.process(jpeg(), { format: 'webp', quality: 80 })).engine, 'local');
  assert.equal(crashed.edgeAvailable, false);
});

test('edge eligibility respects format, input type and size limits', async () => {
  const { edgeEligible } = await load('../src/lib/transform/hybrid.ts');
  const size = (width, height) => ({ width, height });
  assert.equal(edgeEligible(jpeg(), 'webp', size(4000, 3000)), true);
  assert.equal(edgeEligible(jpeg(), 'png', size(10, 10)), false);
  assert.equal(edgeEligible(jpeg(), 'avif', size(1600, 900)), false, 'edge caps AVIF at 1,200px');
  assert.equal(edgeEligible(jpeg(), 'avif', size(1200, 900)), true);
  assert.equal(edgeEligible(jpeg(), 'webp', size(13000, 100)), false);
  assert.equal(edgeEligible(new File(['x'], 'a.avif', { type: 'image/avif' }), 'webp', null), false);
  assert.equal(edgeEligible(new File(['x'], 'a.bmp', { type: 'image/bmp' }), 'webp', null), false);
  assert.equal(edgeEligible(new File(['x'], 'a.heic', { type: '' }), 'jpeg', null), true);
  assert.equal(edgeEligible(jpeg('big.jpg', 26 * 1024 * 1024), 'webp', null), false);
});
