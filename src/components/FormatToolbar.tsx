// ---------------------------------------------------------------------------
// Floating formatting toolbar. Appears above a text selection inside a bullet
// and applies inline markdown to exactly the selected word(s) — per-word
// formatting, on demand.
// ---------------------------------------------------------------------------
import React, { useEffect, useState } from 'react';
import { useStore } from '../store/store';

interface Pos {
  top: number;
  left: number;
}

const BUTTONS: { label: string; title: string; before: string; after: string; cls?: string }[] = [
  { label: 'B', title: 'Bold', before: '**', after: '**', cls: 'fmt-b' },
  { label: 'I', title: 'Italic', before: '*', after: '*', cls: 'fmt-i' },
  { label: 'S', title: 'Strikethrough', before: '~~', after: '~~', cls: 'fmt-s' },
  { label: '</>', title: 'Code', before: '`', after: '`', cls: 'fmt-code' },
  { label: 'H', title: 'Highlight', before: '==', after: '==', cls: 'fmt-h' },
];

/** Offset of the current selection's start within `el`'s text. */
function offsetIn(el: HTMLElement, container: Node, offset: number): number {
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(container, offset);
  return pre.toString().length;
}

export default function FormatToolbar() {
  const [pos, setPos] = useState<Pos | null>(null);

  useEffect(() => {
    const update = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setPos(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const anchor =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? range.startContainer.parentElement
          : (range.startContainer as HTMLElement);
      const editable = anchor?.closest<HTMLElement>('[contenteditable="true"]');
      if (!editable || !editable.classList.contains('node-text')) {
        setPos(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setPos(null);
        return;
      }
      setPos({ top: rect.top - 8, left: rect.left + rect.width / 2 });
    };
    document.addEventListener('selectionchange', update);
    window.addEventListener('scroll', () => setPos(null), true);
    return () => {
      document.removeEventListener('selectionchange', update);
    };
  }, []);

  const apply = (before: string, after: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const anchor =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : (range.startContainer as HTMLElement);
    const editable = anchor?.closest<HTMLElement>('[contenteditable="true"]');
    const node = editable?.closest<HTMLElement>('.node');
    const id = node?.dataset.id;
    if (!editable || !id) return;

    const start = offsetIn(editable, range.startContainer, range.startOffset);
    const end = offsetIn(editable, range.endContainer, range.endOffset);
    const full = editable.textContent ?? '';
    const selected = full.slice(start, end);
    const next = full.slice(0, start) + before + selected + after + full.slice(end);
    editable.textContent = next;
    useStore.getState().setText(id, next);

    // Re-select the wrapped word so another format can be stacked.
    const tn = editable.firstChild;
    if (tn && tn.nodeType === Node.TEXT_NODE) {
      const r = document.createRange();
      r.setStart(tn, start + before.length);
      r.setEnd(tn, start + before.length + selected.length);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };

  if (!pos) return null;
  return (
    <div
      className="fmt-toolbar"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {BUTTONS.map((b) => (
        <button
          key={b.label}
          className={'fmt-btn ' + (b.cls ?? '')}
          title={b.title}
          onMouseDown={apply(b.before, b.after)}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
