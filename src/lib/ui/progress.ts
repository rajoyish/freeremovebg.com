/**
 * ProgressView - View module for the batch progress bar + loading text.
 *
 * Purely updates DOM based on data passed from QueueManager.
 * Uses the existing --progress CSS variable (Tailwind arbitrary) and ARIA attrs.
 */

interface ProgressViewElements {
  progressState: HTMLElement;
  progressTrack: HTMLElement;
  progressBar: HTMLElement;
  progressText: HTMLElement;
  loadingText: HTMLElement;
}

export class ProgressView {
  constructor(private els: ProgressViewElements) {}

  show() {
    this.els.progressState.classList.remove('hidden');
  }

  hide() {
    this.els.progressState.classList.add('hidden');
  }

  set(done: number, total: number, msg: string) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    this.els.progressBar.style.setProperty('--progress', `${pct}%`);
    this.els.progressTrack.setAttribute('aria-valuenow', String(pct));
    this.els.progressText.textContent = `${done} / ${total}`;
    this.els.loadingText.textContent = msg;
  }

  // Called at end of batch to auto-hide after delay (manager can schedule via controller or timeout inside).
  scheduleHide(delayMs = 2000) {
    setTimeout(() => this.hide(), delayMs);
  }
}
