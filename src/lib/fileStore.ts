// ---------------------------------------------------------------------------
// Optional durable persistence via the File System Access API. The user picks a
// real outliner.json on disk; the app auto-saves to it and remembers the handle
// across reloads. Data then survives a browser-data wipe entirely.
//
// The handle itself is stored in a tiny separate IndexedDB so it can be
// restored on the next visit (permission may need one click to re-grant).
// ---------------------------------------------------------------------------
import type { PersistedState } from '../types';

export function fsSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

const HANDLE_DB = 'outliner-fs';
const HANDLE_STORE = 'handles';
const HANDLE_KEY = 'dataFile';

let handleDbPromise: Promise<IDBDatabase> | null = null;
function handleDb(): Promise<IDBDatabase> {
  if (handleDbPromise) return handleDbPromise;
  handleDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(HANDLE_STORE)) {
        req.result.createObjectStore(HANDLE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return handleDbPromise;
}

export async function saveHandle(handle: FileSystemFileHandle): Promise<void> {
  try {
    const db = await handleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Could not remember data file', err);
  }
}

export async function loadHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await handleDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readonly');
      const req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemFileHandle) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function clearHandle(): Promise<void> {
  try {
    const db = await handleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

/** Non-interactive permission check (safe to call on load, no user gesture). */
export async function queryPermission(handle: FileSystemFileHandle): Promise<PermissionState> {
  if (!handle.queryPermission) return 'prompt';
  try {
    return await handle.queryPermission({ mode: 'readwrite' });
  } catch {
    return 'prompt';
  }
}

/** Interactive permission request — must be called from a user gesture. */
export async function requestPermission(handle: FileSystemFileHandle): Promise<boolean> {
  try {
    if ((await queryPermission(handle)) === 'granted') return true;
    const res = await handle.requestPermission?.({ mode: 'readwrite' });
    return res === 'granted';
  } catch {
    return false;
  }
}

export async function readFileState(handle: FileSystemFileHandle): Promise<PersistedState | null> {
  try {
    const file = await handle.getFile();
    const text = await file.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as PersistedState;
  } catch (err) {
    console.error('Could not read data file', err);
    return null;
  }
}

/**
 * A cheap "did the file change" signature: modified-time + byte size. Used to
 * detect an external write (e.g. another device's copy synced in by Dropbox)
 * without reading/parsing the whole file. Compared with strict inequality, so a
 * clock that runs backwards on another device is still caught (size differs, or
 * the mtime simply isn't equal to what we last recorded).
 */
export async function fileSig(handle: FileSystemFileHandle): Promise<string> {
  try {
    const f = await handle.getFile();
    return `${f.lastModified}:${f.size}`;
  } catch {
    return '';
  }
}

export async function readFileStateWithSig(
  handle: FileSystemFileHandle,
): Promise<{ state: PersistedState | null; sig: string }> {
  try {
    const file = await handle.getFile();
    const sig = `${file.lastModified}:${file.size}`;
    const text = await file.text();
    const state = text.trim() ? (JSON.parse(text) as PersistedState) : null;
    return { state, sig };
  } catch (err) {
    console.error('Could not read data file', err);
    return { state: null, sig: '' };
  }
}

// Serialize writes so overlapping saves never interleave / truncate each other.
let writeChain: Promise<void> = Promise.resolve();
export function writeFileState(handle: FileSystemFileHandle, state: PersistedState): Promise<void> {
  writeChain = writeChain.then(async () => {
    try {
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(state, null, 2));
      await writable.close();
    } catch (err) {
      console.error('Could not write data file', err);
    }
  });
  return writeChain;
}

export async function pickSaveFile(): Promise<FileSystemFileHandle | null> {
  if (!window.showSaveFilePicker) return null;
  try {
    return await window.showSaveFilePicker({
      suggestedName: 'outliner.json',
      types: [{ description: 'Outliner data', accept: { 'application/json': ['.json'] } }],
    });
  } catch {
    return null; // user cancelled
  }
}

export async function pickOpenFile(): Promise<FileSystemFileHandle | null> {
  if (!window.showOpenFilePicker) return null;
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Outliner data', accept: { 'application/json': ['.json'] } }],
    });
    return handle ?? null;
  } catch {
    return null; // user cancelled
  }
}
