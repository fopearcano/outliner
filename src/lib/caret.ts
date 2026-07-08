// ---------------------------------------------------------------------------
// Caret helpers for the contentEditable bullet editors. Everything works on
// plain-text offsets within an element's textContent.
// ---------------------------------------------------------------------------

/** Character offset of the caret within `el.textContent`. */
export function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.endContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

/** Place the caret at 'start' | 'end' | a numeric offset. */
export function setCaret(el: HTMLElement, pos: 'start' | 'end' | number): void {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const len = el.textContent?.length ?? 0;
  const target = pos === 'start' ? 0 : pos === 'end' ? len : Math.max(0, Math.min(pos, len));

  const range = document.createRange();
  // Walk text nodes to locate the offset.
  let remaining = target;
  let placed = false;
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const nlen = node.textContent?.length ?? 0;
      if (remaining <= nlen) {
        range.setStart(node, remaining);
        return true;
      }
      remaining -= nlen;
      return false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  };
  if (el.firstChild) placed = walk(el);
  if (!placed) {
    range.selectNodeContents(el);
    range.collapse(false);
  } else {
    range.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

export function isCaretAtStart(el: HTMLElement): boolean {
  return getCaretOffset(el) === 0;
}

export function isCaretAtEnd(el: HTMLElement): boolean {
  return getCaretOffset(el) === (el.textContent?.length ?? 0);
}

/** Is the caret sitting on the first visual line of a multi-line field? */
export function isCaretOnFirstLine(el: HTMLTextAreaElement): boolean {
  const before = el.value.slice(0, el.selectionStart);
  return !before.includes('\n');
}

export function isCaretOnLastLine(el: HTMLTextAreaElement): boolean {
  const after = el.value.slice(el.selectionEnd);
  return !after.includes('\n');
}

/**
 * Best-effort visible-text offset at a click point. Exact for plain text; for
 * formatted text it lands close enough to feel natural.
 */
export function offsetFromPoint(container: HTMLElement, x: number, y: number): number | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let pointRange: Range | null = null;
  if (doc.caretRangeFromPoint) {
    pointRange = doc.caretRangeFromPoint(x, y);
  } else if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    if (p) {
      pointRange = document.createRange();
      pointRange.setStart(p.offsetNode, p.offset);
    }
  }
  if (!pointRange || !container.contains(pointRange.startContainer)) return null;
  const r = document.createRange();
  r.selectNodeContents(container);
  r.setEnd(pointRange.startContainer, pointRange.startOffset);
  return r.toString().length;
}

/** Wrap the current selection (or caret) with `before`/`after` markers. */
export function wrapSelection(el: HTMLElement, before: string, after: string): string {
  const sel = window.getSelection();
  const full = el.textContent ?? '';
  if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
    return full + before + after;
  }
  const range = sel.getRangeAt(0);
  const startRange = range.cloneRange();
  startRange.selectNodeContents(el);
  startRange.setEnd(range.startContainer, range.startOffset);
  const start = startRange.toString().length;
  const selected = range.toString();
  const end = start + selected.length;
  const next = full.slice(0, start) + before + full.slice(start, end) + after + full.slice(end);
  return next;
}
