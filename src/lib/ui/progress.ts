interface ProgressViewElements {
  progressState: HTMLElement;
  progressTrack: HTMLElement;
  progressBar: HTMLElement;
  progressText: HTMLElement;
  loadingText: HTMLElement;
}

// The removal worker reports nothing until an image is finished, so with a
// single image the bar would sit at 0% for the whole run. While an image is in
// flight the bar instead creeps through that image's share of the total: it
// starts with a visible step, moves quickly at first, then slows as it nears
// the cap, and only the real completion fills the share.
const TRICKLE_START = 0.08;
const TRICKLE_CAP = 0.9;
const TRICKLE_RATE = 0.045; // fraction of the remaining gap closed per tick
const TRICKLE_TICK_MS = 250;

export class ProgressView {
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private trickleTimer: ReturnType<typeof setInterval> | undefined;
  private done = 0;
  private total = 0;
  /** Progress through the image currently being processed, 0–1. */
  private partial = 0;

  constructor(private els: ProgressViewElements) {}

  show() {
    clearTimeout(this.hideTimer);
    this.els.progressState.classList.remove('hidden');
  }

  hide() {
    clearTimeout(this.hideTimer);
    this.stopTrickle();
    this.els.progressState.classList.add('hidden');
  }

  set(done: number, total: number, msg: string) {
    if (done !== this.done || total !== this.total) {
      // A finished image hands over to the next one, which starts its own share.
      if (done !== this.done) this.partial = 0;
      this.done = done;
      this.total = total;
    }
    if (done < total) {
      this.partial = Math.max(this.partial, TRICKLE_START);
      this.startTrickle();
    } else {
      this.partial = 0;
      this.stopTrickle();
    }
    this.els.progressText.textContent = `${done} / ${total}`;
    this.els.loadingText.textContent = msg;
    this.render();
  }

  scheduleHide(delayMs = 2000) {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), delayMs);
  }

  private render() {
    const { done, total } = this;
    const pct = total > 0 ? Math.min(100, Math.round(((done + this.partial) / total) * 100)) : 0;
    this.els.progressBar.style.setProperty('--progress', `${pct}%`);
    this.els.progressTrack.setAttribute('aria-valuenow', String(pct));
  }

  private startTrickle() {
    if (this.trickleTimer !== undefined) return;
    this.trickleTimer = setInterval(() => {
      this.partial += (TRICKLE_CAP - this.partial) * TRICKLE_RATE;
      this.render();
    }, TRICKLE_TICK_MS);
  }

  private stopTrickle() {
    clearInterval(this.trickleTimer);
    this.trickleTimer = undefined;
  }
}
