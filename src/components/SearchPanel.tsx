// Global search across every document (Ctrl/Cmd+K).
import { useMemo, useState } from 'react';
import Modal from './Modal';
import { useStore } from '../store/store';
import { parseQuery, matchItem } from '../lib/search';
import { plainText, renderInline } from '../lib/markdown';
import { docForItem } from '../store/selectors';

export default function SearchPanel({ onClose, seed = '' }: { onClose: () => void; seed?: string }) {
  const items = useStore((s) => s.items);
  const docs = useStore((s) => s.docs);
  const [q, setQ] = useState(seed);
  const [sel, setSel] = useState(0);

  const results = useMemo(() => {
    const query = parseQuery(q);
    if (query.isEmpty) return [];
    const out: { id: string; docTitle: string }[] = [];
    for (const item of Object.values(items)) {
      if (item.parent === null) continue; // skip document root items
      if (matchItem(item, query)) {
        const doc = docForItem(items, docs, item.id);
        out.push({ id: item.id, docTitle: doc?.title ?? '' });
        if (out.length >= 200) break;
      }
    }
    return out;
  }, [q, items, docs]);

  const open = (id: string | undefined) => {
    if (!id) return;
    onClose();
    useStore.getState().revealItem(id);
  };

  return (
    <Modal onClose={onClose} className="search-panel" align="top">
      <input
        className="palette-input"
        autoFocus
        placeholder="Search all documents — text, #tag, @mention, is:incomplete…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSel((v) => Math.min(v + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSel((v) => Math.max(v - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            open(results[sel]?.id);
          }
        }}
      />
      <div className="palette-list">
        {results.map((r, i) => {
          const item = items[r.id];
          return (
            <button
              key={r.id}
              className={'search-item' + (i === sel ? ' sel' : '')}
              onMouseEnter={() => setSel(i)}
              onClick={() => open(r.id)}
            >
              <span className="search-doc">{r.docTitle}</span>
              <span className="search-text">
                {item.text ? renderInline(item.text) : <em>empty bullet</em>}
              </span>
              {item.note && <span className="search-note">{plainText(item.note).slice(0, 80)}</span>}
            </button>
          );
        })}
        {q.trim() && results.length === 0 && <div className="palette-empty">No matches</div>}
        {!q.trim() && <div className="palette-empty">Start typing to search across all documents.</div>}
      </div>
    </Modal>
  );
}
