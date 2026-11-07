// Vector sources for the converter (/convert): SVG, Adobe Illustrator (.ai) and
// EPS. A vector has no fixed size, so every conversion redraws the file at the
// size the visitor picks, from a 16 px icon up to 8192 px.
//
// Raster output (PNG, JPEG, WebP, AVIF) is drawn here and handed on as a PNG
// to the same pipeline as a photo:
//
//   SVG                  the browser's own renderer, through an <img>
//   AI, PDF-compatible   pdf.js. Illustrator has saved a PDF inside every .ai
//                        file by default since CS, so this covers almost all
//   EPS, PostScript AI   Ghostscript (vector.worker.ts)
//
// Vector output (SVG, EPS, AI) stays vector throughout. Every route meets at
// a PDF of the requested size:
//
//   SVG in        resized markup; for EPS and AI, svg2pdf.js draws it as a PDF
//   AI in         already a PDF
//   EPS in        Ghostscript pdfwrite
//   PDF  ->  SVG  MuPDF's SVG writer, resized on the way (vector.worker.ts)
//   PDF  ->  AI   MuPDF rewrites the page at the new size. A PDF-compatible
//                 file is what Illustrator itself writes as .ai
//   PDF  ->  EPS  Ghostscript eps2write
//
// The engines load only when a file needs them. Everything runs on the
// visitor's device: no vector file is ever uploaded.

import type { VectorOutput } from './formats';
import { AI_WITHOUT_PDF, type VectorJob, type VectorReply } from './vectorJobs';

export { AI_WITHOUT_PDF, setEpsBounds } from './vectorJobs';

export type VectorKind = 'svg' | 'pdf' | 'postscript';

/** Size range for the size slider: the longest side, in pixels. */
export const MIN_VECTOR_SIZE = 16;
export const MAX_VECTOR_SIZE = 8192;
export const DEFAULT_VECTOR_SIZE = 1024;
/** One-click sizes for icons. */
export const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512] as const;

/** Slider positions run 0…SLIDER_STEPS on a logarithmic scale, so 16–64 px get as much travel as 2048–8192. */
export const SLIDER_STEPS = 1000;
const SIZE_RATIO = MAX_VECTOR_SIZE / MIN_VECTOR_SIZE;

export function clampVectorSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_VECTOR_SIZE;
  return Math.min(MAX_VECTOR_SIZE, Math.max(MIN_VECTOR_SIZE, Math.round(size)));
}

export function sliderToSize(position: number): number {
  const t = Math.min(1, Math.max(0, position / SLIDER_STEPS));
  return clampVectorSize(MIN_VECTOR_SIZE * SIZE_RATIO ** t);
}

export function sizeToSlider(size: number): number {
  return Math.round((Math.log(clampVectorSize(size) / MIN_VECTOR_SIZE) / Math.log(SIZE_RATIO)) * SLIDER_STEPS);
}

/**
 * Canvas area cap. iOS Safari refuses canvases above about 16.7 megapixels,
 * so a wide or square drawing at 8192 px is scaled down to fit under it.
 * Vector output has no such limit.
 */
const MAX_PIXELS = 16_777_216;

const VECTOR_EXT = /\.(svg|ai|eps|epsf|epsi|ps)$/i;
const VECTOR_TYPES = new Set([
  'image/svg+xml',
  'application/postscript',
  'application/illustrator',
  'application/eps',
  'application/x-eps',
  'image/eps',
  'image/x-eps',
]);

/** Whether a file looks like SVG, AI or EPS from its name or type alone. */
export function isVectorImage(file: Pick<File, 'name' | 'type'>): boolean {
  return VECTOR_EXT.test(file.name) || VECTOR_TYPES.has(file.type.toLowerCase());
}

// Enough to get past an SVG's XML declaration, doctype and licence comment.
const SNIFF_BYTES = 4096;

/**
 * What a vector file actually holds, from its first bytes. The extension is
 * not enough: an .ai file is a PDF or PostScript depending on how it was
 * saved, and an .eps may start with a binary DOS header.
 */
export function sniffVector(head: Uint8Array, name = ''): VectorKind | null {
  const text = new TextDecoder('latin1').decode(head.subarray(0, SNIFF_BYTES));
  // DOS EPS binary header: C5 D0 D3 C6, then the PostScript and a preview.
  if (head[0] === 0xc5 && head[1] === 0xd0 && head[2] === 0xd3 && head[3] === 0xc6) return 'postscript';
  if (text.includes('%PDF-')) return 'pdf';
  if (/^\s*%!/.test(text)) return 'postscript';
  if (/<svg[\s>]/i.test(text) || /\.svg$/i.test(name)) return 'svg';
  return null;
}

/**
 * Output size for a drawing of `w`×`h` units scaled so its longest side is
 * `target`. `capPixels` holds raster output under the canvas area cap.
 */
export function fitVector(w: number, h: number, target: number, capPixels = true): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) { w = 1; h = 1; }
  let scale = target / Math.max(w, h);
  if (capPixels && w * scale * h * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (w * h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

// ---------------------------------------------------------------------------
// SVG

/** A length attribute in px, or null for percentages and anything unusable. */
function svgLength(value: string | null): number | null {
  if (!value) return null;
  const m = value.trim().match(/^([\d.]+(?:e[+-]?\d+)?)\s*(px|pt|pc|mm|cm|in|em|ex)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] || 'px').toLowerCase();
  const perUnit: Record<string, number> = {
    px: 1, pt: 4 / 3, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, em: 16, ex: 8,
  };
  const px = n * perUnit[unit];
  return Number.isFinite(px) && px > 0 ? px : null;
}

/**
 * Strip what could run code or reach the network once the SVG is handed to
 * a renderer: scripts, embedded HTML, event handlers, and links that are not
 * in-document references or data: URLs.
 */
function sanitizeSvg(svg: Element) {
  svg.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((el) => el.remove());
  for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      else if ((name === 'href' || name === 'xlink:href') && !/^(#|data:image\/)/i.test(value)) el.removeAttribute(attr.name);
    }
  }
}

export interface SizedSvg {
  markup: string;
  width: number;
  height: number;
}

/**
 * The SVG's intrinsic size, then the same markup with explicit pixel width
 * and height at the target size, so it renders, and opens elsewhere, at that
 * size rather than at the browser's default 300×150 or a tiny icon size.
 */
export function sizeSvg(markup: string, target: number, capPixels = true): SizedSvg {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) {
    throw new Error('This SVG file could not be read.');
  }
  sanitizeSvg(svg);

  const box = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const hasBox = box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0;
  let w = svgLength(svg.getAttribute('width'));
  let h = svgLength(svg.getAttribute('height'));
  if (hasBox) {
    const ratio = box[2] / box[3];
    if (w && !h) h = w / ratio;
    else if (h && !w) w = h * ratio;
    else if (!w && !h) { w = box[2]; h = box[3]; }
  }
  if (!w || !h) { w = 300; h = 150; } // the CSS default for a replaced element
  if (!hasBox) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  const size = fitVector(w, h, target, capPixels);
  svg.setAttribute('width', String(size.width));
  svg.setAttribute('height', String(size.height));
  return { markup: new XMLSerializer().serializeToString(doc), ...size };
}

/**
 * SVG files from pasted text, one per `<svg>…</svg>` block, so icon code
 * copied from a website converts like a dropped file. Each takes its name
 * from the comment just before it (`<!-- Heroicons -->` → heroicons.svg),
 * else from its class (`bi bi-vector-pen` → bi-vector-pen.svg), else "icon".
 */
export function svgsFromText(text: string): File[] {
  const files: File[] = [];
  const re = /(?:<!--([\s\S]*?)-->\s*)?(<svg\b[\s\S]*?<\/svg\s*>)/gi;
  for (const m of text.matchAll(re)) {
    let markup = m[2];
    // Pasted icon code often leaves out the namespace, which a file needs.
    if (!/\sxmlns\s*=/.test(markup.slice(0, markup.indexOf('>')))) {
      markup = markup.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const cls = markup.match(/^<svg\b[^>]*\sclass\s*=\s*["']([^"']+)["']/i)?.[1].trim().split(/\s+/).pop();
    const slug = (m[1] || cls || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'icon';
    files.push(new File([markup], `${slug}.svg`, { type: 'image/svg+xml' }));
  }
  return files;
}

/**
 * Icon sets draw with `currentColor` so a page's CSS can colour them. On its
 * own an SVG has no surrounding text colour, so it means the root's `color`
 * attribute, or black, as every browser shows it.
 */
export function resolveCurrentColor(markup: string): string {
  const color = markup.match(/<svg\b[^>]*\scolor\s*=\s*["']([^"']+)["']/i)?.[1] || '#000000';
  return markup.replace(/currentColor/gi, color);
}

async function rasterizeSvg(file: File, target: number): Promise<Blob> {
  const sized = sizeSvg(await file.text(), target);
  const url = URL.createObjectURL(new Blob([sized.markup], { type: 'image/svg+xml' }));
  const img = new Image();
  try {
    img.decoding = 'async';
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error('This SVG file could not be drawn.');
    }
    const canvas = newCanvas(sized.width, sized.height);
    try {
      canvas.getContext('2d')!.drawImage(img, 0, 0, sized.width, sized.height);
      return await canvasToPng(canvas);
    } finally {
      releaseCanvas(canvas);
    }
  } finally {
    URL.revokeObjectURL(url);
    img.src = '';
  }
}

/** A sized SVG as a one-page PDF of the same size (1 px = 1 pt). */
async function svgToPdf(sized: SizedSvg): Promise<ArrayBuffer> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const { width, height } = sized;
  const pdf = new jsPDF({ orientation: width > height ? 'l' : 'p', unit: 'pt', format: [width, height], compress: true });
  const doc = new DOMParser().parseFromString(resolveCurrentColor(sized.markup), 'image/svg+xml');
  // Detached from the page on purpose, so nothing in the file can run.
  await svg2pdf(doc.documentElement, pdf, { x: 0, y: 0, width, height, loadExternalStyleSheets: false, loadImages: /^data:/ });
  return pdf.output('arraybuffer');
}

// ---------------------------------------------------------------------------
// AI (PDF-compatible)


async function rasterizePdf(file: File, target: number): Promise<Blob> {
  const [pdfjs, { default: workerSrc }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let canvas: HTMLCanvasElement | null = null;
  try {
    const doc = await task.promise;
    // Page 1 is the first artboard.
    const page = await doc.getPage(1);
    // An .ai saved without "Create PDF Compatible File" still opens as a PDF,
    // but its only page is Illustrator's notice saying so. Drawing that
    // notice as if it were the artwork would be worse than failing.
    const text = await page.getTextContent();
    const words = text.items.map((i) => ('str' in i ? i.str : '')).join(' ');
    if (/saved without PDF Content/i.test(words)) throw new Error(AI_WITHOUT_PDF);
    const base = page.getViewport({ scale: 1 });
    const size = fitVector(base.width, base.height, target);
    const viewport = page.getViewport({ scale: size.width / base.width });
    canvas = newCanvas(Math.round(viewport.width), Math.round(viewport.height));
    // Transparent, not pdf.js's default white page, so artboards with no
    // background stay transparent in PNG, WebP and AVIF.
    await page.render({ canvas, viewport, background: 'rgba(0,0,0,0)' }).promise;
    return await canvasToPng(canvas);
  } finally {
    if (canvas) releaseCanvas(canvas);
    void task.destroy();
  }
}

// ---------------------------------------------------------------------------
// The worker: Ghostscript for PostScript, MuPDF for resizing PDFs and SVG output

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (r: VectorReply & { ok: true }) => void; reject: (e: Error) => void }>();
const JOB_TIMEOUT_MS = 180_000;

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./vector.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<VectorReply>) => {
    const job = pending.get(e.data.id);
    if (!job) return;
    pending.delete(e.data.id);
    if (e.data.ok) job.resolve(e.data);
    else job.reject(new Error(e.data.error));
  };
  w.onerror = (e) => {
    e.preventDefault();
    const error = new Error(e.message || 'The vector engine crashed.');
    pending.forEach((job) => job.reject(error));
    pending.clear();
    w.terminate();
    if (worker === w) worker = null;
  };
  return (worker = w);
}

function runJob(job: VectorJob): Promise<VectorReply & { ok: true }> {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('The conversion timed out.'));
    }, JOB_TIMEOUT_MS);
    pending.set(id, {
      resolve: (r) => { clearTimeout(timer); resolve(r); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    getWorker().postMessage({ id, ...job }, [job.data]);
  });
}

// ---------------------------------------------------------------------------
// EPS and PostScript AI

/**
 * The drawing's size in points from its %%HiResBoundingBox or %%BoundingBox
 * comment, or null if the header has neither.
 */
export function postscriptBounds(text: string): { width: number; height: number } | null {
  const re = /^%%(?:HiRes)?BoundingBox:\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/gm;
  let best: { width: number; height: number } | null = null;
  for (const m of text.matchAll(re)) {
    const [x1, y1, x2, y2] = m.slice(1, 5).map(Number);
    const width = x2 - x1;
    const height = y2 - y1;
    if (width > 0 && height > 0) {
      best = { width, height };
      if (m[0].includes('HiRes')) break; // the precise one wins
    }
  }
  return best;
}

/** The PostScript section of an EPS, skipping a DOS binary header if present. */
function postscriptText(bytes: Uint8Array): string {
  let start = 0;
  let end = Math.min(bytes.length, 64 * 1024);
  if (bytes[0] === 0xc5 && bytes[1] === 0xd0) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    start = view.getUint32(4, true);
    end = Math.min(bytes.length, start + 64 * 1024);
  }
  return new TextDecoder('latin1').decode(bytes.subarray(start, end));
}

async function rasterizePostscript(file: File, target: number): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const bounds = postscriptBounds(postscriptText(bytes));
  // Ghostscript takes a resolution, not a size: 72 dpi is one pixel per
  // point. With no bounding box, assume a US Letter page.
  const points = bounds ?? { width: 612, height: 792 };
  const size = fitVector(points.width, points.height, target);
  const dpi = Math.max(1, (size.width / points.width) * 72);
  const { data } = await runJob({ op: 'ps-png', data: bytes.buffer, dpi, crop: !!bounds });
  return new Blob([data], { type: 'image/png' });
}

// ---------------------------------------------------------------------------

function newCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  if (!canvas.getContext('2d')) throw new Error('Canvas 2D context is unavailable in this browser.');
  return canvas;
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the vector image.'))), 'image/png'));
}

async function kindOf(file: File): Promise<VectorKind> {
  const kind = sniffVector(new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer()), file.name);
  if (!kind) throw new Error(`"${file.name}" is not an SVG, AI or EPS file this tool can read.`);
  return kind;
}

const baseName = (name: string) => name.replace(/\.[^/.]+$/, '') || 'image';

/**
 * Draw a vector file as a PNG whose longest side is `target` pixels (less if
 * that would exceed the canvas area cap). The result keeps the original base
 * name, so download names follow the source file.
 */
export async function rasterizeVector(file: File, target: number): Promise<File> {
  const kind = await kindOf(file);
  const png = kind === 'svg' ? await rasterizeSvg(file, target)
    : kind === 'pdf' ? await rasterizePdf(file, target)
    : await rasterizePostscript(file, target);
  return new File([png], `${baseName(file.name)}.png`, { type: 'image/png' });
}

export const VECTOR_MIME: Record<VectorOutput, string> = {
  svg: 'image/svg+xml',
  eps: 'application/postscript',
  // An .ai with PDF content, as Illustrator writes it by default.
  ai: 'application/illustrator',
};

/**
 * Convert a vector file to another vector format (or the same one, resized)
 * with its longest side at `target` px. EPS and AI measure in points; one
 * point per pixel, so a 64 px icon gets a 64×64 artboard.
 */
export async function convertVector(file: File, format: VectorOutput, target: number): Promise<Blob> {
  const kind = await kindOf(file);
  const type = VECTOR_MIME[format];

  let pdf: ArrayBuffer;
  let size: { width: number; height: number };
  if (kind === 'svg') {
    const sized = sizeSvg(await file.text(), target, false);
    if (format === 'svg') return new Blob([sized.markup], { type });
    pdf = await svgToPdf(sized);
    size = sized;
  } else {
    let source = await file.arrayBuffer();
    if (kind === 'postscript') {
      const crop = !!postscriptBounds(postscriptText(new Uint8Array(source)));
      source = (await runJob({ op: 'ps-pdf', data: source, crop })).data;
    }
    const fitted = await runJob({ op: 'pdf-fit', data: source, target, format: format === 'svg' ? 'svg' : 'pdf' });
    if (format === 'svg') return new Blob([fitted.data], { type });
    pdf = fitted.data;
    size = { width: fitted.width!, height: fitted.height! };
  }

  if (format === 'ai') return new Blob([pdf], { type });
  const eps = await runJob({ op: 'pdf-eps', data: pdf, width: size.width, height: size.height });
  return new Blob([eps.data], { type });
}
