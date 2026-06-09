/**
 * Output filename generation + deduplication (pure).
 *
 * Turns "My Photo (1).jpg" → "myphot_freeremovebg.png" (or -2, -3… suffix).
 * The caller owns the Set so that dedup state can be reset together with the queue.
 * No DOM, no i18n strings, no side effects beyond mutating the passed Set.
 */

export function buildOutName(originalName: string, usedNames: Set<string>): string {
  const base = originalName.replace(/\.[^/.]+$/, '');
  let stub = base.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toLowerCase();
  if (!stub) stub = 'image';
  let candidate = `${stub}_freeremovebg.png`;
  let n = 2;
  while (usedNames.has(candidate)) {
    candidate = `${stub}-${n}_freeremovebg.png`;
    n++;
  }
  usedNames.add(candidate);
  return candidate;
}
