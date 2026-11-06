// Output formats shared by the converter (/convert) and optimizer (/optimize),
// and which processing engine can produce each one.

export type OutputFormat = 'webp' | 'avif' | 'jpeg' | 'png';

interface FormatInfo {
  mime: string;
  ext: string;
  label: string;
  /** Whether `quality` changes the output. PNG is lossless here. */
  lossy: boolean;
  /**
   * Whether Cloudflare's /cdn-cgi/image/ endpoint accepts it as `format=`.
   * The documented values are auto, avif, webp, jpeg, baseline-jpeg and json,
   * so PNG output always runs locally.
   */
  edge: boolean;
}

export const FORMATS: Record<OutputFormat, FormatInfo> = {
  webp: { mime: 'image/webp', ext: 'webp', label: 'WebP', lossy: true,  edge: true },
  avif: { mime: 'image/avif', ext: 'avif', label: 'AVIF', lossy: true,  edge: true },
  jpeg: { mime: 'image/jpeg', ext: 'jpg',  label: 'JPEG', lossy: true,  edge: true },
  png:  { mime: 'image/png',  ext: 'png',  label: 'PNG',  lossy: false, edge: false },
};

export const OUTPUT_FORMATS = Object.keys(FORMATS) as OutputFormat[];

export function isOutputFormat(value: unknown): value is OutputFormat {
  return typeof value === 'string' && value in FORMATS;
}

/** The output format matching a MIME type, or null if we cannot write it. */
export function formatFromMime(mime: string): OutputFormat | null {
  const m = mime.toLowerCase();
  if (m === 'image/jpg' || m === 'image/pjpeg') return 'jpeg';
  return OUTPUT_FORMATS.find((f) => FORMATS[f].mime === m) ?? null;
}

/**
 * The optimizer's "Keep original" choice. JPEG, PNG, WebP and AVIF stay as
 * they are. Anything we cannot encode (GIF, BMP, TIFF, HEIC, ICO) becomes
 * WebP, which is the smallest widely supported format.
 */
export function keepFormatFor(mime: string): OutputFormat {
  return formatFromMime(mime) ?? 'webp';
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|ico|tiff?)$/i;

/** SVG is excluded on purpose: it is not a raster source for these tools. */
export function isRasterImage(file: File): boolean {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) return false;
  return file.type.startsWith('image/') || IMAGE_EXT.test(file.name);
}

/**
 * Download name for a converted file: the original base name with the new
 * extension, de-duplicated within one session ("photo.webp", "photo-2.webp").
 */
export function outputName(originalName: string, format: OutputFormat, used: Set<string>): string {
  const base = originalName
    .replace(/\.[^/.]+$/, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .trim()
    .slice(0, 80) || 'image';
  const ext = FORMATS[format].ext;
  let candidate = `${base}.${ext}`;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base}-${n}.${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '–';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** Signed percentage change from `before` to `after`, e.g. -42 for 42% smaller. */
export function percentChange(before: number, after: number): number {
  if (!before) return 0;
  const pct = Math.round(((after - before) / before) * 100);
  // A non-empty file is never "100% smaller", however small it rounds.
  return after > 0 && pct <= -100 ? -99 : pct;
}
