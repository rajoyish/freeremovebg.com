import { normalizeToPng } from './image';
import { isGlitched } from './glitch';
import { buildOutName } from './naming';
import type { ModelMode } from './model';
import { runRemovalInWorker } from './removalClient';
import { recordSuccessfulCutout } from '../counter';
import { MOBILE_MAX_DIMENSION, needsLowMemoryProcessing } from './processingPolicy';

type ReceivedI18n = {
  starting: string;
  processing: string;
  allDone: string;
  glitchWarning: string;
  selectImages: string;
  removeImage: string;
  imagesSelected: string;
  imageSelected: string;
  original: string;
  removed: string;
  downloadPng: string;
  status: { queued: string; analysing: string; processing: string; done: string; error: string };
} & Record<string, any>;

export type ThumbStatus = 'queued' | 'analysing' | 'processing' | 'done' | 'error';

export interface QueueItem {
  id: string;
  file: File;
  status: ThumbStatus;
  originalUrl?: string;
  resultUrl?: string;
  outName?: string;
  blob?: Blob;
  cardEl?: HTMLElement;
}

interface ToolViews {
  thumbs: {
    addThumb: (item: { id: string; file: File; status: ThumbStatus }) => void;
    setStatus: (id: string, status: ThumbStatus) => void;
    setPreview: (id: string, url: string) => void;
    removeThumb: (id: string, done?: () => void) => void;
    showInZone: (items: Array<{ id: string; file: File; status: ThumbStatus }>, total: number) => void;
    updateCount: (n: number) => void;
    reset: () => void;
  };
  cards: {
    addCard: (
      name: string,
      originalUrl: string,
      processedUrl: string,
      modelLabel: string,
      onDownload: (name: string, url: string) => void
    ) => HTMLElement;
    removeCard: (cardEl?: HTMLElement) => void;
    reset: () => void;
  };
  progress: {
    show: () => void;
    hide: () => void;
    set: (done: number, total: number, msg: string) => void;
    scheduleHide: (delayMs?: number) => void;
  };
  showToast: (message: string) => void;
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|svg|ico|tiff?)$/i;

export function isImageFile(f: File): boolean {
  return f.type.startsWith('image/') || IMAGE_EXT.test(f.name);
}

export class QueueManager {
  private queue: QueueItem[] = [];
  private usedNames = new Set<string>();
  private idCounter = 0;
  private currentMode: ModelMode = 'auto';
  private processing: Promise<void> | null = null;
  private lowMemory = needsLowMemoryProcessing();

  constructor(
    private views: ToolViews,
    private i18n: ReceivedI18n
  ) {}

  setMode(mode: ModelMode) {
    this.currentMode = mode;
  }

  getMode(): ModelMode {
    return this.currentMode;
  }

  reset() {
    for (const item of this.queue) {
      if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    }
    this.queue.length = 0;
    this.usedNames.clear();

    this.views.thumbs.reset();
    this.views.cards.reset();
    this.views.progress.hide();
  }

  remove(id: string) {
    const idx = this.queue.findIndex(q => q.id === id);
    if (idx === -1) return;
    const item = this.queue[idx];
    if (item.status !== 'queued' && item.status !== 'error') return; // guard

    if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
    if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    if (item.outName) this.usedNames.delete(item.outName);

    this.views.cards.removeCard(item.cardEl);
    this.queue.splice(idx, 1);

    if (this.queue.length === 0) {
      this.views.thumbs.removeThumb(id, () => {
        if (this.queue.length === 0) this.reset();
      });
    } else {
      this.views.thumbs.updateCount(this.queue.length);
      this.views.thumbs.removeThumb(id);
    }
  }

  async addFiles(newFiles: File[]) {
    const imgs = newFiles.filter(isImageFile);
    if (!imgs.length) {
      alert(this.i18n.selectImages);
      return;
    }

    const newItems: QueueItem[] = imgs.map(file => ({
      id: this.nextId(),
      file,
      status: 'queued' as ThumbStatus,
    }));
    this.queue.push(...newItems);

    this.views.thumbs.showInZone(newItems, this.queue.length);
    this.views.progress.show();

    // Every upload joins the same drain, including files added during loading.
    if (!this.processing) {
      this.processing = this.drain().finally(() => { this.processing = null; });
    }
    await this.processing;
  }

  private async drain(): Promise<void> {
    let item: QueueItem | undefined;
    while ((item = this.queue.find(q => q.status === 'queued'))) {
      this.updateProgress(this.i18n.processing);
      try {
        await this.processItem(item);
      } catch (err) {
        console.error(`Skipping ${item.file.name}:`, err);
        this.views.showToast('An error occurred. Please try again after some time.');
      }
      this.updateProgress(this.i18n.processing);
    }
    this.updateProgress(this.i18n.allDone);
    this.views.progress.scheduleHide(2000);
  }

  private updateProgress(message: string) {
    const done = this.queue.filter(q => q.status === 'done' || q.status === 'error').length;
    this.views.progress.set(done, this.queue.length, message);
  }

  private setStatus(item: QueueItem, status: ThumbStatus) {
    item.status = status;
    this.views.thumbs.setStatus(item.id, status);
  }

  async downloadAll() {
    const ready = this.queue.filter(q => q.blob && q.outName);
    if (!ready.length) return;

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    ready.forEach(({ outName, blob }) => zip.file(outName!, blob!));
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'freeremovebg.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private nextId(): string {
    return `img-${++this.idCounter}`;
  }

  private async processItem(item: QueueItem): Promise<void> {
    const mode = this.currentMode;
    this.setStatus(item, mode === 'auto' && !this.lowMemory ? 'analysing' : 'processing');

    try {
      const pngBlob = await normalizeToPng(item.file, this.lowMemory ? MOBILE_MAX_DIMENSION : Infinity);
      if (!this.queue.includes(item)) return;
      // Mobile previews must not decode the original camera image again.
      const originalUrl = URL.createObjectURL(this.lowMemory ? pngBlob : item.file);
      item.originalUrl = originalUrl;
      this.views.thumbs.setPreview(item.id, originalUrl);

      const { blob, usedModel } = await runRemovalInWorker(mode, pngBlob, this.lowMemory);
      if (!this.queue.includes(item)) return;

      const glitched = await isGlitched(blob);
      if (!this.queue.includes(item)) return;
      if (glitched) {
        this.views.showToast(`"${item.file.name}" ${this.i18n.glitchWarning}`);
      }

      const resultUrl = URL.createObjectURL(blob);
      const name = buildOutName(item.file.name, this.usedNames);
      item.resultUrl = resultUrl;
      item.outName = name;
      item.blob = blob;

      item.cardEl = this.views.cards.addCard(
        name,
        originalUrl,
        resultUrl,
        usedModel,
        (n, u) => {
          const a = document.createElement('a');
          a.href = u;
          a.download = n;
          a.click();
        }
      );

      this.setStatus(item, 'done');
      recordSuccessfulCutout();
    } catch (err) {
      if (this.queue.includes(item)) this.setStatus(item, 'error');
      throw err;
    }
  }
}
