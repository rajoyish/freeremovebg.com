// Global state for tallying cutouts
let pendingCount = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let currentGlobalCount = 0;
let isFetching = false;

const siteKey = import.meta.env.PUBLIC_TURNSTILE_SITEKEY;

/**
 * Initializes the turnstile widget invisibly if not already loaded.
 */
function ensureTurnstile(): Promise<void> {
  return new Promise((resolve) => {
    if (window.turnstile) {
      resolve();
      return;
    }
    
    // Create script if not present
    if (!document.getElementById('cf-turnstile-api')) {
      const script = document.createElement('script');
      script.id = 'cf-turnstile-api';
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    
    // Wait until loaded
    const checkInterval = setInterval(() => {
      if (window.turnstile) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  });
}

/**
 * Executes invisible turnstile challenge and returns the token.
 */
async function getTurnstileToken(): Promise<string> {
  await ensureTurnstile();
  
  return new Promise((resolve, reject) => {
    // Create a temporary container
    const container = document.createElement('div');
    container.style.display = 'none';
    document.body.appendChild(container);
    
    let widgetId: string;
    
    try {
      if (!siteKey) {
        throw new Error('Turnstile site key is not configured.');
      }
      
      widgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        size: 'invisible',
        callback: (token: string) => {
          window.turnstile.remove(widgetId);
          container.remove();
          resolve(token);
        },
        'error-callback': () => {
          window.turnstile.remove(widgetId);
          container.remove();
          reject(new Error('Turnstile verification failed'));
        }
      });
    } catch (e) {
      container.remove();
      reject(e);
    }
  });
}

/**
 * Flushes the accumulated pending cutouts to the backend.
 */
async function flushCounter() {
  if (pendingCount === 0 || isFetching) return;
  
  const countToFlush = pendingCount;
  isFetching = true;
  
  try {
    const token = await getTurnstileToken();
    
    const response = await fetch('/api/count', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        count: countToFlush,
        'cf-turnstile-token': token 
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      pendingCount -= countToFlush; // Deduct exactly what we sent
      updateUIWithCount(data.count);
    } else {
      console.error('Failed to flush counter:', await response.text());
    }
  } catch (error) {
    console.error('Error flushing counter:', error);
  } finally {
    isFetching = false;
    // If more cutouts occurred during fetch, schedule another flush
    if (pendingCount > 0) {
      scheduleFlush(2500);
    }
  }
}

function scheduleFlush(delay = 2500) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushCounter, delay);
}

/**
 * Called by the cutout engine each time an image succeeds.
 */
export function recordCutoutSuccess() {
  pendingCount++;
  // Optimistically update the UI count
  updateUIWithCount(currentGlobalCount + 1);
  scheduleFlush();
}

/**
 * Fetches the initial count on page load.
 */
export async function initCounter(displayElementId: string) {
  window._counterDisplayElementId = displayElementId;
  try {
    const response = await fetch('/api/count');
    if (response.ok) {
      const data = await response.json();
      updateUIWithCount(data.count);
    } else {
      // Gracefully hide the counter if WAF blocked the request (e.g. 403/429)
      hideCounterUI(displayElementId);
    }
  } catch (error) {
    console.error('Failed to fetch initial counter:', error);
    hideCounterUI(displayElementId);
  }
}

function hideCounterUI(displayElementId: string) {
  const el = document.getElementById(displayElementId);
  if (el) {
    const wrapper = document.getElementById('global-counter-wrapper');
    if (wrapper) wrapper.classList.add('hidden');
  }
}

// Ensure the variable is declared on window for UI updates
declare global {
  interface Window {
    turnstile: any;
    _counterDisplayElementId: string;
  }
}

function updateUIWithCount(newCount: number) {
  // Only update if it's an increase to prevent jitter
  if (newCount > currentGlobalCount) {
    currentGlobalCount = newCount;
    const el = document.getElementById(window._counterDisplayElementId || 'global-counter');
    if (el) {
      // Format with commas
      el.textContent = newCount.toLocaleString('en-US');
      // Add a brief ping animation class if it exists
      el.classList.remove('animate-ping-once');
      void el.offsetWidth; // trigger reflow
      el.classList.add('animate-ping-once');
    }
  }
}
