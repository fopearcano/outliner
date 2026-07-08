// ---------------------------------------------------------------------------
// Serialize an outline subtree to Markdown / plain text / OPML / JSON.
// Operates on the raw item text so formatting round-trips.
// ---------------------------------------------------------------------------
import type { OutlineItem, Attachment } from '../types';
import type { ItemMap } from './tree';
import { plainText } from './markdown';

function children(items: ItemMap, id: string): OutlineItem[] {
  return (items[id]?.children ?? []).map((c) => items[c]).filter(Boolean);
}

export function exportMarkdown(items: ItemMap, rootId: string): string {
  const lines: string[] = [];
  const walk = (id: string, depth: number) => {
    for (const child of children(items, id)) {
      const indent = '  '.repeat(depth);
      let bullet = '- ';
      if (child.checkbox) bullet = child.completed ? '- [x] ' : '- [ ] ';
      const prefix = child.heading ? '#'.repeat(child.heading) + ' ' : '';
      lines.push(`${indent}${bullet}${prefix}${child.text}`);
      if (child.note.trim()) {
        for (const nl of child.note.split('\n')) {
          lines.push(`${indent}  ${nl}`);
        }
      }
      walk(child.id, depth + 1);
    }
  };
  walk(rootId, 0);
  return lines.join('\n') + '\n';
}

export function exportPlainText(items: ItemMap, rootId: string): string {
  const lines: string[] = [];
  const walk = (id: string, depth: number) => {
    for (const child of children(items, id)) {
      const indent = '\t'.repeat(depth);
      const mark = child.checkbox ? (child.completed ? '[x] ' : '[ ] ') : '';
      lines.push(`${indent}${mark}${plainText(child.text)}`);
      if (child.note.trim()) {
        for (const nl of child.note.split('\n')) lines.push(`${indent}\t${nl}`);
      }
      walk(child.id, depth + 1);
    }
  };
  walk(rootId, 0);
  return lines.join('\n') + '\n';
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportOpml(items: ItemMap, rootId: string, title: string): string {
  const walk = (id: string, depth: number): string => {
    return children(items, id)
      .map((child) => {
        const pad = '  '.repeat(depth + 2);
        const attrs = [`text="${xmlEscape(child.text)}"`];
        if (child.note.trim()) attrs.push(`_note="${xmlEscape(child.note)}"`);
        if (child.checkbox) attrs.push(`_checked="${child.completed}"`);
        if (child.collapsed) attrs.push(`_collapsed="true"`);
        const inner = walk(child.id, depth + 1);
        if (inner) {
          return `${pad}<outline ${attrs.join(' ')}>\n${inner}\n${pad}</outline>`;
        }
        return `${pad}<outline ${attrs.join(' ')}/>`;
      })
      .join('\n');
  };
  const body = walk(rootId, 0);
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${xmlEscape(title)}</title>
  </head>
  <body>
${body}
  </body>
</opml>
`;
}

export interface JsonNode {
  text: string;
  note?: string;
  checkbox?: boolean;
  completed?: boolean;
  collapsed?: boolean;
  heading?: number;
  color?: string | null;
  attachments?: Attachment[];
  children?: JsonNode[];
}

export function exportJson(items: ItemMap, rootId: string, title: string): string {
  const build = (id: string): JsonNode[] =>
    children(items, id).map((child) => {
      const node: JsonNode = { text: child.text };
      if (child.note.trim()) node.note = child.note;
      if (child.checkbox) {
        node.checkbox = true;
        node.completed = child.completed;
      }
      if (child.collapsed) node.collapsed = true;
      if (child.heading) node.heading = child.heading;
      if (child.color) node.color = child.color;
      if (child.attachments?.length) node.attachments = child.attachments;
      const kids = build(child.id);
      if (kids.length) node.children = kids;
      return node;
    });
  return JSON.stringify({ title, children: build(rootId) }, null, 2);
}

export function download(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
