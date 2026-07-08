// Move a bullet (and its subtree) to another document.
import { useMemo, useState } from 'react';
import Modal from './Modal';
import { useStore } from '../store/store';

export default function MoveDialog({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const docs = useStore((s) => s.docs);
  const [q, setQ] = useState('');

  const documents = useMemo(
    () =>
      Object.values(docs)
        .filter((d) => d.kind === 'document')
        .filter((d) => d.title.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [docs, q],
  );

  const move = (docId: string) => {
    useStore.getState().moveItemToDoc(itemId, docId);
    onClose();
  };

  return (
    <Modal onClose={onClose} className="palette" align="top">
      <input
        className="palette-input"
        autoFocus
        placeholder="Move bullet to which document?"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="palette-list">
        {documents.map((d) => (
          <button key={d.id} className="palette-item" onClick={() => move(d.id)}>
            <span>▤ {d.title || 'Untitled'}</span>
          </button>
        ))}
        {documents.length === 0 && <div className="palette-empty">No documents</div>}
      </div>
    </Modal>
  );
}
