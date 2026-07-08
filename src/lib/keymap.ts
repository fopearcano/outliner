// Centralized keyboard-shortcut reference shown in the help modal. The actual
// handlers live in the components; this is the single source of documentation.
export interface Shortcut {
  keys: string;
  desc: string;
}
export interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

const mod = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';

export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Editing',
    items: [
      { keys: 'Enter', desc: 'New bullet (splits at cursor)' },
      { keys: 'Shift+Enter', desc: 'New line inside the bullet' },
      { keys: 'Tab', desc: 'Indent bullet' },
      { keys: 'Shift+Tab', desc: 'Outdent bullet' },
      { keys: 'Backspace', desc: 'Merge into bullet above (at line start)' },
      { keys: `${mod}+Shift+Backspace`, desc: 'Delete bullet and its children' },
      { keys: `${mod}+B / I`, desc: 'Bold / italic selection' },
      { keys: `${mod}+Shift+H`, desc: 'Highlight selection' },
      { keys: `${mod}+Shift+X`, desc: 'Strikethrough selection' },
    ],
  },
  {
    title: 'Structure',
    items: [
      { keys: `${mod}+Shift+↑ / ↓`, desc: 'Move bullet up / down' },
      { keys: `${mod}+↑ / ↓`, desc: 'Collapse / expand bullet' },
      { keys: `${mod}+Enter`, desc: 'Toggle complete (checkbox)' },
      { keys: `${mod}+Shift+C`, desc: 'Toggle checkbox on/off' },
      { keys: `${mod}+Shift+1..3`, desc: 'Cycle heading size' },
      { keys: `${mod}+D`, desc: 'Duplicate bullet' },
      { keys: 'Shift+Enter (on note)', desc: 'Edit note under bullet' },
    ],
  },
  {
    title: 'Navigation',
    items: [
      { keys: '↑ / ↓', desc: 'Move between bullets' },
      { keys: `${mod}+.`, desc: 'Zoom into bullet' },
      { keys: `${mod}+,`, desc: 'Zoom out' },
      { keys: `${mod}+P`, desc: 'Command palette' },
      { keys: `${mod}+K`, desc: 'Search all documents' },
      { keys: `${mod}+F`, desc: 'Filter current document' },
    ],
  },
  {
    title: 'General',
    items: [
      { keys: `${mod}+Z`, desc: 'Undo' },
      { keys: `${mod}+Shift+Z`, desc: 'Redo' },
      { keys: `${mod}+C / X / V`, desc: 'Copy / cut / paste bullet subtree' },
      { keys: `${mod}+/`, desc: 'Show this help' },
      { keys: 'Esc', desc: 'Close dialogs / clear filter' },
    ],
  },
];
