/**
 * QueueManager - Central state machine for the batch background removal tool.
 *
 * - Owns the queue array, usedNames (for filename dedup), id generation, and currentMode.
 * - Explicitly owns creation + revocation of the long-lived object URLs:
 *   item.originalUrl (card left), item.resultUrl (card right + downloads), and the
 *   short-lived workingUrl for the normalized PNG passed to the ML engines.
 * - Drives state transitions: queued -> analysing/processing -> done/error.
 * - After every relevant state mutation it calls into the injected View modules
 *   (unidirectional data flow). Views are responsible only for DOM creation/mutation
 *   using Tailwind v4 utilities.
 * - Uses the pure core modules for all algorithmic work (no DOM, no I18N inside core).
 *
 * The thin controller in HomePage.astro only instantiates this + the views,
 * wires DOM events to these methods, and supplies the already-parsed I18N strings.
 */

import { normalizeToPng } from './image';
import { isGlitched } from './glitch';
import { buildOutName } from './naming';
import { runRemoval, type ModelMode } from './model';

// The manager receives the already-parsed I18N object (from the #tool-i18n script tag).
// We only access the keys we need; no hard-coded English here.
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
  // plus any others present at runtime
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

function isImageFile(f: File): boolean {
  return f.type.startsWith('image/') || IMAGE_EXT.test(f.name);
}

export class QueueManager {
  private queue: QueueItem[] = [];
  private usedNames = new Set<string>();
  private idCounter = 0;
  private currentMode: ModelMode = 'auto';

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
    // Explicit ownership of URL revocation (memory hygiene).
    for (const item of this.queue) {
      if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    }
    this.queue.length = 0;
    this.usedNames.clear();
    this.idCounter = 0;

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
      this.views.thumbs.removeThumb(id, () => this.reset());
    } else {
      this.views.thumbs.updateCount(this.queue.length);
      if (!this.queue.some(q => q.resultUrl)) {
        // hide results grid if nothing left with results (simple heuristic)
        // The cards view will have already removed; controller can also manage grid visibility via cards.reset partial, but we keep simple:
      }
      this.views.thumbs.removeThumb(id);
    }
  }

  async addFiles(newFiles: File[]) {
    const imgs = newFiles.filter(isImageFile);
    if (!imgs.length) {
      // Use alert for the "no images" case (original behavior); the string comes from i18n.
      // In a real thin setup we could surface via a view, but we preserve the original alert.
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

    const total = newItems.length;
    let done = 0;
    this.views.progress.set(done, total, this.i18n.starting);

    for (const item of newItems) {
      if (!this.queue.includes(item)) {
        done++;
        this.views.progress.set(done, total, this.i18n.processing);
        continue;
      }
      this.views.progress.set(done, total, this.i18n.processing);
      try {
        await this.processItem(item);
      } catch (err) {
        console.error(`Skipping ${item.file.name}:`, err);
        // Preserve original generic error toast (not one of the build-time i18n keys for main flow).
        this.views.showToast('An error occurred. Please try again after some time.');
      }
      done++;
      this.views.progress.set(done, total, done === total ? this.i18n.allDone : this.i18n.processing);
    }

    if (done === total) {
      this.views.progress.scheduleHide(2000);
    }
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
    const originalUrl = URL.createObjectURL(item.file);
    item.originalUrl = originalUrl;
    let workingUrl: string | null = null;

    try {
      const pngBlob = await normalizeToPng(item.file);
      workingUrl = URL.createObjectURL(pngBlob);

      // Tell views about the upcoming work (status + messages are driven here from i18n).
      if (this.currentMode === 'portrait') {
        this.views.thumbs.setStatus(item.id, 'processing');
      } else if (this.currentMode === 'general') {
        this.views.thumbs.setStatus(item.id, 'processing');
      } else {
        this.views.thumbs.setStatus(item.id, 'analysing');
      }

      const { blob, usedModel } = await runRemoval(this.currentMode, pngBlob, workingUrl);

      const glitched = await isGlitched(blob);
      if (glitched) {
        this.views.showToast(`"${item.file.name}" ${this.i18n.glitchWarning}`);
      }

      const resultUrl = URL.createObjectURL(blob);
      const name = buildOutName(item.file.name, this.usedNames);
      item.resultUrl = resultUrl;
      item.outName = name;
      item.blob = blob;

      // Create card via view (unidirectional). Store the returned element for later removal.
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

      this.views.thumbs.setStatus(item.id, 'done');
    } catch (err) {
      this.views.thumbs.setStatus(item.id, 'error');
      throw err;
    } finally {
      if (workingUrl) URL.revokeObjectURL(workingUrl);
    }
  }
}
