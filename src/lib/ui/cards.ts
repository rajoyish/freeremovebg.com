/**
 * CardsView - View module for the processed results grid (before/after cards).
 *
 * Creates cards using Tailwind v4 utilities + project tokens (bg-canvas, border-hairline,
 * bg-checkerboard custom utility, rounded-[10px], etc.).
 * Wires the per-card download button.
 * The QueueManager calls addCard after a successful process and reset() on full clear.
 */

export interface ToolI18n {
  original: string;
  removed: string;
  downloadPng: string;
}

interface CardsViewElements {
  imagesContainer: HTMLElement;
  imageGrid: HTMLElement;
}

export class CardsView {
  constructor(
    private els: CardsViewElements,
    private i18n: ToolI18n
  ) {}

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
      <div class="relative aspect-[4/3] grid grid-cols-2">
        <div class="relative overflow-hidden border-r border-hairline">
          <img src="${originalUrl}" alt="${this.i18n.original}" class="w-full h-full object-cover block" />
          <span class="absolute top-2 left-2 px-2 py-[3px] bg-ink text-on-primary text-[11px] font-medium rounded-[4px]">${this.i18n.original}</span>
        </div>
        <div class="relative overflow-hidden bg-checkerboard">
          <img src="${processedUrl}" alt="${this.i18n.removed}" class="w-full h-full object-cover block" />
          <span class="absolute top-2 right-2 px-2 py-[3px] bg-link text-white text-[11px] font-medium rounded-[4px]">${this.i18n.removed}</span>
        </div>
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
