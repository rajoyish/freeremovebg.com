// Debounced accumulator for the global cutout counter.
//
// Bulk uploads process many images in quick succession. To respect the WAF
// (3 req / 10s) and the D1 free-tier write budget, we never POST per image —
// we accumulate locally and flush a single consolidated request after a quiet
// period, then notify the UI so it can re-fetch the fresh total.

const FLUSH_DELAY = 2500; // ms of inactivity before flushing
const MAX_PER_REQUEST = 50; // worker enforces the same ceiling
const ENDPOINT = '/api/count';

// TODO(user): paste the Turnstile site key. While empty, token retrieval is
// skipped and the worker bypasses verification (see TURNSTILE_SECRET_KEY).
const TURNSTILE_SITE_KEY = '0x4AAAAAADfcEh3QfthL5lmx';

let pendingCount = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Record one successfully processed image and (re)arm the flush timer. */
export function recordSuccessfulCutout(): void {
  pendingCount += 1;
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, FLUSH_DELAY);
}

async function flush(): Promise<void> {
  timer = null;
  if (pendingCount <= 0) return;

  const batch = Math.min(pendingCount, MAX_PER_REQUEST);
  pendingCount -= batch;

  try {
    const token = await getTurnstileToken();
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: batch, token }),
    });
    if (res.ok) {
      window.dispatchEvent(new CustomEvent('global-counter-updated'));
    }
  } catch {
    // Network/Turnstile failure must never disrupt the local tool.
  }

  // Large bursts (>50) leave a remainder — schedule another flush.
  if (pendingCount > 0 && !timer) {
    timer = setTimeout(flush, FLUSH_DELAY);
  }
}

// --- Invisible Turnstile -----------------------------------------------------

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;
let widgetId: string | null = null;
let widgetEl: HTMLElement | null = null;
// Resolver for the in-flight token request. The widget's callbacks are
// registered once (at render) and route their result here, so each request can
// reuse the same widget without re-rendering it.
let currentResolve: ((token: string) => void) | null = null;

function settleToken(token: string): void {
  const resolve = currentResolve;
  currentResolve = null;
  resolve?.(token);
}

function loadTurnstileScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile_script_failed'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Resolve a fresh Turnstile token via an invisible widget. Returns '' when no
 * site key is configured or on any failure, so the counter degrades gracefully.
 */
async function getTurnstileToken(): Promise<string> {
  if (!TURNSTILE_SITE_KEY) return '';
  try {
    await loadTurnstileScript();
    const turnstile = window.turnstile;
    if (!turnstile) return '';

    return await new Promise<string>((resolve) => {
      // Single-flight: never call execute() while a request is still pending,
      // or Turnstile warns "already executing". A dropped batch is harmless.
      if (currentResolve) {
        resolve('');
        return;
      }
      currentResolve = resolve;

      if (widgetId === null) {
        // Render the invisible widget once. Its callbacks route every future
        // token (including after reset) through settleToken.
        widgetEl = document.createElement('div');
        widgetEl.style.display = 'none';
        document.body.appendChild(widgetEl);
        widgetId = turnstile.render(widgetEl, {
          sitekey: TURNSTILE_SITE_KEY,
          size: 'invisible',
          callback: settleToken,
          'error-callback': () => settleToken(''),
          'timeout-callback': () => settleToken(''),
        });
        if (widgetId === null) {
          settleToken('');
          return;
        }
      } else {
        // Reuse the existing widget — reset then execute. Re-rendering the same
        // container is rejected by Turnstile ("already rendered in this container").
        turnstile.reset(widgetId);
      }

      turnstile.execute(widgetId);
    });
  } catch {
    return '';
  }
}
