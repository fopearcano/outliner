import Modal from './Modal';
import { SHORTCUTS } from '../lib/keymap';

export default function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} className="help-modal">
      <div className="modal-head">
        <h2>⌨ Keyboard shortcuts</h2>
        <button className="icon-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="help-grid">
        {SHORTCUTS.map((group) => (
          <div key={group.title} className="help-group">
            <h3>{group.title}</h3>
            {group.items.map((sc) => (
              <div key={sc.keys} className="help-row">
                <kbd>{sc.keys}</kbd>
                <span>{sc.desc}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="help-foot">
        Also try inline markdown: <code>**bold**</code> <code>*italic*</code> <code>~~strike~~</code>{' '}
        <code>`code`</code> <code>==highlight==</code> <code>#tag</code> <code>@mention</code>{' '}
        <code>[[link]]</code> <code>!(2026-07-10)</code>
      </div>
    </Modal>
  );
}
