// ---------------------------------------------------------------------------
// Left rail: document / folder tree, bookmarks, tag pane, and quick actions.
// ---------------------------------------------------------------------------
import React, { useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useUi } from './ui-context';
import { collectTags } from '../store/selectors';
import { tagColor, tagLabel } from '../lib/tags';

export default function Sidebar() {
  const rootDocIds = useStore((s) => s.rootDocIds);
  const docs = useStore((s) => s.docs);
  const ui = useUi();
  const [tagsOpen, setTagsOpen] = useState(true);
  const [bookmarksOpen, setBookmarksOpen] = useState(true);

  const dragId = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string | null; pos: DocDropPos } | null>(null);

  const bookmarks = Object.values(docs).filter((d) => d.bookmarked);
  const items = useStore((s) => s.items);
  const tags = useMemo(() => collectTags(items), [items]);

  const onDropRoot = () => {
    if (dragId.current) {
      useStore.getState().moveDoc(dragId.current, null, useStore.getState().rootDocIds.length);
    }
    dragId.current = null;
    setDropTarget(null);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <span className="brand-mark">⌗</span>
          <span className="brand-name">outliner</span>
        </div>
        <div className="brand-actions">
          <button className="icon-btn" title="Command palette (Ctrl/Cmd+P)" onClick={ui.openPalette}>
            ⌘
          </button>
          <button className="icon-btn" title="Search everything (Ctrl/Cmd+K)" onClick={ui.openSearch}>
            ⌕
          </button>
          <button
            className="icon-btn"
            title="Hide sidebar (Ctrl/Cmd+\)"
            onClick={() => useStore.getState().setPreferences({ sidebarVisible: false })}
          >
            ⇤
          </button>
        </div>
      </div>

      <div className="sidebar-toolbar">
        <button className="tool" onClick={() => useStore.getState().createDocument(null)}>
          ＋ Document
        </button>
        <button className="tool" onClick={() => useStore.getState().createFolder(null)}>
          ＋ Folder
        </button>
      </div>

      <div className="sidebar-scroll">
        {bookmarks.length > 0 && (
          <div className="side-section">
            <button className="side-section-head" onClick={() => setBookmarksOpen((v) => !v)}>
              {bookmarksOpen ? '▾' : '▸'} <span>Bookmarks</span>
            </button>
            {bookmarksOpen && (
              <div className="side-list">
                {bookmarks.map((d) => (
                  <button
                    key={d.id}
                    className="doc-row bookmark"
                    onClick={() => useStore.getState().selectDoc(d.id)}
                  >
                    <span className="doc-icon">★</span>
                    <span className="doc-name">{d.title || 'Untitled'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="side-section">
          <div className="side-section-head static">
            <span>Documents</span>
          </div>
          <div
            className="side-list doc-tree"
            onDragOver={(e) => {
              if (dragId.current) {
                e.preventDefault();
                setDropTarget({ id: null, pos: 'into' });
              }
            }}
            onDrop={onDropRoot}
          >
            {rootDocIds.map((id) => (
              <DocTreeNode
                key={id}
                id={id}
                depth={0}
                dragId={dragId}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
              />
            ))}
          </div>
        </div>

        {tags.length > 0 && (
          <div className="side-section">
            <button className="side-section-head" onClick={() => setTagsOpen((v) => !v)}>
              {tagsOpen ? '▾' : '▸'} <span>Tags</span>
            </button>
            {tagsOpen && (
              <div className="tag-cloud">
                {tags.map((t) => (
                  <button
                    key={t.tag}
                    className="tag-chip"
                    style={{ color: tagColor(t.tag) }}
                    title={`${tagLabel(t.tag)} · ${t.count} use${t.count === 1 ? '' : 's'}`}
                    onClick={() => ui.onTag(t.tag)}
                  >
                    {t.tag}
                    <span className="tag-count">{t.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sidebar-foot">
        <button className="foot-btn" onClick={ui.openImportExport} title="Import / export">
          ⇅ Import / Export
        </button>
        <button className="foot-btn" onClick={ui.openHelp} title="Keyboard shortcuts (Ctrl/Cmd+/)">
          ⌨ Shortcuts
        </button>
        <button className="foot-btn" onClick={ui.openSettings} title="Settings">
          ⚙ Settings
        </button>
      </div>
    </aside>
  );
}

type DocDropPos = 'before' | 'after' | 'into';

interface DocNodeProps {
  id: string;
  depth: number;
  dragId: React.MutableRefObject<string | null>;
  dropTarget: { id: string | null; pos: DocDropPos } | null;
  setDropTarget: (t: { id: string | null; pos: DocDropPos } | null) => void;
}

function DocTreeNode({ id, depth, dragId, dropTarget, setDropTarget }: DocNodeProps) {
  const doc = useStore((s) => s.docs[id]);
  const currentDocId = useStore((s) => s.currentDocId);
  const [renaming, setRenaming] = useState(false);
  if (!doc) return null;

  const isFolder = doc.kind === 'folder';
  const active = currentDocId === id;
  const dropHere = dropTarget && dropTarget.id === id ? dropTarget.pos : null;

  const onDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    dragId.current = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!dragId.current || dragId.current === id) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    let pos: DocDropPos;
    if (isFolder && y > rect.height * 0.3 && y < rect.height * 0.7) pos = 'into';
    else pos = y < rect.height * 0.5 ? 'before' : 'after';
    setDropTarget({ id, pos });
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const drag = dragId.current;
    dragId.current = null;
    setDropTarget(null);
    if (!drag || drag === id) return;
    const s = useStore.getState();
    const pos = dropHere ?? 'after';
    if (pos === 'into' && isFolder) {
      s.moveDoc(drag, id, s.docs[id].children.length);
    } else {
      const parentId = doc.parentId;
      const siblings = parentId ? s.docs[parentId]?.children ?? [] : s.rootDocIds;
      const idx = siblings.indexOf(id);
      s.moveDoc(drag, parentId, pos === 'before' ? idx : idx + 1);
    }
  };

  return (
    <div className="doc-tree-node">
      <div
        className={
          'doc-row' +
          (active ? ' active' : '') +
          (dropHere ? ` doc-drop-${dropHere}` : '')
        }
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable={!renaming}
        onDragStart={onDragStart}
        onDragEnd={() => {
          dragId.current = null;
          setDropTarget(null);
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => (isFolder ? useStore.getState().toggleFolderExpanded(id) : useStore.getState().selectDoc(id))}
        onDoubleClick={() => setRenaming(true)}
        onContextMenu={(e) => {
          e.preventDefault();
          setRenaming(true);
        }}
      >
        <span className="doc-icon">
          {isFolder ? (doc.expanded ? '📂' : '📁') : '▤'}
        </span>
        {renaming ? (
          <input
            className="doc-rename"
            autoFocus
            defaultValue={doc.title}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => {
              useStore.getState().renameDoc(id, e.target.value.trim() || 'Untitled');
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="doc-name">{doc.title || 'Untitled'}</span>
        )}
        <span className="doc-row-actions" onClick={(e) => e.stopPropagation()}>
          {!isFolder && (
            <button
              className={'mini-btn' + (doc.bookmarked ? ' on' : '')}
              title="Bookmark"
              onClick={() => useStore.getState().toggleBookmark(id)}
            >
              ★
            </button>
          )}
          {isFolder && (
            <button
              className="mini-btn"
              title="New document in folder"
              onClick={() => useStore.getState().createDocument(id)}
            >
              ＋
            </button>
          )}
          <button
            className="mini-btn danger"
            title="Delete"
            onClick={() => {
              if (confirm(`Delete “${doc.title}”${isFolder ? ' and its contents' : ''}?`))
                useStore.getState().deleteDoc(id);
            }}
          >
            🗑
          </button>
        </span>
      </div>
      {isFolder && doc.expanded && (
        <div className="doc-children">
          {doc.children.map((cid) => (
            <DocTreeNode
              key={cid}
              id={cid}
              depth={depth + 1}
              dragId={dragId}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
            />
          ))}
        </div>
      )}
    </div>
  );
}
