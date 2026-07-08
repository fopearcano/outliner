// Fuzzy command palette (Ctrl/Cmd+P). Commands are computed against live state.
import { useMemo, useState } from 'react';
import Modal from './Modal';
import { useStore, currentRootItemId } from '../store/store';
import { useUi } from './ui-context';
import {
  exportMarkdown,
  exportOpml,
  exportPlainText,
  exportJson,
  download,
} from '../lib/exporters';

interface Command {
  id: string;
  title: string;
  hint?: string;
  run: () => void;
}

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const ui = useUi();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  const commands: Command[] = useMemo(() => {
    const s = useStore.getState();
    const doc = s.currentDocId ? s.docs[s.currentDocId] : null;
    const rootId = currentRootItemId(s);
    const exp = (fn: (title: string) => { name: string; content: string; mime: string }) => () => {
      if (!doc || !rootId) return;
      const { name, content, mime } = fn(doc.title || 'outline');
      download(name, content, mime);
    };
    const list: Command[] = [
      { id: 'new-doc', title: 'New document', hint: '＋', run: () => useStore.getState().createDocument(null) },
      { id: 'new-folder', title: 'New folder', run: () => useStore.getState().createFolder(null) },
      { id: 'search', title: 'Search everything…', hint: 'Ctrl/Cmd+K', run: ui.openSearch },
      { id: 'zoom-out', title: 'Zoom out to document root', run: () => useStore.getState().setZoom(null) },
      { id: 'collapse-all', title: 'Collapse all bullets', run: () => useStore.getState().setCollapsedAll(true) },
      { id: 'expand-all', title: 'Expand all bullets', run: () => useStore.getState().setCollapsedAll(false) },
      {
        id: 'toggle-completed',
        title: (s.preferences.showCompleted ? 'Hide' : 'Show') + ' completed items',
        run: () => useStore.getState().setPreferences({ showCompleted: !s.preferences.showCompleted }),
      },
    ];
    if (doc) {
      list.push(
        {
          id: 'checkbox-mode',
          title: (doc.settings.checkboxMode ? 'Disable' : 'Enable') + ' checkbox mode (document)',
          run: () => useStore.getState().setDocSettings(doc.id, { checkboxMode: !doc.settings.checkboxMode }),
        },
        {
          id: 'numbered',
          title: (doc.settings.numbered ? 'Disable' : 'Enable') + ' numbered list (document)',
          run: () => useStore.getState().setDocSettings(doc.id, { numbered: !doc.settings.numbered }),
        },
        {
          id: 'bookmark',
          title: (doc.bookmarked ? 'Remove bookmark' : 'Bookmark this document'),
          run: () => useStore.getState().toggleBookmark(doc.id),
        },
        {
          id: 'export-md',
          title: 'Export document as Markdown',
          run: exp((t) => ({ name: `${t}.md`, content: exportMarkdown(s.items, rootId!), mime: 'text/markdown' })),
        },
        {
          id: 'export-opml',
          title: 'Export document as OPML',
          run: exp((t) => ({ name: `${t}.opml`, content: exportOpml(s.items, rootId!, t), mime: 'text/xml' })),
        },
        {
          id: 'export-txt',
          title: 'Export document as plain text',
          run: exp((t) => ({ name: `${t}.txt`, content: exportPlainText(s.items, rootId!), mime: 'text/plain' })),
        },
        {
          id: 'export-json',
          title: 'Export document as JSON',
          run: exp((t) => ({ name: `${t}.json`, content: exportJson(s.items, rootId!, t), mime: 'application/json' })),
        },
      );
    }
    list.push(
      { id: 'import', title: 'Import file…', run: ui.openImportExport },
      { id: 'settings', title: 'Open settings', run: ui.openSettings },
      { id: 'help', title: 'Keyboard shortcuts', hint: 'Ctrl/Cmd+/', run: ui.openHelp },
      { id: 'undo', title: 'Undo', run: () => useStore.getState().undo() },
      { id: 'redo', title: 'Redo', run: () => useStore.getState().redo() },
    );
    return list;
  }, [ui]);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase().trim();
    if (!needle) return commands;
    return commands.filter((c) => c.title.toLowerCase().includes(needle));
  }, [q, commands]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <Modal onClose={onClose} className="palette" align="top">
      <input
        className="palette-input"
        autoFocus
        placeholder="Type a command…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSel((v) => Math.min(v + 1, filtered.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSel((v) => Math.max(v - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            run(filtered[sel]);
          }
        }}
      />
      <div className="palette-list">
        {filtered.map((c, i) => (
          <button
            key={c.id}
            className={'palette-item' + (i === sel ? ' sel' : '')}
            onMouseEnter={() => setSel(i)}
            onClick={() => run(c)}
          >
            <span>{c.title}</span>
            {c.hint && <span className="palette-hint">{c.hint}</span>}
          </button>
        ))}
        {filtered.length === 0 && <div className="palette-empty">No matching command</div>}
      </div>
    </Modal>
  );
}
