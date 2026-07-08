# ⌗ Outliner

A personal, **private, local‑first** outliner — a self‑hostable take on
[Dynalist](https://dynalist.io) Pro, wrapped in a dark **VSCode “Dark+” hacker**
theme with syntax‑token color coding.

Everything lives in your browser (IndexedDB). No account, no server, no
telemetry — your notes never leave the machine.

![monospace, dark, color-coded outliner](docs/screenshot.png)

---

## Features

### Outlining core
- **Infinite nested bullets** with collapse / expand and indent guides
- **Keyboard‑first editing** — `Enter` splits at the cursor, `Tab` / `Shift+Tab`
  indent / outdent, `Ctrl/⌘+Shift+↑/↓` move bullets, arrow keys walk the tree
- **Zoom in** on any bullet (click its dot) with a breadcrumb trail to zoom back out
- **Drag & drop** bullets to reorder or re‑parent (before / after / into)
- **Notes** under any bullet (`Shift+Enter`)
- **Checkboxes / to‑dos** with completion + strikethrough (`Ctrl/⌘+Enter`)
- **Headings**, **color labels**, duplicate, cut / copy / paste of whole subtrees
- **Undo / redo** with sensible granularity

### Rich inline markdown (color‑coded like syntax tokens)
`**bold**` · `*italic*` · `~~strike~~` · `` `code` `` · `==highlight==` ·
`[label](url)` · `#tag` · `@mention` · `[[internal link]]` · `!(2026-07-10)` dates

- **#tags** and **@mentions** are clickable and collected into a tag pane
- **[[internal links]]** jump between bullets, with automatic **backlinks**
- **!(date)** tokens render as friendly labels (“Today”, “Tomorrow”, “Fri”),
  flag overdue items, and support **recurrence** (daily / weekly / monthly / yearly)

### Organize
- **Documents & folders** in a draggable sidebar
- **Bookmarks** for quick access
- **Search everything** (`Ctrl/⌘+K`) across all documents, with operators
  (`#tag`, `@mention`, `is:complete`, `is:incomplete`, `is:checkbox`,
  `has:date`, `-negation`, `"quoted phrases"`)
- **Filter within a document** (`Ctrl/⌘+F`)
- **Command palette** (`Ctrl/⌘+P`)

### Pro touches
- **Import**: OPML, Markdown, plain text, JSON
- **Export**: OPML, Markdown, plain text, JSON — plus a full **backup** file
- **Custom CSS**, adjustable font size and accent color
- **Checkbox mode** & **numbered lists** per document

Press `Ctrl/⌘+/` in the app for the full shortcut reference.

---

## Run it

```bash
npm install
npm run dev      # open the printed http://localhost:5273
```

Build a static bundle you can host anywhere (or open locally):

```bash
npm run build
npm run preview
```

Requires Node 18+. The whole app is static — drop `dist/` on any static host,
or just keep running it locally.

---

## Privacy & data

- All documents are stored in **IndexedDB** in your browser, mirrored to
  `localStorage` as a safety net. Nothing is ever sent over the network.
- Auto‑saved (debounced) on every change.
- Use **Import / Export → Download backup** for a portable JSON snapshot, or
  **Settings → Erase all data** to start fresh.

---

## Architecture

Plain **React + TypeScript + Vite**, ~zero runtime dependencies beyond React and
[Zustand](https://github.com/pmndrs/zustand) for state.

```
src/
  types.ts              Data model (normalized items + docs graph)
  store/
    store.ts            Zustand store — every outline operation, undo/redo, persistence
    selectors.ts        Derived views (tags, backlinks, doc-for-item)
    dragStore.ts        Ephemeral drag-and-drop state
  lib/
    tree.ts             Pure tree traversal / mutation helpers
    markdown.tsx        Inline markdown → React nodes (color-coded tokens)
    dates.ts            Date token parsing, labels, recurrence
    search.ts           Query parsing + item matching
    caret.ts            contentEditable caret helpers
    exporters.ts        OPML / Markdown / text / JSON export
    importers.ts        OPML / Markdown / text / JSON import
    persistence.ts      IndexedDB load/save (+ localStorage fallback)
    keymap.ts           Keyboard-shortcut reference
  components/           Sidebar, DocumentView, recursive OutlineNode, modals…
  styles/               VSCode-dark theme + layout
```

The item graph is fully **normalized** (`items[id]`, `docs[id]`); each document
owns a hidden root item whose children are its top‑level bullets. Bullets render
as pretty markdown when idle and switch to a raw `contentEditable` on focus.

---

## License

MIT — it’s yours. Make it your own via Settings → Custom CSS.
