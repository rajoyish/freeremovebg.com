// Register img-comparison-slider web component and its minimal styles for client-side use.
import 'img-comparison-slider';
import 'img-comparison-slider/dist/styles.css';
import GLightbox from 'glightbox';
import 'glightbox/dist/css/glightbox.min.css';

export interface ToolI18n {
  original: string;
  removed: string;
  downloadPng: string;
  viewFullImage: string;
}

interface CardsViewElements {
  imagesContainer: HTMLElement;
  imageGrid: HTMLElement;
}

export class CardsView {
  private lightbox: any = null;

  constructor(
    private els: CardsViewElements,
    private i18n: ToolI18n
  ) {}

  private openLightbox(url: string, title: string) {
    if (!this.lightbox) {
      this.lightbox = GLightbox({
        closeButton: true,
        closeOnOutsideClick: true,
        keyboardNavigation: true,
        zoomable: true,
        draggable: true,
        loop: false,
        touchNavigation: true,
      });
    }

    this.lightbox.setElements([
      {
        href: url,
        type: 'image',
        title: title,
        alt: title,
      },
    ]);
    this.lightbox.open();
  }

  addCard(
    name: string,
    originalUrl: string,
    processedUrl: string,
    modelLabel: string,
    onDownload: (name: string, url: string) => void
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = 'bg-canvas border border-hairline rounded-[10px] overflow-hidden shadow-sm';
    card.innerHTML = `
      <div data-compare-area class="relative aspect-4/3 bg-checkerboard overflow-hidden">
        <!-- "handle": restrict dragging to the handle. Without it the component
             hijacks mousedown anywhere on the card (the divider jumps to the
             press point and preventDefault()s), which made image clicks feel
             laggy and swallowed the lightbox click on the result image. -->
        <img-comparison-slider
          handle
          class="w-full h-full block"
          style="--divider-width: 2px; --divider-color: var(--color-hairline-strong);"
        >
          <!-- aspect-4/3 (not h-full): inside the slider's shadow DOM the second
               image's percentage height has no definite ancestor to resolve against,
               so it falls back to natural aspect height and misaligns the two panes.
               Deriving height from the (correctly resolved) width keeps both images
               exactly the size of the 4:3 card area. -->
          <img slot="first" src="${originalUrl}" alt="${this.i18n.original}" class="w-full aspect-4/3 object-cover block" />
          <img slot="second" src="${processedUrl}" alt="${this.i18n.removed}" class="w-full aspect-4/3 object-cover block" />
          <div slot="handle" class="w-6 h-6 bg-canvas border border-hairline rounded-full flex items-center justify-center shadow-sm cursor-ew-resize">
            <div class="flex gap-[2px]">
              <div class="w-[1.5px] h-2.5 bg-ink rounded-full"></div>
              <div class="w-[1.5px] h-2.5 bg-ink rounded-full"></div>
            </div>
          </div>
        </img-comparison-slider>
        <span class="absolute top-2 left-2 px-2 py-[3px] bg-ink text-on-primary text-[11px] font-medium rounded-[4px] pointer-events-none z-10">${this.i18n.original}</span>
        <span class="absolute top-2 right-2 px-2 py-[3px] bg-link text-white text-[11px] font-medium rounded-[4px] pointer-events-none z-10">${this.i18n.removed}</span>
      </div>
      <div class="px-4 pt-3 pb-3.5 border-t border-canvas-soft-2">
        <div class="flex items-center justify-between gap-3 mb-2">
          <p class="text-[13px] font-medium text-ink m-0 overflow-hidden text-ellipsis whitespace-nowrap flex-1">${name}</p>
          <button class="dl-btn shrink-0 px-4 py-[7px] bg-ink text-on-primary border-none rounded-pill text-[13px] font-medium cursor-pointer transition-opacity hover:opacity-80">
            ${this.i18n.downloadPng}
          </button>
        </div>
        <p class="m-0 text-[11px] text-mute font-mono">
          <span class="inline-block w-[7px] h-[7px] rounded-full bg-link mr-[5px] align-middle"></span>
          ${modelLabel}
        </p>
      </div>
    `;
    this.els.imagesContainer.appendChild(card);
    this.els.imageGrid.classList.remove('hidden');

    (card.querySelector('.dl-btn') as HTMLButtonElement).addEventListener('click', () => {
      onDownload(name, processedUrl);
    });

    const imageArea = card.querySelector<HTMLElement>('[data-compare-area]');
    const sliderEl = card.querySelector<HTMLElement & { value?: number }>('img-comparison-slider');
    const handleEl = card.querySelector<HTMLElement>('[slot="handle"]');
    if (imageArea && sliderEl && handleEl) {
      // Hit targets across the card are the slider's shadow-DOM internals
      // (events retarget to the host), so element-based checks and per-element
      // cursor classes don't work here. Decide by geometry instead: the removed
      // result is everything right of the divider (value = exposure %).
      const inHandle = (e: MouseEvent) => {
        const r = handleEl.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      };
      const overRemoved = (e: MouseEvent) => {
        const r = sliderEl.getBoundingClientRect();
        const exposure = Number(sliderEl.value);
        const pct = ((e.clientX - r.left) / r.width) * 100;
        return pct > (Number.isFinite(exposure) ? exposure : 50);
      };

      // Cursor: resize over the handle, zoom over the removed pane, default
      // over the original (which has no zoom affordance).
      imageArea.addEventListener('mousemove', (e) => {
        sliderEl.style.cursor = inHandle(e) ? 'ew-resize' : overRemoved(e) ? 'zoom-in' : '';
      });

      let downPos: { x: number; y: number } | null = null;
      imageArea.addEventListener('pointerdown', (e) => {
        downPos = { x: e.clientX, y: e.clientY };
      });
      imageArea.addEventListener('click', (e) => {
        // Lightbox = a clean click on the removed pane: barely moved since
        // pointerdown (not a drag-release), not on the handle, right of divider.
        const dragged = downPos ? Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6 : false;
        if (dragged || inHandle(e) || !overRemoved(e)) return;
        this.openLightbox(processedUrl, name);
      });

      // Hide labels while the slider is being dragged. The window listener is
      // registered per drag with { once: true } so removed cards aren't kept
      // alive by a permanent window-level closure.
      const labels = imageArea.querySelectorAll<HTMLElement>(':scope > span');
      if (labels.length) {
        const showLabels = () => labels.forEach((l) => l.classList.remove('opacity-0'));
        sliderEl.addEventListener('pointerdown', () => {
          labels.forEach((l) => l.classList.add('opacity-0'));
          window.addEventListener('pointerup', showLabels, { once: true });
        });
      }
    }

    return card;
  }

  removeCard(cardEl: HTMLElement | undefined) {
    cardEl?.remove();
  }

  reset() {
    this.els.imagesContainer.innerHTML = '';
    this.els.imageGrid.classList.add('hidden');
  }
}