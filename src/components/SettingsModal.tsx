// Preferences + per-document settings + custom CSS (a Dynalist-Pro touch).
import Modal from './Modal';
import { useStore } from '../store/store';
import { fsSupported } from '../lib/fileStore';

const ACCENTS = ['#4ec9b0', '#569cd6', '#c586c0', '#dcdcaa', '#ce9178', '#6a9955', '#f44747'];

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const prefs = useStore((s) => s.preferences);
  const doc = useStore((s) => (s.currentDocId ? s.docs[s.currentDocId] : null));
  const fileConnected = useStore((s) => s.fileConnected);
  const fileName = useStore((s) => s.fileName);
  const fileNeedsReconnect = useStore((s) => s.fileNeedsReconnect);
  const syncStatus = useStore((s) => s.syncStatus);
  const set = useStore.getState().setPreferences;

  const syncLabel: Record<string, string> = {
    synced: '☁ up to date',
    saving: '☁ saving…',
    loading: '☁ checking…',
    conflict: '⚠ conflict — resolve it in the banner at the top',
    error: '⚠ save error',
    off: '',
  };

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
          <h3>Data file (survives a browser wipe)</h3>
          {fsSupported() ? (
            <>
              {fileConnected ? (
                <>
                  <p className="muted">
                    Auto-saving to <strong>{fileName}</strong>. Your notes live in this file on
                    disk — clearing browser data won't touch them.
                  </p>
                  <div className="io-buttons">
                    <button className="btn" onClick={() => void useStore.getState().disconnectFile()}>
                      Disconnect
                    </button>
                  </div>
                </>
              ) : fileNeedsReconnect ? (
                <>
                  <p className="muted">
                    A data file (<strong>{fileName}</strong>) is remembered but disconnected.
                  </p>
                  <div className="io-buttons">
                    <button className="btn primary" onClick={() => void useStore.getState().reconnectFile()}>
                      Reconnect {fileName}
                    </button>
                    <button className="btn" onClick={() => useStore.getState().disconnectFile()}>
                      Forget
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted">
                    Connect a file on disk and the app auto-saves to it — the durable, portable
                    home for your notes.
                  </p>
                  <div className="io-buttons">
                    <button className="btn primary" onClick={() => void useStore.getState().connectFile()}>
                      Save to a file…
                    </button>
                    <button className="btn" onClick={() => void useStore.getState().openFile()}>
                      Open existing file…
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="muted">
              Your browser doesn't support connecting a file. Use Import / Export → Download
              backup to keep a durable copy.
            </p>
          )}
        </section>

        <section>
          <h3>Sync across devices (Dropbox / iCloud / Drive)</h3>
          {fsSupported() ? (
            <>
              <p className="muted">
                Keep your notes on every computer by pointing the data file at a folder your
                cloud app already syncs — no account here, no server. The app pulls the latest
                each time you return to it, and warns you before overwriting if two devices
                edited at once. (Chrome / Edge desktop.)
              </p>
              <ol className="sync-steps">
                <li>
                  Install Dropbox / iCloud Drive / Google Drive / OneDrive and let it sync a
                  folder on each computer.
                </li>
                <li>
                  On <strong>this</strong> device, click <em>Set up sync</em> and save{' '}
                  <code>outliner.json</code> <strong>inside that synced folder</strong>.
                </li>
                <li>
                  On your <strong>other</strong> device, open this app → Settings →{' '}
                  <em>Open synced file</em> and pick the same <code>outliner.json</code>.
                </li>
              </ol>
              {fileConnected ? (
                <p className="muted">
                  ✓ Connected to <strong>{fileName}</strong>
                  {syncLabel[syncStatus] ? ` — ${syncLabel[syncStatus]}` : ''}. If that file lives
                  inside a synced folder, you're all set.
                </p>
              ) : (
                <div className="io-buttons">
                  <button className="btn primary" onClick={() => void useStore.getState().connectFile()}>
                    Set up sync…
                  </button>
                  <button className="btn" onClick={() => void useStore.getState().openFile()}>
                    Open synced file…
                  </button>
                </div>
              )}
              <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                Note: file sync moves the whole document; it isn't live co-editing. If you edit the
                same doc on two devices at the very same moment, your cloud app may keep a
                “conflicted copy” — the in-app warning makes that rare and never silently drops
                your work.
              </p>
            </>
          ) : (
            <p className="muted">
              File-based sync needs Chrome or Edge on desktop. On other browsers, use Import /
              Export → Download backup to move your notes between devices manually.
            </p>
          )}
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
                indexedDB.deleteDatabase('outliner-fs');
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
