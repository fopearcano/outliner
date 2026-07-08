// ---------------------------------------------------------------------------
// Pure helpers over the normalized item map. No store, no side effects.
// ---------------------------------------------------------------------------
import type { OutlineItem } from '../types';
import { newId } from './id';

export type ItemMap = Record<string, OutlineItem>;

export function getItem(items: ItemMap, id: string): OutlineItem | undefined {
  return items[id];
}

/** All ancestor ids from the immediate parent up to (but excluding) the root. */
export function ancestorIds(items: ItemMap, id: string): string[] {
  const out: string[] = [];
  let cur = items[id]?.parent;
  while (cur) {
    out.push(cur);
    cur = items[cur]?.parent ?? null;
  }
  return out;
}

/** Depth-first list of every descendant id (excluding the item itself). */
export function descendantIds(items: ItemMap, id: string): string[] {
  const out: string[] = [];
  const stack = [...(items[id]?.children ?? [])];
  while (stack.length) {
    const cur = stack.shift()!;
    out.push(cur);
    const node = items[cur];
    if (node) stack.unshift(...node.children);
  }
  return out;
}

/** The subtree rooted at id, id-first, depth-first. */
export function subtreeIds(items: ItemMap, id: string): string[] {
  return [id, ...descendantIds(items, id)];
}

export interface FlatRow {
  id: string;
  depth: number;
}

/**
 * Flatten the visible tree under `rootId`, respecting collapse state. The root
 * itself is not included — only its (recursively) visible descendants.
 */
export function flattenVisible(items: ItemMap, rootId: string): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (id: string, depth: number) => {
    const node = items[id];
    if (!node) return;
    for (const childId of node.children) {
      out.push({ id: childId, depth });
      const child = items[childId];
      if (child && !child.collapsed && child.children.length) {
        walk(childId, depth + 1);
      }
    }
  };
  walk(rootId, 0);
  return out;
}

/** The visible row immediately before `id` within the outline under `rootId`. */
export function prevVisible(items: ItemMap, rootId: string, id: string): string | null {
  const rows = flattenVisible(items, rootId);
  const idx = rows.findIndex((r) => r.id === id);
  return idx > 0 ? rows[idx - 1].id : null;
}

/** The visible row immediately after `id` within the outline under `rootId`. */
export function nextVisible(items: ItemMap, rootId: string, id: string): string | null {
  const rows = flattenVisible(items, rootId);
  const idx = rows.findIndex((r) => r.id === id);
  return idx >= 0 && idx < rows.length - 1 ? rows[idx + 1].id : null;
}

/** Is `maybeAncestor` an ancestor of (or equal to) `id`? */
export function isAncestor(items: ItemMap, maybeAncestor: string, id: string): boolean {
  if (maybeAncestor === id) return true;
  return ancestorIds(items, id).includes(maybeAncestor);
}

/** Index of `id` within its parent's children array. */
export function indexInParent(items: ItemMap, id: string): number {
  const parent = items[id]?.parent;
  if (!parent) return -1;
  return items[parent]?.children.indexOf(id) ?? -1;
}

export interface Blank {
  text?: string;
  note?: string;
  checkbox?: boolean;
}

export function makeItem(parent: string | null, blank: Blank = {}): OutlineItem {
  const now = Date.now();
  return {
    id: newId(),
    text: blank.text ?? '',
    note: blank.note ?? '',
    children: [],
    parent,
    collapsed: false,
    checkbox: blank.checkbox ?? false,
    completed: false,
    heading: 0,
    color: null,
    createdAt: now,
    modifiedAt: now,
  };
}

/**
 * Deep-clone a subtree, minting fresh ids. Returns the new root id plus every
 * newly created item keyed by its new id (ready to splice into a map). The new
 * root's parent is set to `newParent`.
 */
export function cloneSubtree(
  items: ItemMap,
  rootId: string,
  newParent: string | null,
): { rootId: string; items: ItemMap } {
  const created: ItemMap = {};
  const clone = (id: string, parent: string | null): string => {
    const src = items[id];
    if (!src) return id;
    const copy: OutlineItem = {
      ...src,
      id: newId(),
      parent,
      children: [],
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    created[copy.id] = copy;
    copy.children = src.children.map((c) => clone(c, copy.id));
    return copy.id;
  };
  const newRootId = clone(rootId, newParent);
  return { rootId: newRootId, items: created };
}
