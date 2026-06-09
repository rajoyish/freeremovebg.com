/**
 * Glitch / corruption heuristic (canvas analysis + flood fill).
 *
 * Detects obviously broken output from the ONNX threading race (disconnected
 * islands or ragged left/right silhouette edges). Used as a post-process check
 * so we can warn the user instead of serving garbage cutouts.
 *
 * IMPORTANT:
 * - ZERO references to application UI DOM (no getElement*, no app elements).
 * - Only temporary canvas + Image for pixel analysis.
 * - Creates a short-lived object URL that is revoked in finally.
 * - Analysis canvas is zeroed on exit.
 */

export async function isGlitched(blob: Blob): Promise<boolean> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  let canvas: HTMLCanvasElement | null = null;
  try {
    img.src = url;
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w < 48 || h < 48) return false;

    const scale = Math.min(1, 256 / w);
    const gw = Math.max(1, Math.round(w * scale));
    const gh = Math.max(1, Math.round(h * scale));
    canvas = document.createElement('canvas');
    canvas.width = gw;
    canvas.height = gh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, gw, gh);
    const { data } = ctx.getImageData(0, 0, gw, gh);

    const n = gw * gh;
    const mask = new Uint8Array(n);
    let totalOpaque = 0;
    for (let i = 0; i < n; i++) {
      if (data[i * 4 + 3] > 32) { mask[i] = 1; totalOpaque++; }
    }
    const opaqueRatio = totalOpaque / n;
    if (opaqueRatio < 0.02 || opaqueRatio > 0.98) return false;

    // Signal A: connected components via 8-connectivity iterative flood fill.
    const labels = new Int32Array(n).fill(-1);
    const stack: number[] = [];
    const areas: number[] = [];
    for (let start = 0; start < n; start++) {
      if (!mask[start] || labels[start] !== -1) continue;
      const id = areas.length;
      let area = 0;
      stack.push(start);
      labels[start] = id;
      while (stack.length) {
        const p = stack.pop()!;
        area++;
        const px = p % gw;
        const py = (p / gw) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
            const q = ny * gw + nx;
            if (mask[q] && labels[q] === -1) { labels[q] = id; stack.push(q); }
          }
        }
      }
      areas.push(area);
    }

    const maxArea = areas.length ? areas.reduce((m, a) => (a > m ? a : m), 0) : 0;
    const strayArea = totalOpaque - maxArea;
    const minIsland = totalOpaque * 0.003;
    const significant = areas.filter(a => a >= minIsland).length;
    const glitchByIslands = significant >= 2 && strayArea >= totalOpaque * 0.03;

    // Signal B: ragged silhouette boundary (left/right edge jumps).
    let prevL = -1, prevR = -1, jumps = 0;
    const jumpThresh = gw * 0.12;
    for (let y = 0; y < gh; y++) {
      let l = -1, r = -1;
      const rowStart = y * gw;
      for (let x = 0; x < gw; x++) {
        if (mask[rowStart + x]) { if (l === -1) l = x; r = x; }
      }
      if (l !== -1 && prevL !== -1) {
        if (Math.abs(l - prevL) > jumpThresh || Math.abs(r - prevR) > jumpThresh) jumps++;
      }
      prevL = l; prevR = r;
    }
    const glitchByBoundary = jumps >= 6;

    return glitchByIslands || glitchByBoundary;
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    img.src = '';
  }
}
