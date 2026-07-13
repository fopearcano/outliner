// ---------------------------------------------------------------------------
// The single source of truth. A normalized, undoable document graph plus every
// operation the UI can perform. Persistence is wired at the bottom.
// ---------------------------------------------------------------------------
import { create } from 'zustand';
import {
  type OutlineItem,
  type Doc,
  type Preferences,
  type ColorLabel,
  type Attachment,
  type BoxStyle,
  type LrSide,
  type PersistedState,
  DEFAULT_PREFERENCES,
  DEFAULT_DOC_SETTINGS,
  STATE_VERSION,
  COLOR_LABELS,
} from '../types';
import {
  type ItemMap,
  makeItem,
  cloneSubtree,
  subtreeIds,
  descendantIds,
  prevVisible,
  isAncestor,
} from '../lib/tree';
import { newId } from '../lib/id';
import { loadState, saveState, debounce } from '../lib/persistence';
import type { ImportNode } from '../lib/importers';
import {
  fsSupported,
  pickSaveFile,
  pickOpenFile,
  loadHandle,
  saveHandle,
  clearHandle,
  queryPermission,
  requestPermission,
  readFileState,
  writeFileState,
} from '../lib/fileStore';

export type CaretPos = 'start' | 'end';

export interface FocusRequest {
  id: string;
  pos: CaretPos | number;
  /** target the note field instead of the main text */
  note?: boolean;
  ts: number;
}

interface Snapshot {
  items: ItemMap;
  docs: Record<string, Doc>;
  rootDocIds: string[];
}

/** Detached subtree copied for internal cut/paste. */
interface Clipboard {
  rootId: string;
  items: ItemMap;
}

export interface StoreState {
  items: ItemMap;
  docs: Record<string, Doc>;
  rootDocIds: string[];
  currentDocId: string | null;
  /** Item currently zoomed into; null means the document root. */
  zoomItemId: string | null;
  preferences: Preferences;

  // Ephemeral UI state (not persisted)
  focus: FocusRequest | null;
  filterQuery: string;
  loaded: boolean;
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  clipboard: Clipboard | null;

  // --- connected data file (File System Access) ---
  fileName: string | null;
  fileConnected: boolean;
  fileNeedsReconnect: boolean;

  // --- lifecycle ---
  hydrate: () => Promise<void>;
  /** Restore a previously-connected data file after hydrate. */
  tryRestoreFile: () => Promise<void>;
  /** Save current data to a new file and connect it (auto-save from now on). */
  connectFile: () => Promise<boolean>;
  /** Open an existing outliner.json, load it, and connect it. */
  openFile: () => Promise<boolean>;
  /** Re-grant permission to a remembered file after a reload. */
  reconnectFile: () => Promise<boolean>;
  /** Stop syncing to the file (data stays in the browser). */
  disconnectFile: () => void;

  // --- focus ---
  requestFocus: (id: string, pos?: CaretPos | number, note?: boolean) => void;

  // --- documents / folders ---
  createDocument: (parentId?: string | null, title?: string, atIndex?: number) => string;
  createFolder: (parentId?: string | null, title?: string) => string;
  renameDoc: (id: string, title: string) => void;
  deleteDoc: (id: string) => void;
  toggleBookmark: (id: string) => void;
  toggleFolderExpanded: (id: string) => void;
  moveDoc: (id: string, newParentId: string | null, index: number) => void;
  selectDoc: (id: string) => void;
  setDocSettings: (id: string, partial: Partial<Doc['settings']>) => void;

  // --- outline editing ---
  setText: (id: string, text: string) => void;
  setNote: (id: string, note: string) => void;
  insertItemAfter: (id: string, before?: string, after?: string) => void;
  insertChild: (id: string) => void;
  /** Append a new top-level block to `parentId`, placed in `column` (one undo step). */
  addBlockInColumn: (parentId: string, column: number) => void;
  indent: (id: string) => void;
  outdent: (id: string) => void;
  moveUp: (id: string) => void;
  moveDown: (id: string) => void;
  moveItem: (dragId: string, targetId: string, position: 'before' | 'after' | 'child') => void;
  backspaceMerge: (id: string) => void;
  deleteItem: (id: string) => void;
  toggleCollapse: (id: string) => void;
  setCollapsedAll: (collapsed: boolean) => void;
  toggleComplete: (id: string) => void;
  toggleCheckbox: (id: string) => void;
  cycleHeading: (id: string) => void;
  setHeading: (id: string, level: number) => void;
  setColor: (id: string, color: ColorLabel | null) => void;
  setBox: (id: string, box: BoxStyle | null) => void;
  setItemColumn: (id: string, column: number) => void;
  setItemLr: (id: string, lr: LrSide) => void;
  addAttachments: (id: string, attachments: Attachment[]) => void;
  removeAttachment: (id: string, attachmentId: string) => void;
  duplicateItem: (id: string) => void;
  moveItemToDoc: (id: string, docId: string) => void;

  // --- clipboard ---
  copyItem: (id: string) => void;
  cutItem: (id: string) => void;
  pasteInto: (id: string) => void;

  // --- import ---
  importAsDocument: (title: string, nodes: ImportNode[], parentId?: string | null) => string;
  appendImportUnder: (itemId: string, nodes: ImportNode[]) => void;

  // --- navigation ---
  zoomIn: (id: string) => void;
  zoomOut: () => void;
  setZoom: (id: string | null) => void;
  /** Open the document containing an item, expand its ancestors, focus it. */
  revealItem: (itemId: string) => void;

  // --- filter / search ---
  setFilterQuery: (q: string) => void;

  // --- preferences ---
  setPreferences: (partial: Partial<Preferences>) => void;

  // --- history ---
  undo: () => void;
  redo: () => void;
}

const HISTORY_LIMIT = 200;

// Coalesce rapid text edits into a single undo entry.
let lastEditItem: string | null = null;
let lastEditTs = 0;

// The connected data file, if any (File System Access). Kept outside React
// state because a handle is not something the UI renders directly.
let currentHandle: FileSystemFileHandle | null = null;

/** Backfill fields that may be missing from older / imported data. */
function normalizeItems(items: ItemMap): ItemMap {
  for (const id in items) {
    const it = items[id];
    if (!it.attachments || it.box === undefined || it.column === undefined || it.lr === undefined) {
      items[id] = {
        ...it,
        attachments: it.attachments ?? [],
        box: it.box ?? null,
        column: it.column ?? 0,
        lr: it.lr ?? 'right',
      };
    }
  }
  return items;
}

function normalizeDocs(docs: Record<string, Doc>): Record<string, Doc> {
  for (const id in docs) {
    const settings = { ...DEFAULT_DOC_SETTINGS, ...docs[id].settings };
    // The 3-column view was removed; fall back to 2 columns.
    if ((settings.viewMode as string) === 'col3') settings.viewMode = 'col2';
    docs[id] = { ...docs[id], settings };
  }
  return docs;
}

function snapshot(s: StoreState): Snapshot {
  return { items: s.items, docs: s.docs, rootDocIds: s.rootDocIds };
}

/** The root item id whose children are currently displayed (zoom or doc root). */
export function currentRootItemId(s: StoreState): string | null {
  if (s.zoomItemId && s.items[s.zoomItemId]) return s.zoomItemId;
  const doc = s.currentDocId ? s.docs[s.currentDocId] : null;
  return doc?.rootItemId ?? null;
}

export const useStore = create<StoreState>((set, get) => {
  /** Push current graph onto the undo stack before a mutation. */
  const pushHistory = (coalesceKey?: string) => {
    const s = get();
    const now = Date.now();
    if (
      coalesceKey &&
      coalesceKey === lastEditItem &&
      now - lastEditTs < 700 &&
      s.undoStack.length > 0
    ) {
      lastEditTs = now;
      return; // fold into the previous history entry
    }
    lastEditItem = coalesceKey ?? null;
    lastEditTs = now;
    const stack = [...s.undoStack, snapshot(s)];
    if (stack.length > HISTORY_LIMIT) stack.shift();
    set({ undoStack: stack, redoStack: [] });
  };

  const touch = (item: OutlineItem): OutlineItem => ({ ...item, modifiedAt: Date.now() });

  /** Replace the whole document graph from a persisted snapshot (file load). */
  const applyPersisted = (p: PersistedState) => {
    set({
      items: normalizeItems({ ...p.items }),
      docs: normalizeDocs({ ...p.docs }),
      rootDocIds: p.rootDocIds,
      currentDocId: p.currentDocId ?? p.rootDocIds[0] ?? null,
      preferences: { ...DEFAULT_PREFERENCES, ...p.preferences },
      zoomItemId: null,
      filterQuery: '',
      undoStack: [],
      redoStack: [],
    });
  };

  const currentPersisted = (s: StoreState): PersistedState => ({
    version: STATE_VERSION,
    items: s.items,
    docs: s.docs,
    rootDocIds: s.rootDocIds,
    currentDocId: s.currentDocId,
    preferences: s.preferences,
  });

  return {
    items: {},
    docs: {},
    rootDocIds: [],
    currentDocId: null,
    zoomItemId: null,
    preferences: DEFAULT_PREFERENCES,
    focus: null,
    filterQuery: '',
    loaded: false,
    undoStack: [],
    redoStack: [],
    clipboard: null,
    fileName: null,
    fileConnected: false,
    fileNeedsReconnect: false,

    hydrate: async () => {
      const persisted = await loadState();
      if (persisted && persisted.rootDocIds.length) {
        set({
          items: normalizeItems({ ...persisted.items }),
          docs: normalizeDocs({ ...persisted.docs }),
          rootDocIds: persisted.rootDocIds,
          currentDocId: persisted.currentDocId ?? persisted.rootDocIds[0] ?? null,
          preferences: { ...DEFAULT_PREFERENCES, ...persisted.preferences },
          loaded: true,
        });
      } else {
        // First run: seed a friendly welcome document.
        const seed = createSeed();
        set({ ...seed, loaded: true });
      }
    },

    // ------------------------------------------------------- connected file
    tryRestoreFile: async () => {
      if (!fsSupported()) return;
      const handle = await loadHandle();
      if (!handle) return;
      currentHandle = handle;
      const perm = await queryPermission(handle);
      if (perm === 'granted') {
        const state = await readFileState(handle);
        if (state && state.rootDocIds?.length) applyPersisted(state);
        set({ fileName: handle.name, fileConnected: true, fileNeedsReconnect: false });
      } else {
        // Needs a click to re-grant read/write after a reload.
        set({ fileName: handle.name, fileConnected: false, fileNeedsReconnect: true });
      }
    },

    connectFile: async () => {
      if (!fsSupported()) return false;
      const handle = await pickSaveFile();
      if (!handle) return false;
      currentHandle = handle;
      await writeFileState(handle, currentPersisted(get()));
      await saveHandle(handle);
      set({ fileName: handle.name, fileConnected: true, fileNeedsReconnect: false });
      return true;
    },

    openFile: async () => {
      if (!fsSupported()) return false;
      const handle = await pickOpenFile();
      if (!handle) return false;
      if (!(await requestPermission(handle))) return false;
      const state = await readFileState(handle);
      currentHandle = handle;
      await saveHandle(handle);
      if (state && state.rootDocIds?.length) applyPersisted(state);
      set({ fileName: handle.name, fileConnected: true, fileNeedsReconnect: false });
      return true;
    },

    reconnectFile: async () => {
      if (!currentHandle) currentHandle = await loadHandle();
      if (!currentHandle) return false;
      if (!(await requestPermission(currentHandle))) return false;
      const state = await readFileState(currentHandle);
      if (state && state.rootDocIds?.length) applyPersisted(state);
      set({ fileName: currentHandle.name, fileConnected: true, fileNeedsReconnect: false });
      return true;
    },

    disconnectFile: () => {
      currentHandle = null;
      void clearHandle();
      set({ fileConnected: false, fileName: null, fileNeedsReconnect: false });
    },

    requestFocus: (id, pos = 'end', note = false) =>
      set({ focus: { id, pos, note, ts: Date.now() } }),

    // ----------------------------------------------------------------- docs
    createDocument: (parentId = null, title = 'Untitled', atIndex) => {
      pushHistory();
      const rootItem = makeItem(null);
      const doc: Doc = {
        id: newId(),
        kind: 'document',
        title,
        parentId,
        children: [],
        rootItemId: rootItem.id,
        bookmarked: false,
        expanded: true,
        settings: { ...DEFAULT_DOC_SETTINGS },
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      };
      // A brand-new document starts with one empty bullet to type into.
      const firstBullet = makeItem(rootItem.id);
      rootItem.children = [firstBullet.id];
      set((s) => {
        const docs = { ...s.docs, [doc.id]: doc };
        const items = { ...s.items, [rootItem.id]: rootItem, [firstBullet.id]: firstBullet };
        let rootDocIds = s.rootDocIds;
        if (parentId && docs[parentId]) {
          const parent = { ...docs[parentId] };
          const kids = [...parent.children];
          kids.splice(atIndex ?? kids.length, 0, doc.id);
          parent.children = kids;
          parent.expanded = true;
          docs[parentId] = parent;
        } else {
          rootDocIds = [...s.rootDocIds];
          rootDocIds.splice(atIndex ?? rootDocIds.length, 0, doc.id);
        }
        return {
          docs,
          items,
          rootDocIds,
          currentDocId: doc.id,
          zoomItemId: null,
          focus: { id: firstBullet.id, pos: 'end', ts: Date.now() },
        };
      });
      return doc.id;
    },

    createFolder: (parentId = null, title = 'New Folder') => {
      pushHistory();
      const folder: Doc = {
        id: newId(),
        kind: 'folder',
        title,
        parentId,
        children: [],
        bookmarked: false,
        expanded: true,
        settings: { ...DEFAULT_DOC_SETTINGS },
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      };
      set((s) => {
        const docs = { ...s.docs, [folder.id]: folder };
        let rootDocIds = s.rootDocIds;
        if (parentId && docs[parentId]) {
          const parent = { ...docs[parentId] };
          parent.children = [...parent.children, folder.id];
          parent.expanded = true;
          docs[parentId] = parent;
        } else {
          rootDocIds = [...s.rootDocIds, folder.id];
        }
        return { docs, rootDocIds };
      });
      return folder.id;
    },

    renameDoc: (id, title) =>
      set((s) => {
        const doc = s.docs[id];
        if (!doc) return {};
        return { docs: { ...s.docs, [id]: { ...doc, title, modifiedAt: Date.now() } } };
      }),

    deleteDoc: (id) => {
      pushHistory();
      set((s) => {
        const doc = s.docs[id];
        if (!doc) return {};
        const docs = { ...s.docs };
        const items = { ...s.items };
        // Recursively collect docs/folders to remove.
        const removeDocIds: string[] = [];
        const walk = (d: Doc) => {
          removeDocIds.push(d.id);
          if (d.kind === 'folder') {
            for (const cid of d.children) if (docs[cid]) walk(docs[cid]);
          } else if (d.rootItemId) {
            for (const iid of subtreeIds(items, d.rootItemId)) delete items[iid];
          }
        };
        walk(doc);
        for (const rid of removeDocIds) delete docs[rid];
        // Unlink from parent / root.
        let rootDocIds = s.rootDocIds.filter((x) => x !== id);
        if (doc.parentId && docs[doc.parentId]) {
          docs[doc.parentId] = {
            ...docs[doc.parentId],
            children: docs[doc.parentId].children.filter((x) => x !== id),
          };
        }
        let currentDocId = s.currentDocId;
        if (currentDocId && removeDocIds.includes(currentDocId)) {
          currentDocId = Object.values(docs).find((d) => d.kind === 'document')?.id ?? null;
        }
        return { docs, items, rootDocIds, currentDocId, zoomItemId: null };
      });
    },

    toggleBookmark: (id) =>
      set((s) => {
        const doc = s.docs[id];
        if (!doc) return {};
        return { docs: { ...s.docs, [id]: { ...doc, bookmarked: !doc.bookmarked } } };
      }),

    toggleFolderExpanded: (id) =>
      set((s) => {
        const doc = s.docs[id];
        if (!doc) return {};
        return { docs: { ...s.docs, [id]: { ...doc, expanded: !doc.expanded } } };
      }),

    moveDoc: (id, newParentId, index) => {
      pushHistory();
      set((s) => {
        const doc = s.docs[id];
        if (!doc) return {};
        // Guard against dropping a folder into itself or a descendant.
        if (newParentId) {
          let cur: string | null = newParentId;
          while (cur) {
            if (cur === id) return {};
            cur = s.docs[cur]?.parentId ?? null;
          }
        }
        const docs = { ...s.docs };
        let rootDocIds = [...s.rootDocIds];
        // When reordering within the same container, removing the item first
        // shifts every later index down by one — compensate so a downward move
        // lands where the caller intended.
        const sameContainer = (doc.parentId ?? null) === (newParentId ?? null);
        const oldSiblings = doc.parentId ? docs[doc.parentId]?.children ?? [] : rootDocIds;
        const oldIndex = oldSiblings.indexOf(id);
        let insertAt = index;
        if (sameContainer && oldIndex !== -1 && oldIndex < index) insertAt -= 1;
        // Detach from old location.
        if (doc.parentId && docs[doc.parentId]) {
          docs[doc.parentId] = {
            ...docs[doc.parentId],
            children: docs[doc.parentId].children.filter((x) => x !== id),
          };
        } else {
          rootDocIds = rootDocIds.filter((x) => x !== id);
        }
        // Attach to new location.
        if (newParentId && docs[newParentId]) {
          const kids = [...docs[newParentId].children];
          kids.splice(insertAt, 0, id);
          docs[newParentId] = { ...docs[newParentId], children: kids, expanded: true };
        } else {
          rootDocIds.splice(index, 0, id);
        }
        docs[id] = { ...doc, parentId: newParentId };
        return { docs, rootDocIds };
      });
    },

    selectDoc: (id) => {
      const doc = get().docs[id];
      if (!doc || doc.kind !== 'document') return;
      set({ currentDocId: id, zoomItemId: null, filterQuery: '' });
      const first = doc.rootItemId ? get().items[doc.rootItemId]?.children[0] : undefined;
      if (first) get().requestFocus(first, 'end');
    },

    setDocSettings: (id, partial) =>
      set((s) => {
        const doc = s.docs[id];
        if (!doc) return {};
        return {
          docs: { ...s.docs, [id]: { ...doc, settings: { ...doc.settings, ...partial } } },
        };
      }),

    // -------------------------------------------------------------- editing
    setText: (id, text) => {
      pushHistory(id);
      set((s) => {
        const item = s.items[id];
        if (!item) return {};
        return { items: { ...s.items, [id]: touch({ ...item, text }) } };
      });
    },

    setNote: (id, note) => {
      pushHistory('note:' + id);
      set((s) => {
        const item = s.items[id];
        if (!item) return {};
        return { items: { ...s.items, [id]: touch({ ...item, note }) } };
      });
    },

    insertItemAfter: (id, before, after) => {
      pushHistory();
      set((s) => {
        const item = s.items[id];
        if (!item) return {};
        const items = { ...s.items };
        const parentId = item.parent;
        const newItem = makeItem(parentId, { text: after ?? '', checkbox: item.checkbox });
        // Inherit the column so a new sibling stays in the same column-view lane.
        newItem.column = item.column;
        // Apply text split to the original if provided.
        if (before !== undefined) items[id] = touch({ ...item, text: before });
        // If the source is expanded with children, the new node becomes its
        // first child (matches Dynalist/WorkFlowy). Otherwise a next sibling.
        if (item.children.length && !item.collapsed) {
          newItem.parent = id;
          items[newItem.id] = newItem;
          items[id] = { ...items[id], children: [newItem.id, ...items[id].children] };
        } else if (parentId && items[parentId]) {
          items[newItem.id] = newItem;
          const kids = [...items[parentId].children];
          kids.splice(kids.indexOf(id) + 1, 0, newItem.id);
          items[parentId] = { ...items[parentId], children: kids };
        } else {
          return {};
        }
        return { items, focus: { id: newItem.id, pos: 'start', ts: Date.now() } };
      });
    },

    insertChild: (id) => {
      pushHistory();
      set((s) => {
        const item = s.items[id];
        if (!item) return {};
        const child = makeItem(id, { checkbox: item.checkbox });
        const items = {
          ...s.items,
          [child.id]: child,
          [id]: { ...item, children: [...item.children, child.id], collapsed: false },
        };
        return { items, focus: { id: child.id, pos: 'start', ts: Date.now() } };
      });
    },

    addBlockInColumn: (parentId, column) => {
      pushHistory();
      set((s) => {
        const parent = s.items[parentId];
        if (!parent) return {};
        const child = makeItem(parentId);
        child.column = Math.max(0, column);
        const items = {
          ...s.items,
          [child.id]: child,
          [parentId]: { ...parent, children: [...parent.children, child.id], collapsed: false },
        };
        return { items, focus: { id: child.id, pos: 'start', ts: Date.now() } };
      });
    },

    indent: (id) => {
      pushHistory();
      set((s) => {
        const item = s.items[id];
        if (!item || !item.parent) return {};
        const parent = s.items[item.parent];
        const idx = parent.children.indexOf(id);
        if (idx <= 0) return {}; // no previous sibling to nest under
        const prevSiblingId = parent.children[idx - 1];
        const prevSibling = s.items[prevSiblingId];
        const items = { ...s.items };
        items[item.parent] = {
          ...parent,
          children: parent.children.filter((x) => x !== id),
        };
        items[prevSiblingId] = {
          ...prevSibling,
          children: [...prevSibling.children, id],
          collapsed: false,
        };
        items[id] = { ...item, parent: prevSiblingId };
        return { items, focus: { id, pos: 'end', ts: Date.now() } };
      });
    },

    outdent: (id) => {
      pushHistory();
      set((s) => {
        const item = s.items[id];
        if (!item || !item.parent) return {};
        const rootId = currentRootItemId(s);
        // Cannot outdent past the current view's root.
        if (item.parent === rootId) return {};
        const parent = s.items[item.parent];
        const grandId = parent.parent;
        if (!grandId || !s.items[grandId]) return {};
        const grand = s.items[grandId];
        const items = { ...s.items };
        items[item.parent] = { ...parent, children: parent.children.filter((x) => x !== id) };
        const gk = [...grand.children];
        gk.splice(gk.indexOf(item.parent) + 1, 0, id);
        items[grandId] = { ...grand, children: gk };
        items[id] = { ...item, parent: grandId };
        return { items, focus: { id, pos: 'end', ts: Date.now() } };
      });
    },

    moveUp: (id) => {
      pushHistory();
      set((s) => {
        const item = s.items[id];
        if (!item || !item.parent) return {};
        const parent = s.items[item.parent];
        const idx = parent.children.indexOf(id);
        if (idx <= 0) return {};
        const kids = [...parent.children];
        [kids[idx - 1], kids[idx]] = [kids[idx], kids[idx - 1]];
        return {
          items: { ...s.items, [item.parent]: { ...parent, children: kids } },
          focus: { id, pos: 'end', ts: Date.now() },
        };
      });
    },

    moveDown: (id) => {
      pushHistory();
      set((s) => {
        const item = s.items[id];
        if (!item || !item.parent) return {};
        const parent = s.items[item.parent];
        const idx = parent.children.indexOf(id);
        if (idx < 0 || idx >= parent.children.length - 1) return {};
        const kids = [...parent.children];
        [kids[idx + 1], kids[idx]] = [kids[idx], kids[idx + 1]];
        return {
          items: { ...s.items, [item.parent]: { ...parent, children: kids } },
          focus: { id, pos: 'end', ts: Date.now() },
        };
      });
    },

    moveItem: (dragId, targetId, position) => {
      const s = get();
      const drag = s.items[dragId];
      const target = s.items[targetId];
      if (!drag || !target || dragId === targetId) return;
      // Never drop an item into itself or one of its own descendants.
      if (isAncestor(s.items, dragId, targetId)) return;
      pushHistory();
      set((st) => {
        const items = { ...st.items };
        // Detach from old parent.
        if (drag.parent && items[drag.parent]) {
          items[drag.parent] = {
            ...items[drag.parent],
            children: items[drag.parent].children.filter((x) => x !== dragId),
          };
        }
        if (position === 'child') {
          const t = items[targetId];
          items[targetId] = { ...t, children: [dragId, ...t.children], collapsed: false };
          items[dragId] = { ...items[dragId], parent: targetId };
        } else {
          const parentId = items[targetId].parent;
          if (!parentId || !items[parentId]) return {};
          const kids = [...items[parentId].children];
          const idx = kids.indexOf(targetId);
          kids.splice(position === 'before' ? idx : idx + 1, 0, dragId);
          items[parentId] = { ...items[parentId], children: kids };
          // Dropping next to a block adopts that block's column-view lane.
          items[dragId] = { ...items[dragId], parent: parentId, column: items[targetId].column };
        }
        return { items };
      });
    },

    backspaceMerge: (id) => {
      const s = get();
      const item = s.items[id];
      if (!item) return;
      const rootId = currentRootItemId(s);
      if (!rootId) return;
      const targetId = prevVisible(s.items, rootId, id);
      if (!targetId) return; // nothing above to merge into
      const target = s.items[targetId];
      // Don't let a parent swallow its own descendant in a confusing way.
      if (isAncestor(s.items, id, targetId)) return;
      pushHistory();
      set((st) => {
        const items = { ...st.items };
        const caret = target.text.length;
        // Move current's children to the end of the target.
        const movedChildren = item.children;
        items[targetId] = touch({
          ...target,
          text: target.text + item.text,
          children: [...target.children, ...movedChildren],
          collapsed: movedChildren.length ? false : target.collapsed,
        });
        for (const c of movedChildren) {
          if (items[c]) items[c] = { ...items[c], parent: targetId };
        }
        // Unlink current from its parent and delete it.
        if (item.parent && items[item.parent]) {
          items[item.parent] = {
            ...items[item.parent],
            children: items[item.parent].children.filter((x) => x !== id),
          };
        }
        delete items[id];
        return { items, focus: { id: targetId, pos: caret, ts: Date.now() } };
      });
    },

    deleteItem: (id) => {
      const s = get();
      const item = s.items[id];
      if (!item) return;
      const rootId = currentRootItemId(s);
      if (!rootId) return;
      // Prefer the row above; else the next sibling (never a descendant, which
      // is about to be deleted too); else the parent bullet.
      let focusTarget = prevVisible(s.items, rootId, id);
      if (!focusTarget && item.parent) {
        const sibs = s.items[item.parent].children;
        const pos = sibs.indexOf(id);
        const nextSib = pos >= 0 && pos < sibs.length - 1 ? sibs[pos + 1] : null;
        focusTarget = nextSib ?? (item.parent !== rootId ? item.parent : null);
      }
      pushHistory();
      set((st) => {
        const items = { ...st.items };
        for (const rid of subtreeIds(items, id)) delete items[rid];
        if (item.parent && items[item.parent]) {
          items[item.parent] = {
            ...items[item.parent],
            children: items[item.parent].children.filter((x) => x !== id),
          };
        }
        return {
          items,
          focus: focusTarget ? { id: focusTarget, pos: 'end', ts: Date.now() } : null,
        };
      });
    },

    toggleCollapse: (id) => {
      set((s) => {
        const item = s.items[id];
        if (!item || !item.children.length) return {};
        return { items: { ...s.items, [id]: { ...item, collapsed: !item.collapsed } } };
      });
    },

    setCollapsedAll: (collapsed) => {
      set((s) => {
        const rootId = currentRootItemId(s);
        if (!rootId) return {};
        const items = { ...s.items };
        for (const cid of descendantIds(items, rootId)) {
          const it = items[cid];
          if (it.children.length) items[cid] = { ...it, collapsed };
        }
        return { items };
      });
    },

    toggleComplete: (id) => {
      pushHistory();
      set((s) => {
        const item = s.items[id];
        if (!item) return {};
        return {
          items: {
            ...s.items,
            [id]: touch({ ...item, completed: !item.completed, checkbox: true }),
          },
        };
      });
    },

    toggleCheckbox: (id) => {
      pushHistory();
      set((s) => {
        const item = s.items[id];
        if (!item) return {};
        const checkbox = !item.checkbox;
        return {
          items: {
            ...s.items,
            [id]: touch({ ...item, checkbox, completed: checkbox ? item.completed : false }),
          },
        };
      });
    },

    cycleHeading: (id) => {
      pushHistory();
      set((s) => {
        const item = s.items[id];
        if (!item) return {};
        const heading = (item.heading + 1) % 4;
        return { items: { ...s.items, [id]: touch({ ...item, heading }) } };
      });
    },

    setHeading: (id, level) => {
      pushHistory();
      set((s) => {
        const item = s.items[id];
        if (!item) return {};
        return { items: { ...s.items, [id]: touch({ ...item, heading: level }) } };
      });
    },

    setColor: (id, color) => {
      pushHistory();
      set((s) => {
        const item = s.items[id];
        if (!item) return {};
        return { items: { ...s.items, [id]: touch({ ...item, color }) } };
      });
    },

    setBox: (id, box) => {
      pushHistory();
      set((s) => {
        const item = s.items[id];
        if (!item) return {};
        return { items: { ...s.items, [id]: touch({ ...item, box }) } };
      });
    },

    setItemColumn: (id, column) => {
      pushHistory();
      set((s) => {
        const item = s.items[id];
        if (!item) return {};
        return { items: { ...s.items, [id]: touch({ ...item, column: Math.max(0, column) }) } };
      });
    },

    setItemLr: (id, lr) => {
      pushHistory();
      set((s) => {
        const item = s.items[id];
        if (!item) return {};
        return { items: { ...s.items, [id]: touch({ ...item, lr }) } };
      });
    },

    addAttachments: (id, attachments) => {
      if (!attachments.length) return;
      pushHistory();
      set((s) => {
        const item = s.items[id];
        if (!item) return {};
        return {
          items: {
            ...s.items,
            [id]: touch({ ...item, attachments: [...(item.attachments ?? []), ...attachments] }),
          },
        };
      });
    },

    removeAttachment: (id, attachmentId) => {
      pushHistory();
      set((s) => {
        const item = s.items[id];
        if (!item) return {};
        return {
          items: {
            ...s.items,
            [id]: touch({
              ...item,
              attachments: (item.attachments ?? []).filter((a) => a.id !== attachmentId),
            }),
          },
        };
      });
    },

    duplicateItem: (id) => {
      pushHistory();
      set((s) => {
        const item = s.items[id];
        if (!item || !item.parent) return {};
        const parent = s.items[item.parent];
        const { rootId: newRootId, items: cloned } = cloneSubtree(s.items, id, item.parent);
        const items = { ...s.items, ...cloned };
        const kids = [...parent.children];
        kids.splice(kids.indexOf(id) + 1, 0, newRootId);
        items[item.parent] = { ...parent, children: kids };
        return { items, focus: { id: newRootId, pos: 'end', ts: Date.now() } };
      });
    },

    moveItemToDoc: (id, docId) => {
      pushHistory();
      set((s) => {
        const item = s.items[id];
        const targetDoc = s.docs[docId];
        if (!item || !item.parent || !targetDoc?.rootItemId) return {};
        const targetRoot = s.items[targetDoc.rootItemId];
        if (!targetRoot) return {};
        const items = { ...s.items };
        // Detach from old parent.
        items[item.parent] = {
          ...items[item.parent],
          children: items[item.parent].children.filter((x) => x !== id),
        };
        // Attach to target document root.
        items[targetDoc.rootItemId] = {
          ...targetRoot,
          children: [...targetRoot.children, id],
        };
        items[id] = { ...item, parent: targetDoc.rootItemId };
        return { items };
      });
    },

    // ------------------------------------------------------------- clipboard
    copyItem: (id) => {
      const s = get();
      if (!s.items[id]) return;
      const { rootId, items } = cloneSubtree(s.items, id, null);
      set({ clipboard: { rootId, items } });
    },

    cutItem: (id) => {
      get().copyItem(id);
      get().deleteItem(id);
    },

    pasteInto: (id) => {
      const s = get();
      const clip = s.clipboard;
      const target = s.items[id];
      if (!clip || !target) return;
      pushHistory();
      // Re-clone so the same clipboard can be pasted multiple times.
      const { rootId, items: cloned } = cloneSubtree(clip.items, clip.rootId, null);
      set((st) => {
        const items = { ...st.items, ...cloned };
        const pastedRoot = items[rootId];
        // Paste as a sibling right after the target.
        const parentId = target.parent;
        if (parentId && items[parentId]) {
          items[rootId] = { ...pastedRoot, parent: parentId };
          const kids = [...items[parentId].children];
          kids.splice(kids.indexOf(id) + 1, 0, rootId);
          items[parentId] = { ...items[parentId], children: kids };
        } else {
          return {};
        }
        return { items, focus: { id: rootId, pos: 'end', ts: Date.now() } };
      });
    },

    // --------------------------------------------------------------- import
    importAsDocument: (title, nodes, parentId = null) => {
      pushHistory();
      const rootItem = makeItem(null);
      const built = buildImportItems(nodes, rootItem.id);
      rootItem.children = built.rootIds;
      const doc: Doc = {
        id: newId(),
        kind: 'document',
        title: title || 'Imported',
        parentId,
        children: [],
        rootItemId: rootItem.id,
        bookmarked: false,
        expanded: true,
        settings: { ...DEFAULT_DOC_SETTINGS },
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      };
      set((s) => {
        const items = { ...s.items, [rootItem.id]: rootItem, ...built.items };
        const docs = { ...s.docs, [doc.id]: doc };
        let rootDocIds = s.rootDocIds;
        if (parentId && docs[parentId]) {
          docs[parentId] = {
            ...docs[parentId],
            children: [...docs[parentId].children, doc.id],
            expanded: true,
          };
        } else {
          rootDocIds = [...s.rootDocIds, doc.id];
        }
        return { items, docs, rootDocIds, currentDocId: doc.id, zoomItemId: null };
      });
      return doc.id;
    },

    appendImportUnder: (itemId, nodes) => {
      pushHistory();
      set((s) => {
        const parent = s.items[itemId];
        if (!parent) return {};
        const built = buildImportItems(nodes, itemId);
        const items = { ...s.items, ...built.items };
        items[itemId] = { ...parent, children: [...parent.children, ...built.rootIds] };
        return { items };
      });
    },

    // ------------------------------------------------------------ navigation
    zoomIn: (id) => {
      if (!get().items[id]) return;
      set({ zoomItemId: id, filterQuery: '' });
    },
    zoomOut: () =>
      set((s) => {
        if (!s.zoomItemId) return {};
        const parent = s.items[s.zoomItemId]?.parent;
        const doc = s.currentDocId ? s.docs[s.currentDocId] : null;
        const rootItemId = doc?.rootItemId ?? null;
        return { zoomItemId: parent && parent !== rootItemId ? parent : null };
      }),
    setZoom: (id) => set({ zoomItemId: id }),

    revealItem: (itemId) => {
      const s = get();
      if (!s.items[itemId]) return;
      // Walk up to the document root item, expanding ancestors along the way.
      const items = { ...s.items };
      let cur: string | null = s.items[itemId].parent;
      let rootItemId: string | null = null;
      const guard = new Set<string>();
      while (cur && !guard.has(cur)) {
        guard.add(cur);
        if (items[cur].collapsed) items[cur] = { ...items[cur], collapsed: false };
        if (items[cur].parent === null) {
          rootItemId = cur;
          break;
        }
        cur = items[cur].parent;
      }
      const doc = Object.values(s.docs).find((d) => d.rootItemId === rootItemId);
      set({
        items,
        currentDocId: doc ? doc.id : s.currentDocId,
        zoomItemId: null,
        filterQuery: '',
        focus: { id: itemId, pos: 'end', ts: Date.now() },
      });
    },

    setFilterQuery: (q) => set({ filterQuery: q }),

    setPreferences: (partial) =>
      set((s) => ({ preferences: { ...s.preferences, ...partial } })),

    // --------------------------------------------------------------- history
    undo: () => {
      const s = get();
      if (!s.undoStack.length) return;
      const prev = s.undoStack[s.undoStack.length - 1];
      lastEditItem = null;
      set({
        items: prev.items,
        docs: prev.docs,
        rootDocIds: prev.rootDocIds,
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, snapshot(s)],
      });
    },

    redo: () => {
      const s = get();
      if (!s.redoStack.length) return;
      const next = s.redoStack[s.redoStack.length - 1];
      lastEditItem = null;
      set({
        items: next.items,
        docs: next.docs,
        rootDocIds: next.rootDocIds,
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, snapshot(s)],
      });
    },
  };
});

// --------------------------------------------------------------------------
// Convert a neutral ImportNode tree into concrete items under `parentId`.
// --------------------------------------------------------------------------
function buildImportItems(
  nodes: ImportNode[],
  parentId: string,
): { rootIds: string[]; items: ItemMap } {
  const items: ItemMap = {};
  const build = (node: ImportNode, parent: string): string => {
    const it = makeItem(parent, {
      text: node.text ?? '',
      note: node.note ?? '',
      checkbox: !!node.checkbox,
    });
    it.completed = !!node.completed;
    it.collapsed = !!node.collapsed;
    it.heading = typeof node.heading === 'number' ? Math.max(0, Math.min(3, node.heading)) : 0;
    it.color =
      node.color && (COLOR_LABELS as string[]).includes(node.color)
        ? (node.color as OutlineItem['color'])
        : null;
    if (Array.isArray(node.attachments)) it.attachments = node.attachments;
    items[it.id] = it;
    it.children = (node.children ?? []).map((c) => build(c, it.id));
    return it.id;
  };
  const rootIds = nodes.map((n) => build(n, parentId));
  return { rootIds, items };
}

// --------------------------------------------------------------------------
// Seed document for first run.
// --------------------------------------------------------------------------
function createSeed(): Partial<StoreState> {
  const items: ItemMap = {};
  const docs: Record<string, Doc> = {};
  const root = makeItem(null);
  items[root.id] = root;

  const add = (parentId: string, text: string, opts: Partial<OutlineItem> = {}): string => {
    const it = makeItem(parentId, { text });
    Object.assign(it, opts);
    items[it.id] = it;
    items[parentId] = { ...items[parentId], children: [...items[parentId].children, it.id] };
    return it.id;
  };

  add(root.id, 'Welcome to **Outliner** — your private, local-first outliner ⌨️', { heading: 1 });
  const feats = add(root.id, 'Everything is a bullet. Try these #keyboard shortcuts:');
  add(feats, 'Press **Enter** to create a new bullet');
  add(feats, '**Tab** / **Shift+Tab** to indent and outdent');
  add(feats, '**Ctrl+Shift+↑/↓** to move a bullet up or down');
  add(feats, 'Click a bullet dot to **zoom in**; use the breadcrumb to zoom out');
  add(feats, 'Press **Ctrl+/** anytime for the full shortcut list');
  items[feats] = { ...items[feats], collapsed: false };

  const md = add(root.id, 'Rich text with `inline markdown`:');
  add(md, 'You can write **bold**, *italic*, ~~strikethrough~~, `code` and ==highlight==');
  add(md, 'Link to anything: [Dynalist](https://dynalist.io)');
  add(md, 'Tag things with #project and @people — they are color-coded');
  add(md, 'Schedule with dates like !(2026-07-10) — click to open the picker');
  add(md, 'Link between bullets with [[Ship it]] — click it to jump there');

  const todo = add(root.id, 'A checklist (press **Ctrl+Enter** to complete):', { collapsed: false });
  add(todo, 'Design the outliner', { checkbox: true, completed: true });
  add(todo, 'Add dark VSCode theme', { checkbox: true, completed: true });
  add(todo, 'Ship it', { checkbox: true, completed: false });

  add(root.id, 'Use the sidebar to create more documents and folders. Everything is saved locally in your browser.', { color: 'green' });

  const doc: Doc = {
    id: newId(),
    kind: 'document',
    title: 'Welcome',
    parentId: null,
    children: [],
    rootItemId: root.id,
    bookmarked: true,
    expanded: true,
    settings: { ...DEFAULT_DOC_SETTINGS },
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
  docs[doc.id] = doc;

  return { items, docs, rootDocIds: [doc.id], currentDocId: doc.id };
}

// --------------------------------------------------------------------------
// Persistence: debounced auto-save whenever the persisted slice changes.
// IndexedDB is always written (fast local cache); a connected file is written
// too (the durable, portable copy).
// --------------------------------------------------------------------------
const persist = debounce((state: PersistedState) => void saveState(state), 400);
const persistFile = debounce((state: PersistedState) => {
  if (currentHandle) void writeFileState(currentHandle, state);
}, 900);

useStore.subscribe((s) => {
  if (!s.loaded) return;
  const state: PersistedState = {
    version: STATE_VERSION,
    items: s.items,
    docs: s.docs,
    rootDocIds: s.rootDocIds,
    currentDocId: s.currentDocId,
    preferences: s.preferences,
  };
  persist(state);
  persistFile(state);
});
