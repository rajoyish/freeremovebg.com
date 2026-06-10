import { pipeline } from '@huggingface/transformers';
import { removeBackground } from '@imgly/background-removal';

export type ModelMode = 'auto' | 'portrait' | 'general';

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

  const hasPerson = await containsPerson(objectUrl);
  if (hasPerson) {
    await ensurePortraitPipe();
    const output = await portraitPipe(objectUrl);
    return { blob: await output.toBlob('image/png'), usedModel: 'Smart · People & Portraits' };
  }
  const blob = await removeBackground(file, { model: 'isnet_fp16', output: { format: 'image/png', quality: 1 } });
  return { blob, usedModel: 'Smart · Objects & Graphics' };
}
