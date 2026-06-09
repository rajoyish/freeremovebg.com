/**
 * Toast helper (view concern).
 *
 * Creates a toast using Tailwind utilities + the existing .toast / .toast-visible
 * classes (for the slide/fade animation defined in global.css).
 * The container is provided by the caller (fixed in the page).
 * Fully i18n-string free here — the message is already resolved by the caller.
 */

export function showToast(container: HTMLElement, message: string, durationMs = 30000) {
  const toast = document.createElement('div');
  toast.className = 'toast flex items-center gap-3 px-5 py-3 bg-ink text-on-primary text-sm font-medium rounded-lg shadow-lg max-w-[90vw]';
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" class="shrink-0 stroke-amber-400"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
    <span class="flex-1"></span>
    <button type="button" aria-label="Dismiss" class="toast-close shrink-0 -mr-1 flex items-center justify-center w-6 h-6 rounded-full text-on-primary/70 transition-colors cursor-pointer hover:bg-on-primary/15 hover:text-on-primary">
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
  `;
  toast.querySelector('span')!.textContent = message;
  container.appendChild(toast);

  // rAF to trigger transition (same technique as original)
  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });

  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    toast.classList.remove('toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  }
  toast.querySelector('.toast-close')?.addEventListener('click', dismiss);
  const timer = setTimeout(dismiss, durationMs);
}
