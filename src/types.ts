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
  /** Optional box/border drawn around the bullet. */
  box: BoxStyle | null;
  /** Column for the 2-column view (0 = main, 1 = the independent 2nd column). */
  column: number;
  /** Side of the central line in the L-R view. Default 'right' (normal). */
  lr: LrSide;
  /** Image / file attachments (stored inline as data URLs). */
  attachments: Attachment[];
  createdAt: number;
  modifiedAt: number;
}

/** A border drawn around a bullet in any view. */
export interface BoxStyle {
  /** CSS color (hex). */
  color: string;
  /** Stroke width in px. */
  width: number;
}

export const DEFAULT_BOX: BoxStyle = { color: '#4ec9b0', width: 2 };

/** An image or file attached to a bullet, stored locally as a data URL. */
export interface Attachment {
  id: string;
  name: string;
  /** MIME type, e.g. "image/png" or "application/pdf". */
  type: string;
  /** Size in bytes of the original file. */
  size: number;
  /** Base64 data URL — keeps everything local, no server needed. */
  dataUrl: string;
  createdAt: number;
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

/** Concrete hex for each color label (used where a fixed CSS color is needed). */
export const COLOR_HEX: Record<ColorLabel, string> = {
  red: '#f44747',
  orange: '#ce9178',
  yellow: '#dcdcaa',
  green: '#6a9955',
  cyan: '#4ec9b0',
  blue: '#569cd6',
  purple: '#c586c0',
  pink: '#d16d9e',
  gray: '#858585',
};

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

/** Layout of the document body. */
export type ViewMode = 'outline' | 'col2' | 'lr';
/** How columns handle text that's wider than the column. */
export type ColumnFit = 'wrap' | 'scroll';
/** Which side of the central line a block sits on, in the L-R view. */
export type LrSide = 'left' | 'right';

export interface DocSettings {
  /** New bullets become checkboxes by default. */
  checkboxMode: boolean;
  /** Render bullets as a numbered (1. 2. 3.) list. */
  numbered: boolean;
  /** outline (default) | 2-column | left-right. */
  viewMode: ViewMode;
  /** In the 2-column view: wrap text to the column, or scroll horizontally + zoom. */
  columnFit: ColumnFit;
  /** Zoom factor used in the column "scroll" fit (0.5–2). */
  columnZoom: number;
}

export const DEFAULT_DOC_SETTINGS: DocSettings = {
  checkboxMode: false,
  numbered: false,
  viewMode: 'outline',
  columnFit: 'wrap',
  columnZoom: 1,
};

/** Available color themes. */
export type ThemeName = 'dark' | 'darker' | 'light';

export const THEMES: { id: ThemeName; label: string; accent: string }[] = [
  { id: 'dark', label: 'Dark', accent: '#4ec9b0' },
  { id: 'darker', label: 'Darker', accent: '#4ec9b0' },
  { id: 'light', label: 'Light', accent: '#267f99' },
];

/** Global app preferences (persisted). */
export interface Preferences {
  /** Extra user CSS injected into the app (Pro "custom CSS"). */
  customCss: string;
  /** Font size in px for outline text. */
  fontSize: number;
  /** Accent color used across the UI. */
  accent: string;
  /** Active color theme. */
  theme: ThemeName;
  /** Show completed items or hide them. */
  showCompleted: boolean;
  /** Show notes under bullets. */
  showNotes: boolean;
  /** Tighter vertical spacing. */
  compact: boolean;
  /** Whether the left sidebar is visible. */
  sidebarVisible: boolean;
  /** Spellcheck inside the editor. */
  spellcheck: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  customCss: '',
  fontSize: 15,
  accent: '#4ec9b0',
  theme: 'dark',
  showCompleted: true,
  showNotes: true,
  compact: false,
  sidebarVisible: true,
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
