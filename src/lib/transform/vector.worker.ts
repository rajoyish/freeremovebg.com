/// <reference lib="webworker" />
// The converter's vector engines, off the main thread (see vector.ts):
//
//   Ghostscript  (@jspawn/ghostscript-wasm, AGPL-3.0)  reads EPS and
//                PostScript .ai; writes PNG, PDF and EPS
//   MuPDF        (mupdf, AGPL-3.0)  resizes PDFs and writes SVG
//
// Each downloads the first time a file needs it (Ghostscript 15 MB, MuPDF
// 10 MB) and stays loaded for the rest of the batch. See the notices in
// README.md.

// gs.js is the Emscripten factory itself. The package's gs.mjs wrapper
// smuggles it through a global `exports`, which bundlers break.
// @ts-expect-error: the package ships no types.
import createGhostscript from '@jspawn/ghostscript-wasm/gs.js';
import gsWasmUrl from '@jspawn/ghostscript-wasm/gs.wasm?url';
import { AI_WITHOUT_PDF, setEpsBounds, type VectorJob, type VectorReply } from './vectorJobs';

// ---------------------------------------------------------------------------
// Ghostscript

interface GsInstance {
  FS: { writeFile(path: string, data: Uint8Array): void; readFile(path: string): Uint8Array };
  callMain(args: string[]): number;
}

let gsModule: Promise<WebAssembly.Module> | null = null;

function compileGs(): Promise<WebAssembly.Module> {
  return (gsModule ??= (async () => {
    const res = await fetch(gsWasmUrl);
    if (!res.ok) throw new Error(`Could not load the EPS engine (HTTP ${res.status}).`);
    try {
      return await WebAssembly.compileStreaming(res.clone());
    } catch {
      // Served without application/wasm: compile from the bytes instead.
      return WebAssembly.compile(await res.arrayBuffer());
    }
  })().catch((error) => {
    gsModule = null; // let the next file retry the download
    throw error;
  }));
}

/**
 * Run Ghostscript once on `input` and return the file it writes. Each run
 * needs a fresh instance because Ghostscript's main() can run only once per
 * instance; the compiled module is reused.
 */
async function ghostscript(input: ArrayBuffer, args: string[]): Promise<Uint8Array> {
  const module = await compileGs();
  const log: string[] = [];
  const gs: GsInstance = await createGhostscript({
    noInitialRun: true,
    print: (s: string) => log.push(s),
    printErr: (s: string) => log.push(s),
    instantiateWasm(imports: WebAssembly.Imports, done: (i: WebAssembly.Instance, m: WebAssembly.Module) => void) {
      WebAssembly.instantiate(module, imports).then((instance) => done(instance, module));
      return {};
    },
  });
  gs.FS.writeFile('/in', new Uint8Array(input));
  let code: unknown;
  try {
    code = gs.callMain([
      '-q', '-dSAFER', '-dBATCH', '-dNOPAUSE',
      // Only the first page: an .ai or .ps can hold several.
      '-dFirstPage=1', '-dLastPage=1',
      ...args,
      '-sOutputFile=/out', '/in',
    ]);
  } catch (error) {
    code = error;
  }
  let out: Uint8Array;
  try {
    out = gs.FS.readFile('/out');
  } catch {
    const detail = log.filter(Boolean).slice(-3).join(' ').trim();
    throw new Error(`Ghostscript could not read this file${detail ? `: ${detail}` : ''} (exit ${String(code)}).`);
  }
  if (!out.byteLength) throw new Error('Ghostscript produced an empty file.');
  return out;
}

// ---------------------------------------------------------------------------
// MuPDF

type MuPDF = typeof import('mupdf');
let mupdf: Promise<MuPDF> | null = null;
const loadMupdf = () => (mupdf ??= import('mupdf').catch((error) => {
  mupdf = null;
  throw error;
}));

/** Redraw page 1 of a PDF with its longest side at `target`, as PDF or SVG. */
async function fitPdf(data: ArrayBuffer, target: number, format: 'pdf' | 'svg') {
  const m = await loadMupdf();
  const doc = m.Document.openDocument(new Uint8Array(data), 'application/pdf');
  try {
    const page = doc.loadPage(0);
    // An .ai saved without PDF content; see rasterizePdf in vector.ts.
    if (/saved without PDF Content/i.test(page.toStructuredText('').asText())) throw new Error(AI_WITHOUT_PDF);

    const [x0, y0, x1, y1] = page.getBounds();
    const scale = target / Math.max(x1 - x0, y1 - y0);
    const width = Math.max(1, Math.round((x1 - x0) * scale));
    const height = Math.max(1, Math.round((y1 - y0) * scale));

    const buffer = new m.Buffer();
    // text=path: SVG viewers may not have the PDF's fonts, so glyphs become shapes.
    const writer = new m.DocumentWriter(buffer, format, format === 'svg' ? 'text=path' : 'compress');
    const device = writer.beginPage([0, 0, width, height]);
    const fit = m.Matrix.concat(m.Matrix.translate(-x0, -y0), m.Matrix.scale(width / (x1 - x0), height / (y1 - y0)));
    page.run(device, fit);
    device.close();
    writer.endPage();
    writer.close();
    return { data: buffer.asUint8Array().slice().buffer as ArrayBuffer, width, height };
  } finally {
    doc.destroy();
  }
}

// ---------------------------------------------------------------------------

async function handle(job: VectorJob): Promise<{ data: ArrayBuffer; width?: number; height?: number }> {
  const bytes = (u: Uint8Array) => u.slice().buffer as ArrayBuffer;
  switch (job.op) {
    case 'ps-png':
      return {
        data: bytes(await ghostscript(job.data, [
          '-sDEVICE=pngalpha', `-r${job.dpi.toFixed(3)}`,
          '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4',
          // Crop to the drawing's bounding box rather than a full page.
          ...(job.crop ? ['-dEPSCrop'] : []),
        ])),
      };
    case 'ps-pdf':
      return { data: bytes(await ghostscript(job.data, ['-sDEVICE=pdfwrite', ...(job.crop ? ['-dEPSCrop'] : [])])) };
    case 'pdf-fit':
      return fitPdf(job.data, job.target, job.format);
    case 'pdf-eps': {
      const eps = new TextDecoder('latin1').decode(await ghostscript(job.data, ['-sDEVICE=eps2write']));
      const fixed = setEpsBounds(eps, job.width, job.height);
      // Back to bytes one char per byte, as latin1 decoded them.
      return { data: bytes(Uint8Array.from(fixed, (c) => c.charCodeAt(0))) };
    }
  }
}

self.onmessage = async (e: MessageEvent<VectorJob & { id: number }>) => {
  const { id } = e.data;
  try {
    const { data, width, height } = await handle(e.data);
    self.postMessage({ id, ok: true, data, width, height } satisfies VectorReply, [data]);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies VectorReply);
  }
};
