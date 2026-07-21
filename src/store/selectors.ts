// ---------------------------------------------------------------------------
// Derived views over the item / doc graph. Pure functions, memo-friendly.
// ---------------------------------------------------------------------------
import type { OutlineItem, Doc } from '../types';
import type { ItemMap } from '../lib/tree';
import { plainText } from '../lib/markdown';
import { TAG_RE } from '../lib/tags';

export interface TagCount {
  tag: string;
  count: number;
}

/** Collect every sigil tag (#tag @mention § & % $ £) with usage counts. */
export function collectTags(items: ItemMap): TagCount[] {
  const counts = new Map<string, number>();
  for (const item of Object.values(items)) {
    const text = item.text;
    TAG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TAG_RE.exec(text))) {
      const tag = m[0]; // full "sigil+name"
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** The document that (transitively) contains an item, if any. */
export function docForItem(
  items: ItemMap,
  docs: Record<string, Doc>,
  itemId: string,
): Doc | null {
  let cur: string | null = itemId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const parent: string | null = items[cur]?.parent ?? null;
    if (parent === null) {
      // cur is a document root item — find its doc.
      return Object.values(docs).find((d) => d.rootItemId === cur) ?? null;
    }
    cur = parent;
  }
  return null;
}

/** First item whose plain-text equals `title` (for [[internal link]] jumps). */
export function findItemByTitle(items: ItemMap, title: string): OutlineItem | null {
  const needle = title.trim().toLowerCase();
  for (const item of Object.values(items)) {
    if (plainText(item.text).toLowerCase() === needle) return item;
  }
  return null;
}

/** Items that link to `title` via [[title]]. */
export function backlinks(items: ItemMap, title: string): OutlineItem[] {
  const needle = `[[${title.trim().toLowerCase()}]]`;
  return Object.values(items).filter((it) => it.text.toLowerCase().includes(needle));
}

/** Items that carry an explicit color label (used by the "labels" view). */
export function coloredItems(items: ItemMap): OutlineItem[] {
  return Object.values(items).filter((it) => it.color);
}
