// ---------------------------------------------------------------------------
// Inline markdown → React nodes. Supports the subset that matters for an
// outliner: emphasis, code, highlight, links, #tags, @mentions, [[internal
// links]] and !(date) tokens. Tokens are color-coded by the theme.
// ---------------------------------------------------------------------------
import React from 'react';
import { relativeLabel, parseDateToken, isOverdue } from './dates';

export interface RenderOpts {
  onTag?: (tag: string) => void;
  onInternalLink?: (name: string) => void;
  onDate?: (raw: string, occurrenceIndex: number) => void;
}

type Rule = {
  name: string;
  re: RegExp;
};

// Ordered by precedence. Earlier rules win ties on match position. `mark` and
// `dot` sit before `italic` so a leading "* " list marker beats *italic*.
const RULES: Rule[] = [
  { name: 'code', re: /`([^`]+)`/ },
  { name: 'bold', re: /\*\*([^*]+?)\*\*/ },
  { name: 'boldAlt', re: /__([^_]+?)__/ },
  { name: 'strike', re: /~~([^~]+?)~~/ },
  { name: 'highlight', re: /==([^=]+?)==/ },
  // A dot immediately before a word → fuchsia (e.g. .todo).
  { name: 'dot', re: /(?<!\S)\.([\p{L}\p{N}_][\p{L}\p{N}_\-/]*)/u },
  // A standalone dash or asterisk marker → carmine red (e.g. "- item", "* item").
  { name: 'mark', re: /(?<!\S)([-*])(?!\S)/ },
  { name: 'italic', re: /\*([^*\n]+?)\*/ },
  { name: 'italicAlt', re: /(?<![\w])_([^_\n]+?)_(?![\w])/ },
  { name: 'ilink', re: /\[\[([^\]]+?)\]\]/ },
  { name: 'link', re: /\[([^\]]*?)\]\((https?:\/\/[^)]+|\/[^)]*)\)/ },
  { name: 'date', re: /!\(([^)]+?)\)/ },
  { name: 'tag', re: /(?<!\S)#([\p{L}\p{N}_\-/]+)/u },
  { name: 'mention', re: /(?<!\S)@([\p{L}\p{N}_\-/]+)/u },
  { name: 'url', re: /(?<!\S)(https?:\/\/[^\s)]+)/ },
];

// Global-flag copies driven with lastIndex so that matching a token then
// continuing does NOT lose the real preceding character: the (?<!\S) lookbehind
// on tag/mention/dot/mark keeps seeing text[index-1] instead of a fake string
// boundary. Fixes e.g. "@bob.smith" wrongly rendering ".smith" as a .word.
const G_RULES: Rule[] = RULES.map((r) => ({
  name: r.name,
  re: new RegExp(r.re.source, r.re.flags.includes('g') ? r.re.flags : r.re.flags + 'g'),
}));

let keySeq = 0;

export function renderInline(text: string, opts: RenderOpts = {}): React.ReactNode {
  return <>{render(text, opts, 0)}</>;
}

function render(text: string, opts: RenderOpts, depth: number, start = 0): React.ReactNode[] {
  if (start >= text.length) return [];
  if (depth > 12) return [text.slice(start)]; // guard against pathological nesting

  let best: { rule: Rule; m: RegExpExecArray } | null = null;
  for (const rule of G_RULES) {
    rule.re.lastIndex = start;
    const m = rule.re.exec(text);
    if (m && (!best || m.index < best.m.index)) {
      best = { rule, m };
    }
  }
  if (!best) return [text.slice(start)];

  const { rule, m } = best;
  const out: React.ReactNode[] = [];
  if (m.index > start) out.push(text.slice(start, m.index));
  out.push(renderToken(rule, m, opts, depth));
  out.push(...render(text, opts, depth, m.index + m[0].length));
  return out;
}

function renderToken(
  rule: Rule,
  m: RegExpExecArray,
  opts: RenderOpts,
  depth: number,
): React.ReactNode {
  const key = `t${keySeq++}`;
  const inner = m[1] ?? '';
  switch (rule.name) {
    case 'code':
      return <code key={key} className="md-code">{inner}</code>;
    case 'bold':
    case 'boldAlt':
      return <strong key={key}>{render(inner, opts, depth + 1)}</strong>;
    case 'italic':
    case 'italicAlt':
      return <em key={key}>{render(inner, opts, depth + 1)}</em>;
    case 'strike':
      return <del key={key}>{render(inner, opts, depth + 1)}</del>;
    case 'highlight':
      return <mark key={key} className="md-highlight">{render(inner, opts, depth + 1)}</mark>;
    case 'ilink':
      return (
        <span
          key={key}
          className="md-ilink"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            opts.onInternalLink?.(inner.trim());
          }}
        >
          {inner}
        </span>
      );
    case 'link': {
      const label = m[1] || m[2];
      const href = m[2];
      return (
        <a
          key={key}
          className="md-link"
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {label}
        </a>
      );
    }
    case 'url':
      return (
        <a
          key={key}
          className="md-link"
          href={inner}
          target="_blank"
          rel="noreferrer noopener"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {inner}
        </a>
      );
    case 'tag':
      return (
        <span
          key={key}
          className="md-tag"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            opts.onTag?.('#' + inner);
          }}
        >
          #{inner}
        </span>
      );
    case 'mention':
      return (
        <span
          key={key}
          className="md-mention"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            opts.onTag?.('@' + inner);
          }}
        >
          @{inner}
        </span>
      );
    case 'dot':
      return (
        <span
          key={key}
          className="md-dot"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            opts.onTag?.('.' + inner);
          }}
        >
          .{inner}
        </span>
      );
    case 'mark':
      return (
        <span key={key} className="md-mark">
          {inner}
        </span>
      );
    case 'date': {
      const parsed = parseDateToken(inner);
      const overdue = parsed ? isOverdue(parsed.date, parsed.hasTime) && !parsed.repeat : false;
      const label = parsed ? relativeLabel(parsed.date, parsed.hasTime) : inner;
      return (
        <span
          key={key}
          className={'md-date' + (overdue ? ' md-date-overdue' : '')}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            opts.onDate?.(m[0], m.index);
          }}
        >
          📅 {label}
          {parsed?.repeat ? ' ⟳' : ''}
        </span>
      );
    }
    default:
      return m[0];
  }
}

/** Strip inline markdown to a plain string (titles, search, link matching). */
export function plainText(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+?)\*\*/g, '$1')
    .replace(/__([^_]+?)__/g, '$1')
    .replace(/~~([^~]+?)~~/g, '$1')
    .replace(/==([^=]+?)==/g, '$1')
    .replace(/(?<![\w])\*([^*\n]+?)\*/g, '$1')
    .replace(/(?<![\w])_([^_\n]+?)_(?![\w])/g, '$1')
    .replace(/\[\[([^\]]+?)\]\]/g, '$1')
    .replace(/\[([^\]]*?)\]\((?:https?:\/\/[^)]+|\/[^)]*)\)/g, '$1')
    .trim();
}
