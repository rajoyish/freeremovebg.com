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

  // Optimizer PNG palette: 100 stays lossless, lower quality means fewer colours.
  assert.equal(f.pngColorsFor(100), 0);
  assert.equal(f.pngColorsFor(80), 205);
  assert.equal(f.pngColorsFor(50), 128);
  assert.equal(f.pngColorsFor(0), 16);
  assert.equal(f.pngColorsFor(Number.NaN), 0);

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
const open = async () => ({ available: true, resumeAt: null });

test('hybrid uses the edge first and never sends PNG there', async () => {
  const { HybridProcessor } = await load('../src/lib/transform/hybrid.ts');
  const local = [];
  const p = new HybridProcessor({
    edge: async () => webp('edge'),
    local: async (file) => { local.push(file.name); return webp('local'); },
    probe: async () => ({ width: 800, height: 600 }),
    status: open,
    storage: fakeStorage(),
  });
  assert.equal((await p.process(jpeg(), { format: 'webp', quality: 80 })).engine, 'edge');
  assert.equal((await p.process(jpeg('a.jpg'), { format: 'png', quality: 80 })).engine, 'local');
  assert.deepEqual(local, ['a.jpg']);
});

test('localOnly keeps a file off the edge without switching the edge off', async () => {
  const { HybridProcessor } = await load('../src/lib/transform/hybrid.ts');
  let edgeCalls = 0;
  let statusCalls = 0;
  const p = new HybridProcessor({
    edge: async () => { edgeCalls++; return new Blob(['e'], { type: 'image/webp' }); },
    local: async () => new Blob(['l'], { type: 'image/webp' }),
    probe: async () => ({ width: 64, height: 64 }),
    status: async () => { statusCalls++; return { available: true, resumeAt: null }; },
    storage: null,
  });
  const png = new File(['x'], 'icon.png', { type: 'image/png' });
  assert.equal((await p.process(png, { format: 'webp', quality: 80, localOnly: true })).engine, 'local');
  assert.equal(edgeCalls, 0);
  assert.equal(statusCalls, 0);
  assert.equal(p.edgeAvailable, true);
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
    status: open,
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
    edge, local: async () => webp('l'), probe: async () => null, status: open, storage: fakeStorage(),
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

test('a closed monthly budget sends everything to the device without uploading', async () => {
  const { HybridProcessor } = await load('../src/lib/transform/hybrid.ts');
  let statusCalls = 0;
  const storage = fakeStorage();
  const p = new HybridProcessor({
    edge: async () => assert.fail('edge must not be used once the month is closed'),
    local: async () => webp('l'),
    probe: async () => ({ width: 10, height: 10 }),
    status: async () => { statusCalls++; return { available: false, resumeAt: '2026-12-01T00:00:00.000Z' }; },
    storage,
    now: () => 1_000,
  });
  await p.ready();
  assert.equal(p.edgeAvailable, false, 'known before the batch is planned');
  for (let i = 0; i < 3; i++) {
    assert.equal((await p.process(jpeg(`${i}.jpg`), { format: 'webp', quality: 80 })).engine, 'local');
  }
  assert.equal(statusCalls, 1, 'status is asked once per page');
});

test('an open budget is checked once and then the edge is used', async () => {
  const { HybridProcessor } = await load('../src/lib/transform/hybrid.ts');
  let statusCalls = 0;
  const p = new HybridProcessor({
    edge: async () => webp('e'),
    local: async () => assert.fail('local not expected'),
    probe: async () => ({ width: 10, height: 10 }),
    status: async () => { statusCalls++; return { available: true, resumeAt: null }; },
    storage: fakeStorage(),
  });
  await Promise.all([1, 2, 3].map((i) => p.process(jpeg(`${i}.jpg`), { format: 'webp', quality: 80 })));
  assert.equal(statusCalls, 1);
});

test('edge status: anything but a clear yes means on-device', async () => {
  const { fetchEdgeStatus } = await load('../src/lib/transform/edge.ts');
  const yes = await fetchEdgeStatus(async () => Response.json({ available: true, resumeAt: null }));
  assert.equal(yes.available, true);
  assert.equal(yes.resumeAt, null);
  assert.equal((await fetchEdgeStatus(async () => Response.json({ available: false, resumeAt: 'x' }))).available, false);
  assert.equal((await fetchEdgeStatus(async () => new Response('nope', { status: 404 }))).available, false, 'astro dev');
  assert.equal((await fetchEdgeStatus(async () => { throw new TypeError('offline'); })).available, false);
});

test('a 9422 is reported with its key before the temp object is deleted', async () => {
  const { transformAtEdge } = await load('../src/lib/transform/edge.ts');
  const calls = [];
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    calls.push(`${method} ${String(url).split('?')[0]}${init.body && typeof init.body === 'string' ? ' ' + init.body : ''}`);
    if (String(url) === '/api/upload-temp' && method === 'POST') {
      return Response.json({ key: 'tmp/2026-11-06/k.png', url: 'https://t/tmp/2026-11-06/k.png' }, { status: 201 });
    }
    if (String(url).startsWith('/cdn-cgi/image/')) {
      return new Response('limit', { status: 403, headers: { 'cf-resized': 'err=9422' } });
    }
    return new Response(null, { status: 204 });
  };
  await transformAtEdge(jpeg(), { format: 'webp', quality: 80 }, fetch).catch(() => {});
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls.map((c) => c.split(' ').slice(0, 2).join(' ')), [
    'POST /api/upload-temp', 'GET /cdn-cgi/image/format=webp,quality=80,metadata=none/https://t/tmp/2026-11-06/k.png',
    'POST /api/edge-status', 'DELETE /api/upload-temp',
  ]);
  assert.match(calls[2], /"code":"9422","key":"tmp\/2026-11-06\/k.png"/);
});

test('vector files are recognised by name, type and content', async () => {
  const v = await loadModule('../src/lib/transform/vector.ts', {}, { TextDecoder });
  const f = await load('../src/lib/transform/formats.ts');
  const file = (name, type = '') => new File([''], name, { type });

  for (const vec of [file('logo.svg', 'image/svg+xml'), file('logo.ai'), file('logo.eps', 'image/x-eps'),
    file('art', 'application/postscript'), file('LOGO.EPS')]) {
    assert.equal(v.isVectorImage(vec), true, vec.name);
    // image/x-eps must not pass for a raster the browser can decode.
    assert.equal(f.isRasterImage(vec), false, vec.name);
  }
  assert.equal(v.isVectorImage(file('photo.jpg', 'image/jpeg')), false);

  const bytes = (s) => new TextEncoder().encode(s);
  assert.equal(v.sniffVector(bytes('%PDF-1.6\n%âãÏÓ')), 'pdf'); // a modern .ai
  assert.equal(v.sniffVector(bytes('%!PS-Adobe-3.0 EPSF-3.0\n')), 'postscript');
  assert.equal(v.sniffVector(Uint8Array.from([0xc5, 0xd0, 0xd3, 0xc6, 0, 0])), 'postscript'); // DOS EPS
  assert.equal(v.sniffVector(bytes('<?xml version="1.0"?>\n<!-- c -->\n<svg xmlns="http://www.w3.org/2000/svg">')), 'svg');
  assert.equal(v.sniffVector(bytes('GIF89a')), null);
});

test('vector output fits the longest side and the canvas area cap', async () => {
  const v = await loadModule('../src/lib/transform/vector.ts', {}, { TextDecoder });
  assert.deepEqual({ ...v.fitVector(100, 50, 2048) }, { width: 2048, height: 1024 });
  assert.deepEqual({ ...v.fitVector(50, 100, 1024) }, { width: 512, height: 1024 });
  // Icons scale down as well as up.
  assert.deepEqual({ ...v.fitVector(24, 24, 16) }, { width: 16, height: 16 });
  // A square at 8192 px would be 67 MP; raster output is held to about 16.7 MP.
  const big = v.fitVector(10, 10, 8192);
  assert.ok(big.width * big.height <= 16_777_216);
  assert.equal(big.width, 4096);
  // Vector output has no pixel cap.
  assert.equal(v.fitVector(10, 10, 8192, false).width, 8192);
});

test('the size slider is logarithmic and round-trips the icon presets', async () => {
  const v = await loadModule('../src/lib/transform/vector.ts', {}, { TextDecoder });
  assert.equal(v.sliderToSize(0), 16);
  assert.equal(v.sliderToSize(v.SLIDER_STEPS), 8192);
  assert.equal(v.sliderToSize(v.SLIDER_STEPS / 3), 128); // 16 * 512^(1/3)
  for (const size of [...v.ICON_SIZES, v.DEFAULT_VECTOR_SIZE, 4096]) {
    assert.ok(Math.abs(v.sliderToSize(v.sizeToSlider(size)) - size) / size < 0.01, String(size));
  }
  assert.equal(v.clampVectorSize(3), 16);
  assert.equal(v.clampVectorSize(99999), 8192);
  assert.equal(v.clampVectorSize(NaN), v.DEFAULT_VECTOR_SIZE);
});

test('pasted SVG code becomes one named file per <svg> block', async () => {
  const v = await loadModule('../src/lib/transform/vector.ts', {}, { TextDecoder });
  const files = v.svgsFromText(`
<!-- Heroicons -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="size-16"><path d="M0 0h1"/></svg>

<svg width="64" height="64" class="bi bi-vector-pen" viewBox="0 0 16 16"><path d="M0 0h1"/></svg>
<p>not an icon</p>
<SVG viewBox="0 0 24 24"><path d="M0 0h1"/></SVG>`);
  assert.deepEqual([...files.map((f) => f.name)], ['heroicons.svg', 'bi-vector-pen.svg', 'icon.svg']);
  assert.equal(files[0].type, 'image/svg+xml');
  // A missing namespace is added, so the file opens on its own.
  assert.match(await files[1].text(), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="64"/);
  assert.equal(v.svgsFromText('just some text').length, 0);
});

test('currentColor resolves to the root colour or black', async () => {
  const v = await loadModule('../src/lib/transform/vector.ts', {}, { TextDecoder });
  assert.equal(v.resolveCurrentColor('<svg stroke="currentColor">'), '<svg stroke="#000000">');
  assert.equal(v.resolveCurrentColor('<svg color="red" fill="currentColor">'), '<svg color="red" fill="red">');
});

test('EPS bounds are reset to the whole page', async () => {
  const v = await loadModule('../src/lib/transform/vector.ts', {}, { TextDecoder });
  const eps = '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 18 34 82 66\n%%HiResBoundingBox: 18.00 34.00 82.00 66.00\n%%EndComments\n';
  assert.equal(v.setEpsBounds(eps, 100, 64.5),
    '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 65\n%%HiResBoundingBox: 0 0 100.00 64.50\n%%EndComments\n');
});

test('vector output formats get their own extensions', async () => {
  const f = await load('../src/lib/transform/formats.ts');
  const used = new Set();
  assert.equal(f.outputName('logo.svg', 'svg', used), 'logo.svg');
  assert.equal(f.outputName('logo.eps', 'ai', used), 'logo.ai');
  assert.equal(f.outputName('logo.ai', 'eps', used), 'logo.eps');
  assert.equal(f.isVectorOutput('ai'), true);
  assert.equal(f.isVectorOutput('png'), false);
});

test('EPS bounds prefer the high-resolution bounding box', async () => {
  const v = await loadModule('../src/lib/transform/vector.ts', {}, { TextDecoder });
  assert.deepEqual({ ...v.postscriptBounds('%!PS\n%%BoundingBox: 10 10 110 60\n') }, { width: 100, height: 50 });
  assert.deepEqual(
    { ...v.postscriptBounds('%%BoundingBox: 0 0 101 51\n%%HiResBoundingBox: 0 0 100.5 50.25\n') },
    { width: 100.5, height: 50.25 },
  );
  assert.equal(v.postscriptBounds('%%BoundingBox: (atend)\n'), null);
});
