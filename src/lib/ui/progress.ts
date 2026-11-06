interface ProgressViewElements {
  progressState: HTMLElement;
  progressTrack: HTMLElement;
  progressBar: HTMLElement;
  progressText: HTMLElement;
  loadingText: HTMLElement;
}

export class ProgressView {
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(private els: ProgressViewElements) {}

  show() {
    clearTimeout(this.hideTimer);
    this.els.progressState.classList.remove('hidden');
  }

  hide() {
    clearTimeout(this.hideTimer);
    this.els.progressState.classList.add('hidden');
  }

  set(done: number, total: number, msg: string) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    this.els.progressBar.style.setProperty('--progress', `${pct}%`);
    this.els.progressTrack.setAttribute('aria-valuenow', String(pct));
    this.els.progressText.textContent = `${done} / ${total}`;
    this.els.loadingText.textContent = msg;
  }

  scheduleHide(delayMs = 2000) {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), delayMs);
  }
}
