// ---------------------------------------------------------------------------
// The main pane: breadcrumb + (optional) zoom title + filter bar + outline.
// ---------------------------------------------------------------------------
import React, { useMemo } from 'react';
import { useStore, currentRootItemId } from '../store/store';
import OutlineNode from './OutlineNode';
import { ancestorIds } from '../lib/tree';
import { parseQuery, matchItem } from '../lib/search';
import { plainText, renderInline } from '../lib/markdown';
import { useUi } from './ui-context';
import ViewOptions from './ViewOptions';
import { LANES } from '../types';
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
  const showLr = vm === 'lr' && atRoot && !query;
  const showLr3 = vm === 'lr3' && atRoot && !query;
  const wide = showLr || showLr3;

  const outlineChildren = query
    ? rootChildren.filter((c) => visibleSet?.has(c))
    : rootChildren;

  // Both L-R views (2-lane and 3-column) flatten the visible tree so EVERY block
  // (at any depth) is its own row that can be shifted between lanes independently,
  // keeping its vertical position, indent depth and sibling number.
  const lrRows: { id: string; depth: number; number: number }[] = [];
  if (showLr || showLr3) {
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
        <SyncChip />
        <FilterBar />
        <ViewOptions />
      </div>

      {zoomItem ? (
        <ZoomTitle id={zoomItemId!} />
      ) : (
        <DocTitle docId={doc.id} title={doc.title} />
      )}

      {showLr && rootId ? (
        <LrBody rootId={rootId} rows={lrRows} />
      ) : showLr3 && rootId ? (
        <LaneBody rootId={rootId} rows={lrRows} />
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
// 3-column L-R layout: like the L-R view but with THREE fixed-width columns —
// left, centre (main) and right. Every block is its own row and shifts between
// columns with ◀ / ▶ (Alt/⌥ moves its whole subtree), keeping its vertical
// position, indent and number. Columns are a fixed width and the view scrolls
// horizontally on small screens instead of wrapping/shrinking. The block's cell
// is offset with margin (never re-parented), so editing is never interrupted.
// --------------------------------------------------------------------------
function LaneBody({ rootId, rows }: { rootId: string; rows: { id: string; depth: number; number: number }[] }) {
  const laneWidth = useStore((s) => s.preferences.laneWidth);
  return (
    <div className="lanes" style={{ ['--lane-w' as string]: `${laneWidth}px` }}>
      <div className="lanes-inner">
        <div className="lane-guide" style={{ left: 'var(--lane-w)' }} />
        <div className="lane-guide" style={{ left: 'calc(var(--lane-w) * 2)' }} />
        <div className="lane-head">
          <div className="lane-hcell">Left</div>
          <div className="lane-hcell">Main</div>
          <div className="lane-hcell">Right</div>
        </div>
        {rows.map((r) => (
          <LaneBlock key={r.id} id={r.id} depth={r.depth} number={r.number} />
        ))}
        <div
          className="col-add lane-add"
          onClick={() => useStore.getState().insertChild(rootId)}
          title="Add a block"
        >
          + block
        </div>
      </div>
    </div>
  );
}

function LaneBlock({ id, depth, number }: { id: string; depth: number; number: number }) {
  const lane = useStore((s) => s.items[id]?.lane ?? 'center');
  const hasKids = useStore((s) => (s.items[id]?.children.length ?? 0) > 0);
  const idx = LANES.indexOf(lane);
  // Plain click steps one column; Alt/⌥ moves the whole subtree to that column.
  const step = (dir: -1 | 1, e: React.MouseEvent) => {
    e.preventDefault();
    const target = LANES[Math.min(2, Math.max(0, idx + dir))];
    const st = useStore.getState();
    if (e.altKey) st.setSubtreeLane(id, target);
    else st.setItemLane(id, target);
  };
  const tip = (dir: string) => `Move to the ${dir} column` + (hasKids ? ' · ⌥ with sub-items' : '');
  return (
    <div className="lane-row">
      <div className="lane-cell" style={{ marginLeft: `calc(var(--lane-w) * ${idx})` }}>
        <div className="lane-move">
          <button
            className={'col-move-btn' + (idx === 0 ? ' edge' : '')}
            title={tip('left')}
            onMouseDown={(e) => step(-1, e)}
          >
            ◀
          </button>
          <button
            className={'col-move-btn' + (idx === 2 ? ' edge' : '')}
            title={tip('right')}
            onMouseDown={(e) => step(1, e)}
          >
            ▶
          </button>
        </div>
        <div className="lane-indent" style={depth ? { paddingLeft: depth * 20 } : undefined}>
          <OutlineNode id={id} depth={0} visibleSet={null} numberOverride={number} flat />
        </div>
      </div>
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
  const hasKids = useStore((s) => (s.items[id]?.children.length ?? 0) > 0);
  // Plain click moves just this block; Alt/⌥ moves it with its whole subtree.
  // Buttons stay enabled even on the block's current side so Alt can re-align
  // any stragglers under it; a plain same-side click is a harmless no-op.
  const move = (to: LrSide, e: React.MouseEvent) => {
    e.preventDefault();
    const st = useStore.getState();
    if (e.altKey) st.setSubtreeLr(id, to);
    else if (side !== to) st.setItemLr(id, to);
  };
  const tip = (dir: string) => `Move ${dir} of the line` + (hasKids ? ' · ⌥ with sub-items' : '');
  return (
    <div className={'lr-row ' + side}>
      <div className="lr-cell">
        <div className="lr-move">
          <button
            className={'col-move-btn' + (side === 'left' ? ' on' : '')}
            title={tip('left')}
            onMouseDown={(e) => move('left', e)}
          >
            ◀
          </button>
          <button
            className={'col-move-btn' + (side === 'right' ? ' on' : '')}
            title={tip('right')}
            onMouseDown={(e) => move('right', e)}
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

function SyncChip() {
  const connected = useStore((s) => s.fileConnected);
  const status = useStore((s) => s.syncStatus);
  if (!connected && status !== 'conflict') return null;
  const map: Record<string, { text: string; cls: string } | null> = {
    off: null,
    synced: { text: '☁ Synced', cls: 'ok' },
    saving: { text: '☁ Saving…', cls: 'busy' },
    loading: { text: '☁ Syncing…', cls: 'busy' },
    conflict: { text: '⚠ Conflict', cls: 'warn' },
    error: { text: '⚠ Save error', cls: 'warn' },
  };
  const s = map[status];
  if (!s) return null;
  return (
    <span className={'sync-chip ' + s.cls} title="Connected data file — syncs across devices via your synced folder">
      {s.text}
    </span>
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
