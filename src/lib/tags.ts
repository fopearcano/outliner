// ---------------------------------------------------------------------------
// Sigil tags. Beyond #tags and @mentions, creative writing benefits from more
// colour-coded dimensions, so § & % $ £ are tags too — each its own colour, so
// a writer can track themes, characters, settings, relationships, plot devices,
// objects, stakes… however they choose to assign them.
// ---------------------------------------------------------------------------

/** Every recognised tag sigil. */
export const TAG_SIGILS = ['#', '@', '§', '&', '%', '$', '£'] as const;
export type TagSigil = (typeof TAG_SIGILS)[number];

// A sigil immediately followed by a word, not glued to preceding non-space
// (so "50%" or "R&D" don't become tags, but a space-led "%plot" / "&bond" do).
// One shared source of truth — markdown, the tag pane and the graph all use it.
// (Every sigil above is a literal inside a character class — none need escaping.)
const SIGIL_CLASS = `[${TAG_SIGILS.join('')}]`;
export const TAG_RE = new RegExp(`(?<!\\S)(${SIGIL_CLASS})([\\p{L}\\p{N}_\\-/]+)`, 'gu');
/** Non-global single-match copy for the markdown rules table. */
export const TAG_RE_SINGLE = new RegExp(`(?<!\\S)(${SIGIL_CLASS})([\\p{L}\\p{N}_\\-/]+)`, 'u');

/** CSS colour variable per sigil. */
export const TAG_COLOR: Record<string, string> = {
  '#': 'var(--tok-blue)',
  '@': 'var(--tok-yellow)',
  '§': 'var(--tok-green)',
  '&': 'var(--tok-orange)',
  '%': 'var(--tok-purple)',
  '$': 'var(--tok-teal)',
  '£': 'var(--tok-pink)',
};

/** A stable CSS class per sigil (markdown token + sidebar chip). */
export const TAG_CLASS: Record<string, string> = {
  '#': 'md-tag',
  '@': 'md-mention',
  '§': 'md-sec',
  '&': 'md-amp',
  '%': 'md-pct',
  '$': 'md-dol',
  '£': 'md-gbp',
};

/** Short human label per sigil (for the legend / help). */
export const TAG_LABEL: Record<string, string> = {
  '#': 'tag',
  '@': 'mention',
  '§': 'section',
  '&': 'link',
  '%': 'motif',
  '$': 'object',
  '£': 'stake',
};

export const tagColor = (tag: string): string => TAG_COLOR[tag[0]] ?? 'var(--tok-blue)';
export const tagClass = (tag: string): string => TAG_CLASS[tag[0]] ?? 'md-tag';
/** Human-readable label for a tag's sigil, e.g. "$sword" → "object". */
export const tagLabel = (tag: string): string => TAG_LABEL[tag[0]] ?? 'tag';
