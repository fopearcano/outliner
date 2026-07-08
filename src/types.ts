// ---------------------------------------------------------------------------
// Core data model for Outliner.
//
// The store is fully normalized: every outline bullet lives in `items` keyed by
// id, and every sidebar entry (document or folder) lives in `docs`. A document
// owns a hidden root OutlineItem whose children are the top-level bullets.
// ---------------------------------------------------------------------------

/** A single bullet / node in an outline. */
export interface OutlineItem {
  id: string;
  /** Raw text, may contain inline markdown (**bold**, #tags, [[links]], etc). */
  text: string;
  /** Optional secondary note shown under the bullet. */
  note: string;
  /** Ordered child item ids. */
  children: string[];
  /** Parent item id. The document root item has parent === null. */
  parent: string | null;
  /** Whether the children are folded away. */
  collapsed: boolean;
  /** Whether this bullet renders a checkbox. */
  checkbox: boolean;
  /** Whether the checkbox is ticked (also used for strikethrough). */
  completed: boolean;
  /** 0 = normal text, 1..3 = heading level (larger text). */
  heading: number;
  /** Named color label, or null. Maps to a palette entry. */
  color: ColorLabel | null;
  createdAt: number;
  modifiedAt: number;
}

export type ColorLabel =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'gray';

export const COLOR_LABELS: ColorLabel[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'purple',
  'pink',
  'gray',
];

/** A sidebar entry: either a document (owns an outline) or a folder (holds docs). */
export interface Doc {
  id: string;
  kind: 'document' | 'folder';
  title: string;
  /** Parent folder id, or null when at the sidebar root. */
  parentId: string | null;
  /** For folders: ordered child doc/folder ids. Unused for documents. */
  children: string[];
  /** For documents: id of the hidden root OutlineItem. Unused for folders. */
  rootItemId?: string;
  bookmarked: boolean;
  /** Whether the folder is expanded in the sidebar. */
  expanded: boolean;
  settings: DocSettings;
  createdAt: number;
  modifiedAt: number;
}

export interface DocSettings {
  /** New bullets become checkboxes by default. */
  checkboxMode: boolean;
  /** Render bullets as a numbered (1. 2. 3.) list. */
  numbered: boolean;
}

export const DEFAULT_DOC_SETTINGS: DocSettings = {
  checkboxMode: false,
  numbered: false,
};

/** Global app preferences (persisted). */
export interface Preferences {
  /** Extra user CSS injected into the app (Pro "custom CSS"). */
  customCss: string;
  /** Font size in px for outline text. */
  fontSize: number;
  /** Accent color used across the UI. */
  accent: string;
  /** Show completed items or hide them. */
  showCompleted: boolean;
  /** Spellcheck inside the editor. */
  spellcheck: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  customCss: '',
  fontSize: 15,
  accent: '#4ec9b0',
  showCompleted: true,
  spellcheck: false,
};

/** The full persisted document graph. */
export interface PersistedState {
  version: number;
  items: Record<string, OutlineItem>;
  docs: Record<string, Doc>;
  rootDocIds: string[];
  currentDocId: string | null;
  preferences: Preferences;
}

export const STATE_VERSION = 1;
