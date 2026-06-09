/**
 * ThumbsView - View module for the upload zone thumbnails + count + zone state.
 *
 * Responsibilities (vanilla, unidirectional):
 * - Creates and mutates the thumb DOM nodes using only Tailwind v4 utility classes
 *   (plus the existing 'thumb-removing' animation trigger from global.css).
 * - Owns the short-lived preview object URLs for the <img> tags (revoked on load/error).
 * - Handles status badge updates, remove button visibility, and the remove animation.
 * - Toggles the zone empty/filled + has-files classes on the upload zone.
 *
 * Accepts data (QueueItem snapshots + I18n) and an onRemove callback.
 * The QueueManager drives updates by calling these methods after mutating its state.
 */

// ThumbStatus is the same union used by QueueManager. Duplicated here for view layer
// independence (avoids import cycles at type level). Keep in sync with core.
export type ThumbStatus = 'queued' | 'analysing' | 'processing' | 'done' | 'error';

export interface ToolI18n {
  removeImage: string;
  imagesSelected: string;
  imageSelected: string;
  status: { queued: string; analysing: string; processing: string; done: string; error: string };
}

interface ThumbsViewElements {
  thumbGrid: HTMLElement;
  zoneCount: HTMLElement;
  zoneEmpty: HTMLElement;
  zoneFilled: HTMLElement;
  uploadZone: HTMLElement;
}

const STATUS: Record<ThumbStatus, { bg: string; labelKey: keyof ToolI18n['status'] }> = {
  queued:     { bg: 'bg-black/45',        labelKey: 'queued' },
  analysing:  { bg: 'bg-amber-500/90',    labelKey: 'analysing' },
  processing: { bg: 'bg-link/90',         labelKey: 'processing' },
  done:       { bg: 'bg-emerald-500/85',  labelKey: 'done' },
  error:      { bg: 'bg-error/85',        labelKey: 'error' },
};
const ALL_STATUS_BG = ['bg-black/45', 'bg-amber-500/90', 'bg-link/90', 'bg-emerald-500/85', 'bg-error/85'];

export class ThumbsView {
  private onRemove: (id: string) => void = () => {};

  constructor(
    private els: ThumbsViewElements,
    private i18n: ToolI18n,
    onRemove?: (id: string) => void
  ) {
    if (onRemove) this.onRemove = onRemove;
  }

  setOnRemove(fn: (id: string) => void) {
    this.onRemove = fn;
  }

  addThumb(item: { id: string; file: File; status: ThumbStatus }) {
    const wrap = document.createElement('div');
    wrap.id = `thumb-${item.id}`;
    wrap.className = 'relative aspect-square rounded-md overflow-hidden bg-canvas-soft-2';

    const img = document.createElement('img');
    const objUrl = URL.createObjectURL(item.file);
    img.src = objUrl;
    img.alt = item.file.name;
    img.className = 'w-full h-full object-cover block';
    const revokeThumb = () => URL.revokeObjectURL(objUrl);
    img.onload = revokeThumb;
    img.onerror = revokeThumb;

    const overlay = document.createElement('div');
    overlay.id = `thumb-overlay-${item.id}`;
    overlay.className = 'absolute inset-0 flex items-center justify-center bg-black/45 transition-all duration-300';

    const badge = document.createElement('span');
    badge.id = `thumb-badge-${item.id}`;
    badge.className = 'text-[10px] font-semibold text-white tracking-wide uppercase';
    const s = STATUS[item.status];
    badge.textContent = this.i18n.status?.[s.labelKey] ?? '';

    const removeBtn = document.createElement('button');
    removeBtn.id = `thumb-remove-${item.id}`;
    removeBtn.type = 'button';
    removeBtn.setAttribute('aria-label', `${this.i18n.removeImage}: ${item.file.name}`);
    removeBtn.title = this.i18n.removeImage;
    removeBtn.className = 'absolute top-1 right-1 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-error text-white shadow-sm transition-opacity duration-150 cursor-pointer hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white';
    removeBtn.innerHTML = '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18"/></svg>';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onRemove(item.id);
    });
    if (!this.isRemovable(item.status)) removeBtn.classList.add('hidden');

    overlay.appendChild(badge);
    wrap.appendChild(img);
    wrap.appendChild(overlay);
    wrap.appendChild(removeBtn);
    this.els.thumbGrid.appendChild(wrap);
  }

  setStatus(id: string, status: ThumbStatus) {
    const overlay = document.getElementById(`thumb-overlay-${id}`);
    const badge   = document.getElementById(`thumb-badge-${id}`);
    document.getElementById(`thumb-remove-${id}`)?.classList.toggle('hidden', !this.isRemovable(status));
    if (!overlay || !badge) return;

    const s = STATUS[status];
    overlay.classList.remove(...ALL_STATUS_BG, 'opacity-0');
    overlay.classList.add(s.bg);

    if (status === 'done') {
      badge.innerHTML = '<svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24" class="drop-shadow-sm"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';
    } else {
      badge.textContent = this.i18n.status?.[s.labelKey] ?? '';
    }
  }

  removeThumb(id: string, done?: () => void) {
    const el = document.getElementById(`thumb-${id}`);
    if (!el) { done?.(); return; }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      el.remove();
      done?.();
      return;
    }

    el.classList.add('thumb-removing');
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      el.remove();
      done?.();
    };
    el.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 260);
  }

  showInZone(newItems: Array<{ id: string; file: File; status: ThumbStatus }>, totalCount: number) {
    this.els.zoneEmpty.classList.add('hidden');
    this.els.zoneFilled.classList.remove('hidden');
    this.els.uploadZone.classList.add('has-files', 'cursor-default');
    this.els.uploadZone.classList.remove('cursor-pointer');

    newItems.forEach(item => this.addThumb(item));
    this.updateCount(totalCount);
  }

  updateCount(n: number) {
    const label = `${n} ${n !== 1 ? this.i18n.imagesSelected : this.i18n.imageSelected}`;
    this.els.zoneCount.textContent = label;
  }

  reset() {
    this.els.thumbGrid.innerHTML = '';
    this.els.zoneCount.textContent = '';
    this.els.zoneFilled.classList.add('hidden');
    this.els.zoneEmpty.classList.remove('hidden');
    this.els.uploadZone.classList.remove('has-files', 'cursor-default');
    this.els.uploadZone.classList.add('cursor-pointer');
  }

  private isRemovable(status: ThumbStatus): boolean {
    return status === 'queued' || status === 'error';
  }
}
