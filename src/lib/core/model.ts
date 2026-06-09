/**
 * Model loading, routing, and selection logic (smart / general / portrait).
 *
 * Encapsulates:
 * - Lazy loading of the two pipelines (detector for "smart" person detection,
 *   portraitPipe for MODNet hair/fine-edge removal).
 * - The decision tree: explicit portrait, explicit general, or auto (detect
 *   then pick).
 * - The actual calls into @huggingface/transformers and @imgly/background-removal.
 *
 * Design for Phase 1 (pure logic extraction):
 * - ZERO references to application UI DOM (no document.getElement*, no
 *   loadingText, no setThumbStatus, no I18N).
 * - All strings that reach the user (model labels in cards) are the same
 *   English identifiers that were already present in the original monolithic
 *   script. Status / toast strings remain the caller's responsibility and
 *   come exclusively from the injected #tool-i18n JSON.
 * - Heavy library imports live here; the manualChunks strategy in astro.config
 *   continues to match on the package id strings in the module graph.
 * - Callers (the orchestrator) own UI state transitions and pass currentMode.
 */

import { pipeline } from '@huggingface/transformers';
import { removeBackground } from '@imgly/background-removal';

export type ModelMode = 'auto' | 'portrait' | 'general';

// Module-private caches. Loaded once, reused for the lifetime of the page.
let detector: any = null;
let portraitPipe: any = null;

export async function ensureDetector(): Promise<any> {
  if (detector) return detector;
  detector = await pipeline('object-detection', 'Xenova/detr-resnet-50', { dtype: 'fp32' });
  return detector;
}

export async function ensurePortraitPipe(): Promise<any> {
  if (portraitPipe) return portraitPipe;
  portraitPipe = await pipeline('background-removal', 'Xenova/modnet', { dtype: 'fp32' });
  return portraitPipe;
}

export async function containsPerson(objectUrl: string): Promise<boolean> {
  const det = await ensureDetector();
  const dets = await det(objectUrl, { threshold: 0.5 }) as Array<{ label: string }>;
  return dets.some(d => d.label.toLowerCase() === 'person');
}

/**
 * Execute background removal for one item according to the chosen mode.
 * The caller is responsible for:
 *   - Updating thumb/card status
 *   - Setting transient loadingText via I18N (preparingDetection, loadingPortrait, removingBackground, analysingImage)
 *   - Creating the short-lived workingUrl and revoking it
 *   - Post-processing (glitch check, result URL, card, etc.)
 *
 * Returns the processed PNG blob + a human label for the model that was used.
 */
export async function runRemoval(
  mode: ModelMode,
  file: Blob,
  objectUrl: string
): Promise<{ blob: Blob; usedModel: string }> {
  if (mode === 'portrait') {
    await ensurePortraitPipe();
    const output = await portraitPipe(objectUrl);
    return { blob: await output.toBlob('image/png'), usedModel: 'People & Portraits' };
  }
  if (mode === 'general') {
    const blob = await removeBackground(file, { model: 'isnet_fp16', output: { format: 'image/png', quality: 1 } });
    return { blob, usedModel: 'Objects & Graphics' };
  }

  // 'auto' — routing decision
  const hasPerson = await containsPerson(objectUrl);
  if (hasPerson) {
    await ensurePortraitPipe();
    const output = await portraitPipe(objectUrl);
    return { blob: await output.toBlob('image/png'), usedModel: 'Smart · People & Portraits' };
  }
  const blob = await removeBackground(file, { model: 'isnet_fp16', output: { format: 'image/png', quality: 1 } });
  return { blob, usedModel: 'Smart · Objects & Graphics' };
}
