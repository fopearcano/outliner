// Right-click menu for a bullet.
import { useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import { useUi } from './ui-context';
import { COLOR_LABELS } from '../types';

interface Props {
  itemId: string;
  x: number;
  y: number;
  onClose: () => void;
}

export default function ContextMenu({ itemId, x, y, onClose }: Props) {
  const ui = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const item = useStore((s) => s.items[itemId]);
  const hasClipboard = useStore((s) => !!s.clipboard);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  if (!item) return null;
  const s = useStore.getState();
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };

  // Keep the menu inside the viewport.
  const left = Math.min(x, window.innerWidth - 240);
  const top = Math.min(y, window.innerHeight - 380);

  return (
    <div ref={ref} className="ctx-menu" style={{ left, top }}>
      <button className="ctx-item" onClick={act(() => s.zoomIn(itemId))}>
        <span>Zoom in</span>
        <span className="ctx-key">Ctrl/⌘ .</span>
      </button>
      <button className="ctx-item" onClick={act(() => s.toggleComplete(itemId))}>
        {item.completed ? 'Mark incomplete' : 'Complete'}
      </button>
      <button className="ctx-item" onClick={act(() => s.toggleCheckbox(itemId))}>
        {item.checkbox ? 'Remove checkbox' : 'Make checkbox'}
      </button>
      <button className="ctx-item" onClick={act(() => s.requestFocus(itemId, 'start', true))}>
        Add note
      </button>
      <div className="ctx-sep" />

      <div className="ctx-label">Heading</div>
      <div className="ctx-row">
        {[0, 1, 2, 3].map((h) => (
          <button
            key={h}
            className={'ctx-chip' + (item.heading === h ? ' on' : '')}
            onClick={act(() => s.setHeading(itemId, h))}
          >
            {h === 0 ? 'None' : 'H' + h}
          </button>
        ))}
      </div>

      <div className="ctx-label">Color label</div>
      <div className="ctx-row colors">
        <button
          className={'color-dot none' + (!item.color ? ' on' : '')}
          title="No color"
          onClick={act(() => s.setColor(itemId, null))}
        />
        {COLOR_LABELS.map((c) => (
          <button
            key={c}
            className={'color-dot ' + c + (item.color === c ? ' on' : '')}
            title={c}
            onClick={act(() => s.setColor(itemId, c))}
          />
        ))}
      </div>
      <div className="ctx-sep" />

      <button className="ctx-item" onClick={act(() => ui.openDatePicker(itemId, null, null))}>
        Set date…
      </button>
      <button className="ctx-item" onClick={act(() => ui.attachTo(itemId))}>
        Attach image / file…
      </button>
      <button className="ctx-item" onClick={act(() => ui.openMoveDialog(itemId))}>
        Move to document…
      </button>
      <button className="ctx-item" onClick={act(() => s.duplicateItem(itemId))}>
        Duplicate
        <span className="ctx-key">Ctrl/⌘ D</span>
      </button>
      <div className="ctx-sep" />

      <button className="ctx-item" onClick={act(() => s.copyItem(itemId))}>
        Copy bullet
      </button>
      <button className="ctx-item" onClick={act(() => s.cutItem(itemId))}>
        Cut bullet
      </button>
      {hasClipboard && (
        <button className="ctx-item" onClick={act(() => s.pasteInto(itemId))}>
          Paste after
        </button>
      )}
      <div className="ctx-sep" />
      <button className="ctx-item danger" onClick={act(() => s.deleteItem(itemId))}>
        Delete bullet
      </button>
    </div>
  );
}
