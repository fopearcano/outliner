// A collapsible right-hand "navigation" panel: a compact, clickable map of the
// current document's whole tree. Clicking a row reveals (scrolls to + flashes)
// that bullet in the outline. Toggle from View → Navigation panel.
import { useStore } from '../store/store';
import { plainText } from '../lib/markdown';

export default function NavPanel() {
  const currentDocId = useStore((s) => s.currentDocId);
  const docs = useStore((s) => s.docs);
  const items = useStore((s) => s.items);
  const zoomItemId = useStore((s) => s.zoomItemId);

  const doc = currentDocId ? docs[currentDocId] : null;
  const rootId = doc?.rootItemId;

  const rows: { id: string; depth: number }[] = [];
  if (rootId) {
    const walk = (pid: string, depth: number) => {
      for (const cid of items[pid]?.children ?? []) {
        if (!items[cid]) continue;
        rows.push({ id: cid, depth });
        walk(cid, depth + 1);
      }
    };
    walk(rootId, 0);
  }

  return (
    <aside className="nav-panel">
      <div className="nav-head">
        <span>Navigate{doc ? ` · ${doc.title || 'Untitled'}` : ''}</span>
        <button
          className="nav-close"
          title="Hide navigation panel"
          onClick={() => useStore.getState().setPreferences({ navVisible: false })}
        >
          ✕
        </button>
      </div>
      <div className="nav-list">
        {rows.length === 0 && <div className="nav-empty">No bullets yet.</div>}
        {rows.map(({ id, depth }) => {
          const it = items[id];
          const label = plainText(it.text) || 'Untitled';
          const cls =
            'nav-item' +
            (it.heading ? ` h${it.heading}` : '') +
            (id === zoomItemId ? ' current' : '') +
            (it.completed ? ' done' : '');
          return (
            <button
              key={id}
              className={cls}
              style={{ paddingLeft: 10 + depth * 12 }}
              title={label}
              onClick={() => useStore.getState().revealItem(id)}
            >
              <span className="nav-dot" />
              <span className="nav-label">{label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
