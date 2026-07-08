// Import (OPML / Markdown / plain text / JSON) and export the current document.
import { useRef, useState } from 'react';
import Modal from './Modal';
import { useStore, currentRootItemId } from '../store/store';
import {
  importByFilename,
  importMarkdown,
  importOpml,
  importPlainText,
  importJson,
  type ImportNode,
} from '../lib/importers';
import {
  exportMarkdown,
  exportOpml,
  exportPlainText,
  exportJson,
  download,
} from '../lib/exporters';

type Fmt = 'auto' | 'markdown' | 'opml' | 'text' | 'json';

export default function ImportExport({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState('');
  const [fmt, setFmt] = useState<Fmt>('auto');
  const [msg, setMsg] = useState('');

  const doImport = (title: string, nodes: ImportNode[]) => {
    if (!nodes.length) {
      setMsg('Nothing to import.');
      return;
    }
    useStore.getState().importAsDocument(title, nodes);
    onClose();
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    try {
      const nodes = importByFilename(file.name, text);
      doImport(file.name.replace(/\.[^.]+$/, ''), nodes);
    } catch (e) {
      setMsg('Import failed: ' + (e as Error).message);
    }
  };

  const parsePaste = (): ImportNode[] => {
    if (fmt === 'markdown') return importMarkdown(paste);
    if (fmt === 'opml') return importOpml(paste);
    if (fmt === 'text') return importPlainText(paste);
    if (fmt === 'json') return importJson(paste);
    // auto-detect
    const t = paste.trimStart();
    if (t.startsWith('<')) return importOpml(paste);
    if (t.startsWith('{') || t.startsWith('[')) return importJson(paste);
    if (/^[-*+]\s|^#{1,6}\s/m.test(paste)) return importMarkdown(paste);
    return importPlainText(paste);
  };

  const exportCurrent = (kind: Fmt) => {
    const s = useStore.getState();
    const doc = s.currentDocId ? s.docs[s.currentDocId] : null;
    const rootId = currentRootItemId(s);
    if (!doc || !rootId) return;
    const title = doc.title || 'outline';
    if (kind === 'markdown') download(`${title}.md`, exportMarkdown(s.items, rootId), 'text/markdown');
    else if (kind === 'opml') download(`${title}.opml`, exportOpml(s.items, rootId, title), 'text/xml');
    else if (kind === 'text') download(`${title}.txt`, exportPlainText(s.items, rootId), 'text/plain');
    else if (kind === 'json') download(`${title}.json`, exportJson(s.items, rootId, title), 'application/json');
  };

  const exportBackup = () => {
    const s = useStore.getState();
    const backup = {
      version: 1,
      items: s.items,
      docs: s.docs,
      rootDocIds: s.rootDocIds,
      preferences: s.preferences,
    };
    download('outliner-backup.json', JSON.stringify(backup, null, 2), 'application/json');
  };

  return (
    <Modal onClose={onClose} className="io-modal">
      <div className="modal-head">
        <h2>⇅ Import / Export</h2>
        <button className="icon-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="io-body">
        <section>
          <h3>Import</h3>
          <p className="muted">OPML, Markdown, plain text, or JSON — imported as a new document.</p>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Choose file…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".opml,.xml,.md,.markdown,.txt,.json,text/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          <div className="io-paste">
            <div className="io-paste-head">
              <span>…or paste content</span>
              <select value={fmt} onChange={(e) => setFmt(e.target.value as Fmt)}>
                <option value="auto">Auto-detect</option>
                <option value="markdown">Markdown</option>
                <option value="opml">OPML</option>
                <option value="text">Plain text</option>
                <option value="json">JSON</option>
              </select>
            </div>
            <textarea
              className="io-textarea"
              value={paste}
              placeholder={'- Project\n  - Task one\n  - [ ] Task two'}
              onChange={(e) => setPaste(e.target.value)}
            />
            <button
              className="btn primary"
              disabled={!paste.trim()}
              onClick={() => {
                try {
                  doImport('Imported', parsePaste());
                } catch (err) {
                  setMsg('Parse failed: ' + (err as Error).message);
                }
              }}
            >
              Import as new document
            </button>
          </div>
          {msg && <div className="io-msg">{msg}</div>}
        </section>

        <section>
          <h3>Export current document</h3>
          <div className="io-buttons">
            <button className="btn" onClick={() => exportCurrent('markdown')}>
              Markdown
            </button>
            <button className="btn" onClick={() => exportCurrent('opml')}>
              OPML
            </button>
            <button className="btn" onClick={() => exportCurrent('text')}>
              Plain text
            </button>
            <button className="btn" onClick={() => exportCurrent('json')}>
              JSON
            </button>
          </div>
          <h3 style={{ marginTop: 18 }}>Full backup</h3>
          <p className="muted">Every document + settings as a single JSON file.</p>
          <button className="btn" onClick={exportBackup}>
            Download backup
          </button>
        </section>
      </div>
    </Modal>
  );
}
