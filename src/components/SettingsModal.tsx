// Preferences + per-document settings + custom CSS (a Dynalist-Pro touch).
import Modal from './Modal';
import { useStore } from '../store/store';

const ACCENTS = ['#4ec9b0', '#569cd6', '#c586c0', '#dcdcaa', '#ce9178', '#6a9955', '#f44747'];

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const prefs = useStore((s) => s.preferences);
  const doc = useStore((s) => (s.currentDocId ? s.docs[s.currentDocId] : null));
  const set = useStore.getState().setPreferences;

  return (
    <Modal onClose={onClose} className="settings-modal">
      <div className="modal-head">
        <h2>⚙ Settings</h2>
        <button className="icon-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="settings-body">
        <section>
          <h3>Appearance</h3>
          <label className="field row">
            <span>Font size</span>
            <input
              type="range"
              min={12}
              max={22}
              value={prefs.fontSize}
              onChange={(e) => set({ fontSize: Number(e.target.value) })}
            />
            <span className="val">{prefs.fontSize}px</span>
          </label>
          <label className="field">
            <span>Accent</span>
            <div className="accent-row">
              {ACCENTS.map((a) => (
                <button
                  key={a}
                  className={'accent-dot' + (prefs.accent === a ? ' on' : '')}
                  style={{ background: a }}
                  onClick={() => set({ accent: a })}
                />
              ))}
            </div>
          </label>
          <label className="field row">
            <input
              type="checkbox"
              checked={prefs.showCompleted}
              onChange={(e) => set({ showCompleted: e.target.checked })}
            />
            <span>Show completed items</span>
          </label>
          <label className="field row">
            <input
              type="checkbox"
              checked={prefs.spellcheck}
              onChange={(e) => set({ spellcheck: e.target.checked })}
            />
            <span>Spellcheck while editing</span>
          </label>
        </section>

        {doc && (
          <section>
            <h3>This document · {doc.title}</h3>
            <label className="field row">
              <input
                type="checkbox"
                checked={doc.settings.checkboxMode}
                onChange={(e) =>
                  useStore.getState().setDocSettings(doc.id, { checkboxMode: e.target.checked })
                }
              />
              <span>Checkbox mode (new bullets are checkboxes)</span>
            </label>
            <label className="field row">
              <input
                type="checkbox"
                checked={doc.settings.numbered}
                onChange={(e) =>
                  useStore.getState().setDocSettings(doc.id, { numbered: e.target.checked })
                }
              />
              <span>Numbered list</span>
            </label>
          </section>
        )}

        <section>
          <h3>Custom CSS</h3>
          <p className="muted">Injected globally. Style anything — this is your app.</p>
          <textarea
            className="css-editor"
            spellCheck={false}
            value={prefs.customCss}
            placeholder={'.node-text { letter-spacing: 0.2px; }'}
            onChange={(e) => set({ customCss: e.target.value })}
          />
        </section>

        <section>
          <h3>Data</h3>
          <p className="muted">
            Everything is stored locally in your browser (IndexedDB). Nothing is sent anywhere.
          </p>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm('Erase ALL documents and start fresh? This cannot be undone.')) {
                indexedDB.deleteDatabase('outliner');
                localStorage.removeItem('outliner:backup');
                location.reload();
              }
            }}
          >
            Erase all data
          </button>
        </section>
      </div>
    </Modal>
  );
}
