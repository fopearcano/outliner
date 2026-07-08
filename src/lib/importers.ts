// ---------------------------------------------------------------------------
// Parse Markdown / plain text / OPML / JSON into a neutral tree the store can
// splice in. Indentation-based formats use a stack keyed on indent width.
// ---------------------------------------------------------------------------

import type { Attachment } from '../types';

export interface ImportNode {
  text: string;
  note?: string;
  checkbox?: boolean;
  completed?: boolean;
  collapsed?: boolean;
  heading?: number;
  color?: string | null;
  attachments?: Attachment[];
  children: ImportNode[];
}

function makeNode(text: string): ImportNode {
  return { text, children: [] };
}

/** Build a tree from (indentWidth, node) pairs using an indent stack. */
function assemble(rows: { indent: number; node: ImportNode }[]): ImportNode[] {
  const roots: ImportNode[] = [];
  const stack: { indent: number; node: ImportNode }[] = [];
  for (const row of rows) {
    while (stack.length && stack[stack.length - 1].indent >= row.indent) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(row.node);
    else roots.push(row.node);
    stack.push(row);
  }
  return roots;
}

export function importMarkdown(md: string): ImportNode[] {
  const rows: { indent: number; node: ImportNode }[] = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const indentMatch = raw.match(/^(\s*)/);
    const indentStr = indentMatch ? indentMatch[1] : '';
    const indent = indentStr.replace(/\t/g, '  ').length;
    let content = raw.trim();

    // Heading line: "# text" / "## text"
    const headingMatch = content.match(/^(#{1,6})\s+(.*)$/);
    // List bullet: "- ", "* ", "+ ", or "1. "
    const bulletMatch = content.match(/^(?:[-*+]|\d+\.)\s+(.*)$/);

    let node: ImportNode;
    let level = indent;
    if (bulletMatch) {
      content = bulletMatch[1];
      let checkbox = false;
      let completed = false;
      const cb = content.match(/^\[([ xX])\]\s+(.*)$/);
      if (cb) {
        checkbox = true;
        completed = cb[1].toLowerCase() === 'x';
        content = cb[2];
      }
      node = makeNode(content);
      if (checkbox) {
        node.checkbox = true;
        node.completed = completed;
      }
    } else if (headingMatch) {
      node = makeNode(headingMatch[2]);
      node.heading = Math.min(3, headingMatch[1].length);
    } else {
      node = makeNode(content);
    }
    rows.push({ indent: level, node });
  }
  return assemble(rows);
}

export function importPlainText(text: string): ImportNode[] {
  const rows: { indent: number; node: ImportNode }[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const m = raw.match(/^([\t ]*)/);
    const indentStr = m ? m[1] : '';
    // Treat a tab or two spaces as one level.
    const indent = indentStr.replace(/\t/g, '  ').length;
    let content = raw.trim();
    let checkbox = false;
    let completed = false;
    const cb = content.match(/^\[([ xX])\]\s+(.*)$/);
    if (cb) {
      checkbox = true;
      completed = cb[1].toLowerCase() === 'x';
      content = cb[2];
    }
    const node = makeNode(content);
    if (checkbox) {
      node.checkbox = true;
      node.completed = completed;
    }
    rows.push({ indent, node });
  }
  return assemble(rows);
}

export function importOpml(xml: string): ImportNode[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid OPML/XML');
  }
  const body = doc.querySelector('body');
  if (!body) return [];
  const convert = (el: Element): ImportNode => {
    const node = makeNode(el.getAttribute('text') ?? el.getAttribute('title') ?? '');
    const note = el.getAttribute('_note');
    if (note) node.note = note;
    const checked = el.getAttribute('_checked');
    if (checked !== null) {
      node.checkbox = true;
      node.completed = checked === 'true';
    }
    if (el.getAttribute('_collapsed') === 'true') node.collapsed = true;
    node.children = Array.from(el.children)
      .filter((c) => c.tagName.toLowerCase() === 'outline')
      .map(convert);
    return node;
  };
  return Array.from(body.children)
    .filter((c) => c.tagName.toLowerCase() === 'outline')
    .map(convert);
}

export function importJson(json: string): ImportNode[] {
  const data = JSON.parse(json);
  const arr: unknown[] = Array.isArray(data) ? data : (data?.children ?? []);
  const convert = (raw: unknown): ImportNode => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const node = makeNode(typeof o.text === 'string' ? o.text : '');
    if (typeof o.note === 'string') node.note = o.note;
    if (o.checkbox) {
      node.checkbox = true;
      node.completed = !!o.completed;
    }
    if (o.collapsed) node.collapsed = true;
    if (typeof o.heading === 'number') node.heading = o.heading;
    if (typeof o.color === 'string') node.color = o.color;
    if (Array.isArray(o.attachments)) node.attachments = o.attachments as Attachment[];
    if (Array.isArray(o.children)) node.children = o.children.map(convert);
    return node;
  };
  return arr.map(convert);
}

/** Dispatch to the right parser based on filename / extension. */
export function importByFilename(name: string, content: string): ImportNode[] {
  const lower = name.toLowerCase();
  if (lower.endsWith('.opml') || lower.endsWith('.xml')) return importOpml(content);
  if (lower.endsWith('.json')) return importJson(content);
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return importMarkdown(content);
  return importPlainText(content);
}
