// ---------------------------------------------------------------------------
// A single bullet, rendered recursively. Shows rendered markdown when idle and
// a raw contentEditable when focused. Owns all structural / navigation keys.
// ---------------------------------------------------------------------------
import React, { useLayoutEffect, useRef, useState } from 'react';
import { useStore, currentRootItemId } from '../store/store';
import { useDragStore, type DropPosition } from '../store/dragStore';
import { useUi } from './ui-context';
import { Editable, type EditableHandle } from './Editable';
import { renderInline } from '../lib/markdown';
import {
  setCaret,
  getCaretOffset,
  isCaretAtStart,
  isCaretAtEnd,
  offsetFromPoint,
} from '../lib/caret';
import { prevVisible, nextVisible, isAncestor } from '../lib/tree';

interface Props {
  id: string;
  depth: number;
  /** When filtering: only ids in this set render. null = normal outline. */
  visibleSet: Set<string> | null;
}

function isMod(e: React.KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

export default function OutlineNode({ id, depth, visibleSet }: Props) {
  const item = useStore((s) => s.items[id]);
  const prefs = useStore((s) => s.preferences);
  const myFocus = useStore((s) => (s.focus && s.focus.id === id ? s.focus : null));
  const dropPos = useDragStore((s) => (s.overId === id ? s.position : null));
  const ui = useUi();

  const [editing, setEditing] = useState(false);
  const [noteEditing, setNoteEditing] = useState(false);
  const editRef = useRef<EditableHandle>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<'start' | 'end' | number | null>(null);

  const applyCaret = () => {
    const el = editRef.current?.el;
    if (el && pendingCaret.current != null) {
      setCaret(el, pendingCaret.current);
      pendingCaret.current = null;
    }
  };

  // React to focus requests coming from the store. Runs synchronously before
  // paint so a keystroke fired right after (e.g. Enter then typing) lands in
  // the newly focused editor, not the previous one.
  useLayoutEffect(() => {
    if (!myFocus) return;
    if (myFocus.note) {
      setNoteEditing(true);
      requestAnimationFrame(() => {
        const el = noteRef.current;
        if (el) {
          el.focus();
          const pos = myFocus.pos === 'start' ? 0 : el.value.length;
          el.setSelectionRange(pos, pos);
        }
      });
    } else {
      pendingCaret.current = myFocus.pos;
      if (editing) applyCaret();
      else setEditing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myFocus]);

  useLayoutEffect(() => {
    if (editing) applyCaret();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (!item) return null;

  const hasChildren = item.children.length > 0;
  const store = useStore.getState();

  // Which children to render.
  let childIds: string[];
  if (visibleSet) childIds = item.children.filter((c) => visibleSet.has(c));
  else childIds = item.collapsed ? [] : item.children;
  const showChildren = childIds.length > 0;

  // ------------------------------------------------------------- text keys
  const onTextKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = editRef.current?.el;
    if (!el) return;
    const s = useStore.getState();
    const rootId = currentRootItemId(s);
    const sel = window.getSelection();
    const collapsedSel = !sel || sel.isCollapsed;

    // Formatting
    if (isMod(e) && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      return applyWrap('**', '**');
    }
    if (isMod(e) && !e.shiftKey && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      return applyWrap('*', '*');
    }
    if (isMod(e) && e.shiftKey && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      return applyWrap('~~', '~~');
    }
    if (isMod(e) && e.shiftKey && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      return applyWrap('==', '==');
    }
    if (isMod(e) && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      return applyWrap('`', '`');
    }

    // Complete / checkbox
    if (isMod(e) && e.key === 'Enter') {
      e.preventDefault();
      return store.toggleComplete(id);
    }
    if (isMod(e) && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      return store.toggleCheckbox(id);
    }
    // Headings
    if (isMod(e) && e.shiftKey && ['1', '2', '3', '0'].includes(e.key)) {
      e.preventDefault();
      return store.setHeading(id, Number(e.key));
    }
    // Duplicate
    if (isMod(e) && !e.shiftKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      return store.duplicateItem(id);
    }
    // Zoom in
    if (isMod(e) && e.key === '.') {
      e.preventDefault();
      return store.zoomIn(id);
    }
    // Subtree clipboard (only when no text is selected)
    if (isMod(e) && collapsedSel && (e.key === 'c' || e.key === 'C') && !e.shiftKey) {
      e.preventDefault();
      return store.copyItem(id);
    }
    if (isMod(e) && collapsedSel && (e.key === 'x' || e.key === 'X') && !e.shiftKey) {
      e.preventDefault();
      return store.cutItem(id);
    }
    if (isMod(e) && (e.key === 'v' || e.key === 'V') && s.clipboard) {
      e.preventDefault();
      return store.pasteInto(id);
    }

    // Move up / down
    if (isMod(e) && e.shiftKey && e.key === 'ArrowUp') {
      e.preventDefault();
      return store.moveUp(id);
    }
    if (isMod(e) && e.shiftKey && e.key === 'ArrowDown') {
      e.preventDefault();
      return store.moveDown(id);
    }
    // Collapse / expand
    if (isMod(e) && e.key === 'ArrowUp') {
      e.preventDefault();
      if (hasChildren && !item.collapsed) store.toggleCollapse(id);
      return;
    }
    if (isMod(e) && e.key === 'ArrowDown') {
      e.preventDefault();
      if (hasChildren && item.collapsed) store.toggleCollapse(id);
      return;
    }

    switch (e.key) {
      case 'Enter': {
        if (e.shiftKey) {
          e.preventDefault();
          store.requestFocus(id, 'start', true); // add / edit note
          return;
        }
        e.preventDefault();
        const offset = getCaretOffset(el);
        const text = el.textContent ?? '';
        store.insertItemAfter(id, text.slice(0, offset), text.slice(offset));
        return;
      }
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) store.outdent(id);
        else store.indent(id);
        return;
      case 'Backspace':
        if (collapsedSel && isCaretAtStart(el)) {
          e.preventDefault();
          store.backspaceMerge(id);
        }
        return;
      case 'Delete':
        if (collapsedSel && isCaretAtEnd(el) && rootId) {
          const next = nextVisible(s.items, rootId, id);
          if (next) {
            e.preventDefault();
            store.backspaceMerge(next);
          }
        }
        return;
      case 'ArrowUp': {
        if (!rootId) return;
        const offset = getCaretOffset(el);
        const prev = prevVisible(s.items, rootId, id);
        if (prev) {
          e.preventDefault();
          store.requestFocus(prev, offset);
        }
        return;
      }
      case 'ArrowDown': {
        if (!rootId) return;
        const offset = getCaretOffset(el);
        const next = nextVisible(s.items, rootId, id);
        if (next) {
          e.preventDefault();
          store.requestFocus(next, offset);
        }
        return;
      }
      case 'ArrowLeft':
        if (collapsedSel && isCaretAtStart(el) && rootId) {
          const prev = prevVisible(s.items, rootId, id);
          if (prev) {
            e.preventDefault();
            store.requestFocus(prev, 'end');
          }
        }
        return;
      case 'ArrowRight':
        if (collapsedSel && isCaretAtEnd(el) && rootId) {
          const next = nextVisible(s.items, rootId, id);
          if (next) {
            e.preventDefault();
            store.requestFocus(next, 'start');
          }
        }
        return;
      default:
        return;
    }
  };

  const applyWrap = (before: string, after: string) => {
    const el = editRef.current?.el;
    if (!el) return;
    const sel = window.getSelection();
    const full = el.textContent ?? '';
    let start = full.length;
    let end = full.length;
    if (sel && sel.rangeCount && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      const pre = range.cloneRange();
      pre.selectNodeContents(el);
      pre.setEnd(range.startContainer, range.startOffset);
      start = pre.toString().length;
      end = start + range.toString().length;
    }
    const selected = full.slice(start, end);
    const next = full.slice(0, start) + before + selected + after + full.slice(end);
    el.textContent = next;
    useStore.getState().setText(id, next);
    const caret = selected
      ? start + before.length + selected.length + after.length
      : start + before.length;
    setCaret(el, caret);
  };

  // ------------------------------------------------------------- note keys
  const onNoteKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = noteRef.current;
    if (!el) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setNoteEditing(false);
      useStore.getState().requestFocus(id, 'end');
      return;
    }
    if (e.key === 'Backspace' && el.value === '') {
      e.preventDefault();
      useStore.getState().setNote(id, '');
      setNoteEditing(false);
      useStore.getState().requestFocus(id, 'end');
    }
  };

  // ---------------------------------------------------------- interactions
  const enterEditAt = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const container = e.currentTarget as HTMLElement;
    const offset = offsetFromPoint(container, e.clientX, e.clientY);
    pendingCaret.current = offset ?? 'end';
    e.preventDefault();
    if (editing) applyCaret();
    else setEditing(true);
  };

  // ------------------------------------------------------------------ DnD
  const onDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    useDragStore.getState().start(id);
  };
  const onDragOver = (e: React.DragEvent) => {
    const { dragId } = useDragStore.getState();
    if (!dragId || dragId === id) return;
    if (isAncestor(useStore.getState().items, dragId, id)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    let pos: DropPosition;
    if (y < rect.height * 0.25) pos = 'before';
    else if (y > rect.height * 0.75) pos = 'after';
    else pos = 'child';
    useDragStore.getState().over(id, pos);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { dragId, position } = useDragStore.getState();
    if (dragId && position) useStore.getState().moveItem(dragId, id, position);
    useDragStore.getState().end();
  };

  // --------------------------------------------------------------- render
  const textClasses = [
    'node-text',
    item.heading ? `h${item.heading}` : '',
    item.completed ? 'completed' : '',
    item.color ? `label-${item.color}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const rendered = renderInline(item.text, {
    onTag: ui.onTag,
    onInternalLink: ui.onInternalLink,
    onDate: (raw, index) => ui.openDatePicker(id, raw, index),
  });

  if (prefs.showCompleted === false && item.completed && !visibleSet) return null;

  return (
    <div className="node" data-id={id}>
      <div
        className={'node-row' + (dropPos ? ` drop-${dropPos}` : '')}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onContextMenu={(e) => {
          e.preventDefault();
          ui.openContextMenu(id, e.clientX, e.clientY);
        }}
      >
        <span className="node-gutter">
          <button
            className={'fold' + (hasChildren ? '' : ' invisible')}
            onClick={() => store.toggleCollapse(id)}
            tabIndex={-1}
            aria-label={item.collapsed ? 'Expand' : 'Collapse'}
          >
            {item.collapsed ? '▸' : '▾'}
          </button>
          <span
            className={'bullet' + (item.collapsed && hasChildren ? ' has-collapsed' : '')}
            draggable
            onDragStart={onDragStart}
            onDragEnd={() => useDragStore.getState().end()}
            onClick={() => store.zoomIn(id)}
            title="Click to zoom in · drag to move"
          >
            <span className="bullet-dot" />
          </span>
          {item.checkbox && (
            <input
              type="checkbox"
              className="node-check"
              checked={item.completed}
              onChange={() => store.toggleComplete(id)}
              tabIndex={-1}
            />
          )}
        </span>

        <div className="node-content">
          {editing ? (
            <Editable
              ref={editRef}
              value={item.text}
              className={textClasses + ' editing'}
              placeholder="Type here…"
              spellCheck={prefs.spellcheck}
              onInput={(t) => useStore.getState().setText(id, t)}
              onKeyDown={onTextKeyDown}
              onBlur={() => setEditing(false)}
            />
          ) : (
            <div
              className={textClasses + (item.text ? '' : ' empty')}
              onMouseDown={enterEditAt}
            >
              {item.text ? rendered : <span className="placeholder">Type here…</span>}
            </div>
          )}

          {(item.note || noteEditing) &&
            (noteEditing ? (
              <textarea
                ref={noteRef}
                className="node-note editing"
                defaultValue={item.note}
                placeholder="Note…"
                rows={1}
                spellCheck={prefs.spellcheck}
                onChange={(e) => {
                  useStore.getState().setNote(id, e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                onKeyDown={onNoteKeyDown}
                onBlur={() => setNoteEditing(false)}
              />
            ) : (
              <div className="node-note" onMouseDown={() => setNoteEditing(true)}>
                {item.note.split('\n').map((line, i) => (
                  <div key={i}>{renderInline(line, { onTag: ui.onTag, onInternalLink: ui.onInternalLink })}</div>
                ))}
              </div>
            ))}
        </div>
      </div>

      {showChildren && (
        <div className="children">
          {childIds.map((cid) => (
            <OutlineNode key={cid} id={cid} depth={depth + 1} visibleSet={visibleSet} />
          ))}
        </div>
      )}
    </div>
  );
}
