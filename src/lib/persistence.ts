// ---------------------------------------------------------------------------
// Local-first persistence via IndexedDB. Nothing ever leaves the machine.
//
// The entire document graph is stored as one record under a fixed key. Writes
// are debounced by the caller so rapid typing does not thrash the disk.
// ---------------------------------------------------------------------------
import type { PersistedState } from '../types';

const DB_NAME = 'outliner';
const STORE = 'state';
const KEY = 'root';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function loadState(): Promise<PersistedState | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as PersistedState) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to load state', err);
    // Fall back to localStorage snapshot if IndexedDB is unavailable.
    try {
      const raw = localStorage.getItem('outliner:backup');
      return raw ? (JSON.parse(raw) as PersistedState) : null;
    } catch {
      return null;
    }
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(state, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    // Keep a lightweight localStorage mirror as a secondary safety net.
    try {
      localStorage.setItem('outliner:backup', JSON.stringify(state));
    } catch {
      /* quota — ignore, IndexedDB is the source of truth */
    }
  } catch (err) {
    console.error('Failed to save state', err);
  }
}

/** Debounce helper used to coalesce rapid writes. */
export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let handle: ReturnType<typeof setTimeout> | null = null;
  return ((...args: never[]) => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => fn(...args), ms);
  }) as T;
}
