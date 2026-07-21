// ---------------------------------------------------------------------------
// Build an "analytical map" (Obsidian-style connection graph) from the outline.
//
// Nodes: bullets, #tags, @mentions and (optionally) documents.
// Edges: [[internal links]] between bullets, tag/mention membership, and
//        (optionally) which document a bullet belongs to.
// Pure function — the panel re-runs it whenever the store changes.
// ---------------------------------------------------------------------------
import type { Doc } from '../types';
import { COLOR_HEX } from '../types';
import type { ItemMap } from './tree';
import { plainText } from './markdown';

const TAG_RE = /(?<!\S)([#@][\p{L}\p{N}_\-/]+)/gu;
const LINK_RE = /\[\[([^\]]+?)\]\]/g;

export type GNodeType = 'doc' | 'bullet' | 'tag' | 'mention';
export type GEdgeKind = 'link' | 'tag' | 'doc';

export interface GNode {
  id: string;
  type: GNodeType;
  label: string;
  /** item id (bullet/doc) or the raw "#tag"/"@mention". */
  ref: string;
  docId?: string;
  /** color-label hex for bullets that carry one. */
  color?: string | null;
  degree: number;
}

export interface GEdge {
  source: string;
  target: string;
  kind: GEdgeKind;
}

export interface GraphOpts {
  tags: boolean;
  docs: boolean;
  orphans: boolean;
  /** null = all documents; otherwise restrict to this document. */
  scopeDocId: string | null;
}

export interface Graph {
  nodes: GNode[];
  edges: GEdge[];
  /** how many nodes were dropped by the size cap (0 if none). */
  truncated: number;
}

const NODE_CAP = 700; // keep the sim smooth on huge outlines

export function buildGraph(items: ItemMap, docs: Record<string, Doc>, opts: GraphOpts): Graph {
  // Resolve [[title]] → item id (first exact plain-text match wins).
  const titleMap = new Map<string, string>();
  for (const it of Object.values(items)) {
    const t = plainText(it.text).trim().toLowerCase();
    if (t && !titleMap.has(t)) titleMap.set(t, it.id);
  }

  const rootToDoc = new Map<string, string>();
  for (const d of Object.values(docs)) if (d.rootItemId) rootToDoc.set(d.rootItemId, d.id);
  const docCache = new Map<string, string | null>();
  const docIdOf = (itemId: string): string | null => {
    if (docCache.has(itemId)) return docCache.get(itemId)!;
    let cur: string | null = itemId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (rootToDoc.has(cur)) {
        const d = rootToDoc.get(cur)!;
        docCache.set(itemId, d);
        return d;
      }
      cur = items[cur]?.parent ?? null;
    }
    docCache.set(itemId, null);
    return null;
  };
  const inScope = (itemId: string) => !opts.scopeDocId || docIdOf(itemId) === opts.scopeDocId;

  const nodeMap = new Map<string, GNode>();
  const edges: GEdge[] = [];

  const ensureBullet = (itemId: string): string => {
    const id = 'i:' + itemId;
    if (!nodeMap.has(id)) {
      const it = items[itemId];
      nodeMap.set(id, {
        id,
        type: 'bullet',
        label: plainText(it.text) || 'Untitled',
        ref: itemId,
        docId: docIdOf(itemId) ?? undefined,
        color: it.color ? COLOR_HEX[it.color] : null,
        degree: 0,
      });
    }
    return id;
  };
  const ensureTag = (tag: string): string => {
    const id = 't:' + tag.toLowerCase();
    if (!nodeMap.has(id)) {
      nodeMap.set(id, { id, type: tag[0] === '@' ? 'mention' : 'tag', label: tag, ref: tag, degree: 0 });
    }
    return id;
  };

  for (const it of Object.values(items)) {
    if (!it.parent) continue; // skip hidden document-root items
    if (!inScope(it.id)) continue;

    // [[internal links]] → bullet↔bullet edges
    LINK_RE.lastIndex = 0;
    let lm: RegExpExecArray | null;
    while ((lm = LINK_RE.exec(it.text))) {
      const targetId = titleMap.get(lm[1].trim().toLowerCase());
      if (targetId && targetId !== it.id && inScope(targetId)) {
        edges.push({ source: ensureBullet(it.id), target: ensureBullet(targetId), kind: 'link' });
      }
    }

    // #tags / @mentions → bullet↔tag edges
    if (opts.tags) {
      TAG_RE.lastIndex = 0;
      let tm: RegExpExecArray | null;
      const seen = new Set<string>();
      while ((tm = TAG_RE.exec(it.text))) {
        const key = tm[1].toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ source: ensureBullet(it.id), target: ensureTag(tm[1]), kind: 'tag' });
      }
    }
  }

  // Optionally surface every bullet (even unconnected ones).
  if (opts.orphans) {
    for (const it of Object.values(items)) if (it.parent && inScope(it.id)) ensureBullet(it.id);
  }

  // Optionally add a node per document, linked to its bullets (clusters by doc).
  if (opts.docs) {
    for (const n of [...nodeMap.values()]) {
      if (n.type !== 'bullet' || !n.docId) continue;
      const dId = 'd:' + n.docId;
      if (!nodeMap.has(dId)) {
        const d = docs[n.docId];
        nodeMap.set(dId, { id: dId, type: 'doc', label: d?.title || 'Document', ref: d?.rootItemId ?? '', degree: 0 });
      }
      edges.push({ source: dId, target: n.id, kind: 'doc' });
    }
  }

  let nodes = [...nodeMap.values()];
  const deg = new Map<string, number>();
  for (const e of edges) {
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
  }
  for (const n of nodes) n.degree = deg.get(n.id) ?? 0;

  let truncated = 0;
  let keptEdges = edges;
  if (nodes.length > NODE_CAP) {
    // keep the most-connected nodes (tags/docs always survive — they're the hubs)
    const ranked = [...nodes].sort((a, b) => {
      const ha = a.type === 'bullet' ? 0 : 1;
      const hb = b.type === 'bullet' ? 0 : 1;
      return hb - ha || b.degree - a.degree;
    });
    const keep = new Set(ranked.slice(0, NODE_CAP).map((n) => n.id));
    truncated = nodes.length - keep.size;
    nodes = nodes.filter((n) => keep.has(n.id));
    keptEdges = edges.filter((e) => keep.has(e.source) && keep.has(e.target));
  }

  return { nodes, edges: keptEdges, truncated };
}
