// ---------------------------------------------------------------------------
// A thin, uncontrolled contentEditable. React never owns the DOM text while the
// user is typing (that would fight the caret); we only push text out on input
// and sync in from `value` when the field is not focused.
// ---------------------------------------------------------------------------
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface EditableHandle {
  el: HTMLDivElement | null;
  getText: () => string;
  setText: (v: string) => void;
}

interface EditableProps {
  value: string;
  onInput: (text: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLDivElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLDivElement>) => void;
  /** Called with any files present on paste (images pasted from clipboard, etc). */
  onFiles?: (files: File[]) => void;
  className?: string;
  placeholder?: string;
  spellCheck?: boolean;
}

export const Editable = forwardRef<EditableHandle, EditableProps>(function Editable(
  { value, onInput, onKeyDown, onFocus, onBlur, onFiles, className, placeholder, spellCheck },
  ref,
) {
  const elRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    el: elRef.current,
    getText: () => elRef.current?.textContent ?? '',
    setText: (v: string) => {
      if (elRef.current) elRef.current.textContent = v;
    },
  }));

  // Seed initial text once.
  useEffect(() => {
    if (elRef.current && elRef.current.textContent !== value) {
      elRef.current.textContent = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external changes (undo, formatting) only while unfocused.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (document.activeElement !== el && el.textContent !== value) {
      el.textContent = value;
    }
  }, [value]);

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    // If the clipboard carries files (e.g. a pasted image), attach them.
    const files = Array.from(e.clipboardData.files ?? []);
    if (files.length && onFiles) {
      e.preventDefault();
      onFiles(files);
      return;
    }
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain').replace(/\r?\n/g, ' ');
    document.execCommand('insertText', false, text);
  };

  return (
    <div
      ref={elRef}
      className={className}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      spellCheck={spellCheck ?? false}
      data-placeholder={placeholder}
      onInput={() => onInput(elRef.current?.textContent ?? '')}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      onPaste={handlePaste}
    />
  );
});
