// A "View" popover in the breadcrumb bar: theme, display toggles, spacing,
// sidebar visibility, font size, and per-document settings.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { THEMES, type ThemeName } from '../types';

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button className="view-row" onClick={() => onChange(!checked)} role="switch" aria-checked={checked}>
      <span>{label}</span>
      <span className={'switch' + (checked ? ' on' : '')}>
        <span className="knob" />
      </span>
    </button>
  );
}

export default function ViewOptions() {
  const prefs = useStore((s) => s.preferences);
  const doc = useStore((s) => (s.currentDocId ? s.docs[s.currentDocId] : null));
  const set = useStore.getState().setPreferences;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const pickTheme = (t: ThemeName) => {
    const accent = THEMES.find((x) => x.id === t)?.accent ?? prefs.accent;
    set({ theme: t, accent });
  };

  return (
    <div className="view-options" ref={ref}>
      <button className="view-trigger" onClick={() => setOpen((v) => !v)} title="View options">
        ◫ View
      </button>
      {open && (
        <div className="view-pop">
          <div className="view-label">Theme</div>
          <div className="seg">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={'seg-btn' + (prefs.theme === t.id ? ' on' : '')}
                onClick={() => pickTheme(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="view-sep" />
          <Toggle label="Show completed" checked={prefs.showCompleted} onChange={(v) => set({ showCompleted: v })} />
          <Toggle label="Show notes" checked={prefs.showNotes} onChange={(v) => set({ showNotes: v })} />
          <Toggle label="Compact spacing" checked={prefs.compact} onChange={(v) => set({ compact: v })} />
          <Toggle label="Show sidebar" checked={prefs.sidebarVisible} onChange={(v) => set({ sidebarVisible: v })} />

          <div className="view-sep" />
          <Toggle label="Navigation panel" checked={prefs.navVisible} onChange={(v) => set({ navVisible: v })} />
          <button
            className="view-row"
            onClick={() => {
              set({ mindmapOpen: true });
              setOpen(false);
            }}
          >
            <span>🧠 Mindmap from outline</span>
            <span className="view-cta">open</span>
          </button>

          <div className="view-sep" />
          <div className="view-row static">
            <span>Font size</span>
            <input
              type="range"
              min={12}
              max={22}
              value={prefs.fontSize}
              onChange={(e) => set({ fontSize: Number(e.target.value) })}
            />
            <span className="view-val">{prefs.fontSize}</span>
          </div>

          {doc && (
            <>
              <div className="view-sep" />
              <div className="view-label">Layout</div>
              <div className="seg">
                {(
                  [
                    ['outline', 'Outline'],
                    ['lr', 'L ↔ R'],
                    ['lr3', '3-col L↔R'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    className={'seg-btn' + (doc.settings.viewMode === mode ? ' on' : '')}
                    onClick={() => useStore.getState().setDocSettings(doc.id, { viewMode: mode })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {doc.settings.viewMode === 'lr' && (
                <p className="muted" style={{ margin: '8px 6px 0' }}>
                  Move any block ◀ / ▶ to sit left or right of the centre line —
                  each one moves independently (even nested ones), keeping its row
                  and number. Hold <b>⌥ Alt</b> to move a block with all its
                  sub-items.
                </p>
              )}
              {doc.settings.viewMode === 'lr3' && (
                <>
                  <p className="muted" style={{ margin: '8px 6px 6px' }}>
                    Three fixed-width columns — left, main (centre) and right. Move any
                    block ◀ / ▶ between them independently, keeping its row and number.
                    Hold <b>⌥ Alt</b> to move a block with its sub-items. Text keeps its
                    width — the view scrolls sideways instead of squeezing.
                  </p>
                  <div className="view-row static">
                    <span>Column width</span>
                    <input
                      type="range"
                      min={360}
                      max={960}
                      step={20}
                      value={prefs.laneWidth}
                      onChange={(e) => set({ laneWidth: Number(e.target.value) })}
                    />
                    <span className="view-val">{prefs.laneWidth}</span>
                  </div>
                </>
              )}

              <div className="view-sep" />
              <div className="view-label">This document</div>
              <Toggle
                label="Checkbox mode"
                checked={doc.settings.checkboxMode}
                onChange={(v) => useStore.getState().setDocSettings(doc.id, { checkboxMode: v })}
              />
              <Toggle
                label="Numbered list"
                checked={doc.settings.numbered}
                onChange={(v) => useStore.getState().setDocSettings(doc.id, { numbered: v })}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
