// Hands finished cutouts from the background remover to the converter and
// optimizer. Blob URLs die with the page that made them, so the files go
// through IndexedDB under a one-time key that rides along in the target URL
// (?handoff=<key>). The target page takes the entry and deletes it.
//
// The link opens in a new tab so the remover keeps its results. The write
// starts on click and the new tab may read before it commits, so takeHandoff
// retries for a moment before giving up.

const DB_NAME = 'frbg-handoff';
const STORE = 'files';
const PARAM = 'handoff';
const MAX_AGE_MS = 60 * 60 * 1000;

interface Entry {
  at: number;
  files: Array<{ name: string; type: string; blob: Blob }>;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export function newHandoffKey(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Adds the handoff key to a page URL such as '/convert/' or '/es/optimize/'. */
export function handoffUrl(base: string, key: string): string {
  return `${base}${base.includes('?') ? '&' : '?'}${PARAM}=${encodeURIComponent(key)}`;
}

export async function stashHandoff(key: string, files: Array<{ name: string; blob: Blob }>): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const entry: Entry = {
      at: Date.now(),
      files: files.map(({ name, blob }) => ({ name, type: blob.type || 'image/png', blob })),
    };
    store.put(entry, key);
    // Drop anything abandoned (tab closed before it loaded).
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      const value = cursor.value as Entry;
      if (cursor.key !== key && Date.now() - value.at > MAX_AGE_MS) cursor.delete();
      cursor.continue();
    };
    await done(tx);
  } finally {
    db.close();
  }
}

async function readOnce(key: string): Promise<File[] | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(key);
    let entry: Entry | undefined;
    req.onsuccess = () => {
      entry = req.result as Entry | undefined;
      if (entry) store.delete(key);
    };
    await done(tx);
    if (!entry) return null;
    return entry.files.map((f) => new File([f.blob], f.name, { type: f.type }));
  } finally {
    db.close();
  }
}

/**
 * Files handed to this page, or [] when the URL carries no handoff key. Strips
 * the key from the address bar so a reload doesn't look for it again.
 */
export async function takeHandoff(): Promise<File[]> {
  const url = new URL(location.href);
  const key = url.searchParams.get(PARAM);
  if (!key) return [];
  url.searchParams.delete(PARAM);
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);

  try {
    for (let attempt = 0; attempt < 10; attempt++) {
      const files = await readOnce(key);
      if (files) return files;
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (err) {
    console.error('[handoff]', err);
  }
  return [];
}
