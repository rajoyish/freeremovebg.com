// What vector.ts and vector.worker.ts share. Kept apart from vector.ts so the
// worker does not import the module that starts it.

export const AI_WITHOUT_PDF = 'This Illustrator file was saved without PDF content.';

export type VectorJob =
  | { op: 'ps-png'; data: ArrayBuffer; dpi: number; crop: boolean }
  | { op: 'ps-pdf'; data: ArrayBuffer; crop: boolean }
  | { op: 'pdf-fit'; data: ArrayBuffer; target: number; format: 'pdf' | 'svg' }
  | { op: 'pdf-eps'; data: ArrayBuffer; width: number; height: number };

export type VectorReply =
  | { id: number; ok: true; data: ArrayBuffer; width?: number; height?: number }
  | { id: number; ok: false; error: string };

/**
 * Ghostscript's eps2write sets the bounding box to the drawn marks, which
 * would drop an icon's padding. The page starts at 0,0, so the box is reset
 * to the whole page.
 */
export function setEpsBounds(eps: string, width: number, height: number): string {
  return eps
    .replace(/^%%BoundingBox:.*$/m, `%%BoundingBox: 0 0 ${Math.ceil(width)} ${Math.ceil(height)}`)
    .replace(/^%%HiResBoundingBox:.*$/m, `%%HiResBoundingBox: 0 0 ${width.toFixed(2)} ${height.toFixed(2)}`);
}
