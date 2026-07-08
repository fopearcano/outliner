// ---------------------------------------------------------------------------
// Query parsing + item matching for search and in-document filtering.
// Supports free text plus operators: #tag, @mention, is:complete/incomplete/
// checkbox/heading, has:date, and -negation.
// ---------------------------------------------------------------------------
import type { OutlineItem } from '../types';
import { plainText } from './markdown';
import { findDateTokens } from './dates';

export interface SearchQuery {
  raw: string;
  terms: string[];
  negTerms: string[];
  tags: string[];
  mentions: string[];
  flags: string[]; // e.g. "complete", "incomplete", "checkbox", "heading", "date"
  isEmpty: boolean;
}

export function parseQuery(raw: string): SearchQuery {
  const q: SearchQuery = {
    raw,
    terms: [],
    negTerms: [],
    tags: [],
    mentions: [],
    flags: [],
    isEmpty: true,
  };
  const tokens = raw.trim().match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  for (let tok of tokens) {
    tok = tok.replace(/"/g, '');
    if (!tok) continue;
    q.isEmpty = false;
    if (tok.startsWith('#')) q.tags.push(tok.toLowerCase());
    else if (tok.startsWith('@')) q.mentions.push(tok.toLowerCase());
    else if (tok.startsWith('is:')) q.flags.push(tok.slice(3).toLowerCase());
    else if (tok.startsWith('has:')) q.flags.push(tok.slice(4).toLowerCase());
    else if (tok.startsWith('-') && tok.length > 1) q.negTerms.push(tok.slice(1).toLowerCase());
    else q.terms.push(tok.toLowerCase());
  }
  if (raw.trim() === '') q.isEmpty = true;
  return q;
}

export function matchItem(item: OutlineItem, q: SearchQuery): boolean {
  if (q.isEmpty) return true;
  const haystack = (plainText(item.text) + ' ' + item.note).toLowerCase();

  for (const t of q.terms) if (!haystack.includes(t)) return false;
  for (const t of q.negTerms) if (haystack.includes(t)) return false;
  for (const tag of q.tags) if (!haystack.includes(tag)) return false;
  for (const men of q.mentions) if (!haystack.includes(men)) return false;

  for (const flag of q.flags) {
    switch (flag) {
      case 'complete':
      case 'done':
      case 'checked':
        if (!item.completed) return false;
        break;
      case 'incomplete':
      case 'todo':
      case 'unchecked':
        if (!(item.checkbox && !item.completed)) return false;
        break;
      case 'checkbox':
      case 'task':
        if (!item.checkbox) return false;
        break;
      case 'heading':
        if (!item.heading) return false;
        break;
      case 'date':
      case 'scheduled':
        if (findDateTokens(item.text).length === 0) return false;
        break;
      case 'starred':
      case 'colored':
        if (!item.color) return false;
        break;
      default:
        break;
    }
  }
  return true;
}
