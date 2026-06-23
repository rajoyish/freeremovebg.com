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
      <div class="relative aspect-[4/3] bg-checkerboard overflow-hidden">
        <img-comparison-slider
          class="w-full h-full block"
          style="--divider-width: 2px; --divider-color: var(--color-hairline-strong);"
        >
          <img slot="first" src="${originalUrl}" alt="${this.i18n.original}" class="w-full h-full object-cover block" />
          <img slot="second" src="${processedUrl}" alt="${this.i18n.removed}" class="w-full h-full object-cover block" />
          <div slot="handle" class="w-6 h-6 bg-canvas border border-hairline rounded-full flex items-center justify-center shadow-sm">
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

    const imageArea = card.querySelector<HTMLElement>('.aspect-\\[4\\/3\\]');
    if (imageArea) {
      imageArea.style.cursor = 'zoom-in';
      imageArea.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[slot="handle"]')) return;
        this.openLightbox(processedUrl, name);
      });
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