import { removalPlan, type ModelMode } from './processingPolicy';

export type { ModelMode } from './processingPolicy';

async function getPipeline() {
  const { env, pipeline } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
  }
  return pipeline;
}

let detector: any = null;
let portraitPipe: any = null;

export async function ensureDetector(): Promise<any> {
  if (detector) return detector;
  const pipeline = await getPipeline();
  detector = await pipeline('object-detection', 'Xenova/detr-resnet-50', { dtype: 'fp32' });
  return detector;
}

export async function ensurePortraitPipe(): Promise<any> {
  if (portraitPipe) return portraitPipe;
  const pipeline = await getPipeline();
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
  objectUrl: string,
  lowMemory = false
): Promise<{ blob: Blob; usedModel: string }> {
  const plan = removalPlan(mode, lowMemory);
  if (mode === 'portrait') {
    await ensurePortraitPipe();
    const output = await portraitPipe(objectUrl);
    return { blob: await output.toBlob('image/png'), usedModel: 'People & Portraits' };
  }
  // The general model handles people too. On phones, avoid loading DETR
  // and a second WASM runtime just to choose a segmentation model.
  const hasPerson = plan.detectPerson && await containsPerson(objectUrl);
  if (hasPerson) {
    await ensurePortraitPipe();
    const output = await portraitPipe(objectUrl);
    return { blob: await output.toBlob('image/png'), usedModel: 'Smart · People & Portraits' };
  }
  const { removeBackground } = await import('@imgly/background-removal');
  const blob = await removeBackground(file, {
    model: plan.generalModel,
    device: 'cpu',
    proxyToWorker: false,
    output: { format: 'image/png', quality: 1 },
  });
  return { blob, usedModel: mode === 'auto' ? 'Smart · Objects & Graphics' : 'Objects & Graphics' };
}
