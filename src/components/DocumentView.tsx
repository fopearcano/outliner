// ---------------------------------------------------------------------------
// The main pane: breadcrumb + (optional) zoom title + filter bar + outline.
// ---------------------------------------------------------------------------
import React, { useMemo, useRef } from 'react';
import { useStore, currentRootItemId } from '../store/store';
import OutlineNode from './OutlineNode';
import { ancestorIds } from '../lib/tree';
import { getCaretOffset } from '../lib/caret';
import { parseQuery, matchItem } from '../lib/search';
import { plainText, renderInline } from '../lib/markdown';
import { useUi } from './ui-context';
import ViewOptions from './ViewOptions';
import type { LrSide } from '../types';

export default function DocumentView() {
  const doc = useStore((s) => (s.currentDocId ? s.docs[s.currentDocId] : null));
  const zoomItemId = useStore((s) => s.zoomItemId);
  const items = useStore((s) => s.items);
  const filterQuery = useStore((s) => s.filterQuery);
  const rootId = useStore((s) => currentRootItemId(s));
  const showCompleted = useStore((s) => s.preferences.showCompleted);

  const query = useMemo(() => (filterQuery.trim() ? parseQuery(filterQuery) : null), [filterQuery]);

  // Compute which items are visible while filtering (matches + their ancestors).
  const visibleSet = useMemo(() => {
    if (!query || !rootId) return null;
    const set = new Set<string>();
    const walk = (pid: string) => {
      for (const cid of items[pid]?.children ?? []) {
        if (matchItem(items[cid], query)) {
          set.add(cid);
          for (const a of ancestorIds(items, cid)) {
            if (a === rootId) break;
            set.add(a);
          }
        }
        walk(cid);
      }
    };
    walk(rootId);
    return set;
  }, [query, items, rootId]);

  if (!doc) {
    return (
      <div className="doc-empty">
        <p>No document selected.</p>
        <p className="hint">Create one from the sidebar, or press the + button.</p>
      </div>
    );
  }

  const zoomItem = zoomItemId ? items[zoomItemId] : null;

  // Breadcrumb trail from document root down to the zoomed item.
  const crumbs: { id: string | null; label: string }[] = [{ id: null, label: doc.title }];
  if (zoomItem) {
    const chain = [...ancestorIds(items, zoomItemId!)].reverse().filter((a) => a !== doc.rootItemId);
    for (const a of chain) crumbs.push({ id: a, label: plainText(items[a].text) || 'Untitled' });
    crumbs.push({ id: zoomItemId, label: plainText(zoomItem.text) || 'Untitled' });
  }

  const rootChildren = rootId ? items[rootId]?.children ?? [] : [];

  const addTrailingBullet = () => {
    if (rootId) useStore.getState().insertChild(rootId);
  };

  // Special layouts apply only at the document root (not zoomed / not filtering).
  const atRoot = !zoomItem;
  const vm = doc.settings.viewMode;
  const showColumns = vm === 'col2' && atRoot && !query;
  const showLr = vm === 'lr' && atRoot && !query;
  const wide = showColumns || showLr;

  // Which top-level children the plain outline / L-R views show. The independent
  // 2nd column (column >= 1) is only visible in the 2-column view — hidden here.
  const outlineChildren = query
    ? rootChildren.filter((c) => visibleSet?.has(c))
    : atRoot
      ? rootChildren.filter((c) => (items[c]?.column ?? 0) === 0)
      : rootChildren;

  // L-R view: flatten the visible tree so EVERY block (at any depth) is its own
  // row that can be shifted left/right of the centre line independently, while
  // keeping its vertical position, indent depth and sibling number. (A parent no
  // longer drags its children across — each block carries its own `lr` side.)
  const lrRows: { id: string; depth: number; number: number }[] = [];
  if (showLr) {
    const walk = (ids: string[], depth: number) => {
      let n = 0;
      for (const cid of ids) {
        const it = items[cid];
        if (!it) continue;
        if (showCompleted === false && it.completed) continue;
        lrRows.push({ id: cid, depth, number: n });
        n++;
        if (!it.collapsed && it.children.length) walk(it.children, depth + 1);
      }
    };
    walk(outlineChildren, 0);
  }

  return (
    <div className={'doc-view' + (wide ? ' wide' : '')}>
      <div className="breadcrumb">
        {crumbs.map((c, i) => (
          <React.Fragment key={c.id ?? 'root'}>
            {i > 0 && <span className="crumb-sep">›</span>}
            <button
              className={'crumb' + (i === crumbs.length - 1 ? ' current' : '')}
              onClick={() => useStore.getState().setZoom(c.id)}
            >
              {c.label}
            </button>
          </React.Fragment>
        ))}
        <div className="breadcrumb-spacer" />
        <FilterBar />
        <ViewOptions />
      </div>

      {zoomItem ? (
        <ZoomTitle id={zoomItemId!} />
      ) : (
        <DocTitle docId={doc.id} title={doc.title} />
      )}

      {showColumns && rootId ? (
        <ColumnBody rootId={rootId} fit={doc.settings.columnFit} zoom={doc.settings.columnZoom} />
      ) : showLr && rootId ? (
        <LrBody rootId={rootId} rows={lrRows} />
      ) : (
        <>
          <div className="outline">
            {outlineChildren.length === 0 && !query && (
              <div className="node">
                <div className="node-row">
                  <div className="node-content">
                    <div className="node-text empty" onMouseDown={addTrailingBullet}>
                      <span className="placeholder">Click to start typing…</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {rootId &&
              outlineChildren.map((cid, i) => (
                <OutlineNode
                  key={cid}
                  id={cid}
                  depth={0}
                  visibleSet={visibleSet}
                  // Number contiguously at the doc root so hiding the 2nd-column
                  // stash doesn't leave gaps (e.g. 1, 3). Zoom/filter keep native.
                  numberOverride={atRoot && !query ? i : undefined}
                />
              ))}

            {query && visibleSet && visibleSet.size === 0 && (
              <div className="doc-empty">
                <p>No bullets match “{filterQuery}”.</p>
              </div>
            )}
          </div>

          {!query && outlineChildren.length > 0 && (
            <div className="outline-tail" onClick={addTrailingBullet} title="Add a bullet">
              <span>+ add bullet</span>
            </div>
          )}
        </>
      )}

      {zoomItem && <Backlinks title={plainText(zoomItem.text)} />}
    </div>
  );
}

// --------------------------------------------------------------------------
// 2-column layout: the main column (0) plus an independent 2nd column (1).
// Blocks in column 1 only exist here — they're hidden in the other views.
// --------------------------------------------------------------------------
const COLS = 2;
function ColumnBody({
  rootId,
  fit,
  zoom,
}: {
  rootId: string;
  fit: 'wrap' | 'scroll';
  zoom: number;
}) {
  const items = useStore((s) => s.items);
  const fontSize = useStore((s) => s.preferences.fontSize);
  const showCompleted = useStore((s) => s.preferences.showCompleted);
  const children = items[rootId]?.children ?? [];

  const count = COLS;
  const cols: string[][] = Array.from({ length: count }, () => []);
  for (const id of children) {
    // Skip blocks that OutlineNode would render as nothing (hidden completed),
    // so we don't leave empty wrappers with dangling move controls.
    if (!showCompleted && items[id]?.completed) continue;
    const c = Math.min(count - 1, Math.max(0, items[id]?.column ?? 0));
    cols[c].push(id);
  }

  const style: React.CSSProperties =
    fit === 'scroll'
      ? ({ ['--font-size' as string]: `${fontSize * zoom}px` } as React.CSSProperties)
      : { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` };

  return (
    <div className={'columns ' + fit} style={style}>
      {cols.map((ids, i) => (
        <div className="column" key={i}>
          {ids.map((id, n) => (
            <ColumnBlock key={id} id={id} col={i} count={count} index={n} />
          ))}
          <div
            className="col-add"
            onClick={() => useStore.getState().addBlockInColumn(rootId, i)}
            title="Add a block to this column"
          >
            + block
          </div>
        </div>
      ))}
    </div>
  );
}

function ColumnBlock({
  id,
  col,
  count,
  index,
}: {
  id: string;
  col: number;
  count: number;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Moving a block to another column re-parents it in the DOM, so React
  // remounts its subtree. If the block (or one of its children) is being
  // edited, capture the caret first and re-issue a focus request afterward so
  // the remounted editor re-opens at the same spot — no lost typing.
  const move = (dir: -1 | 1) => {
    const active = document.activeElement as HTMLElement | null;
    let focusId: string | null = null;
    let caret: number | 'end' = 'end';
    if (
      active &&
      ref.current?.contains(active) &&
      active.isContentEditable &&
      active.classList.contains('node-text')
    ) {
      focusId = (active.closest('.node') as HTMLElement | null)?.dataset.id ?? null;
      caret = getCaretOffset(active);
    }
    useStore.getState().setItemColumn(id, col + dir);
    if (focusId) useStore.getState().requestFocus(focusId, caret);
  };

  return (
    <div className="col-block" ref={ref}>
      <div className="col-move">
        <button
          className="col-move-btn"
          disabled={col === 0}
          title="Move left"
          onMouseDown={(e) => {
            e.preventDefault();
            move(-1);
          }}
        >
          ◀
        </button>
        <button
          className="col-move-btn"
          disabled={col === count - 1}
          title="Move right"
          onMouseDown={(e) => {
            e.preventDefault();
            move(1);
          }}
        >
          ▶
        </button>
      </div>
      <OutlineNode id={id} depth={0} visibleSet={null} numberOverride={index} />
    </div>
  );
}

// --------------------------------------------------------------------------
// Left-Right layout: each block keeps its own row (so vertical position and
// numbering are unchanged) but can be shifted to the left of the central line
// or back to the right. Toggling sides only swaps a CSS class, so — unlike the
// column view — editing is never interrupted.
// --------------------------------------------------------------------------
function LrBody({ rootId, rows }: { rootId: string; rows: { id: string; depth: number; number: number }[] }) {
  return (
    <div className="lr">
      {rows.map((r) => (
        <LrBlock key={r.id} id={r.id} depth={r.depth} number={r.number} />
      ))}
      <div
        className="col-add lr-add"
        onClick={() => useStore.getState().insertChild(rootId)}
        title="Add a block"
      >
        + block
      </div>
    </div>
  );
}

function LrBlock({ id, depth, number }: { id: string; depth: number; number: number }) {
  const side = useStore((s) => s.items[id]?.lr ?? 'right');
  const setSide = (to: LrSide) => useStore.getState().setItemLr(id, to);
  return (
    <div className={'lr-row ' + side}>
      <div className="lr-cell">
        <div className="lr-move">
          <button
            className="col-move-btn"
            disabled={side === 'left'}
            title="Move left of the line"
            onMouseDown={(e) => {
              e.preventDefault();
              setSide('left');
            }}
          >
            ◀
          </button>
          <button
            className="col-move-btn"
            disabled={side === 'right'}
            title="Move right of the line"
            onMouseDown={(e) => {
              e.preventDefault();
              setSide('right');
            }}
          >
            ▶
          </button>
        </div>
        <div className="lr-indent" style={depth ? { paddingLeft: depth * 20 } : undefined}>
          <OutlineNode id={id} depth={0} visibleSet={null} numberOverride={number} flat />
        </div>
      </div>
    </div>
  );
}

function FilterBar() {
  const filterQuery = useStore((s) => s.filterQuery);
  return (
    <div className="filter-bar">
      <span className="filter-icon">⌕</span>
      <input
        className="filter-input"
        value={filterQuery}
        placeholder="Filter (try #tag or is:incomplete)…"
        onChange={(e) => useStore.getState().setFilterQuery(e.target.value)}
      />
      {filterQuery && (
        <button className="filter-clear" onClick={() => useStore.getState().setFilterQuery('')}>
          ✕
        </button>
      )}
    </div>
  );
}

function DocTitle({ docId, title }: { docId: string; title: string }) {
  return (
    <input
      className="doc-title"
      value={title}
      onChange={(e) => useStore.getState().renameDoc(docId, e.target.value)}
      placeholder="Untitled document"
    />
  );
}

function ZoomTitle({ id }: { id: string }) {
  const item = useStore((s) => s.items[id]);
  const ui = useUi();
  if (!item) return null;
  return (
    <h1 className="zoom-title" onClick={() => useStore.getState().requestFocus(id, 'end')}>
      {item.text ? (
        renderInline(item.text, { onTag: ui.onTag, onInternalLink: ui.onInternalLink })
      ) : (
        <span className="placeholder">Untitled</span>
      )}
    </h1>
  );
}

function Backlinks({ title }: { title: string }) {
  const items = useStore((s) => s.items);
  const refs = useMemo(() => {
    if (!title) return [];
    const needle = `[[${title.toLowerCase()}]]`;
    return Object.values(items).filter((it) => it.text.toLowerCase().includes(needle));
  }, [items, title]);
  if (!refs.length) return null;
  return (
    <div className="backlinks">
      <div className="backlinks-head">↩ {refs.length} backlink{refs.length > 1 ? 's' : ''}</div>
      {refs.map((r) => (
        <button key={r.id} className="backlink" onClick={() => useStore.getState().requestFocus(r.id, 'end')}>
          {plainText(r.text) || 'Untitled'}
        </button>
      ))}
    </div>
  );
}
