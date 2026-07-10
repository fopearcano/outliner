import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store/store';
import { readFiles } from './lib/attachments';
import Sidebar from './components/Sidebar';
import DocumentView from './components/DocumentView';
import CommandPalette from './components/CommandPalette';
import SearchPanel from './components/SearchPanel';
import ShortcutHelp from './components/ShortcutHelp';
import SettingsModal from './components/SettingsModal';
import ImportExport from './components/ImportExport';
import DatePicker from './components/DatePicker';
import MoveDialog from './components/MoveDialog';
import ContextMenu from './components/ContextMenu';
import FormatToolbar from './components/FormatToolbar';
import { UiContext, type UiApi } from './components/ui-context';
import { findItemByTitle } from './store/selectors';

type ModalKind = null | 'palette' | 'search' | 'help' | 'settings' | 'io';

/** Shown when a remembered data file needs a fresh permission click after reload. */
function ReconnectBanner() {
  const needs = useStore((s) => s.fileNeedsReconnect);
  const fileName = useStore((s) => s.fileName);
  if (!needs) return null;
  return (
    <div className="reconnect-banner">
      <span>
        🔒 Your data file <strong>{fileName}</strong> is disconnected. Reconnect to load and
        keep auto-saving to it.
      </span>
      <button className="btn primary" onClick={() => void useStore.getState().reconnectFile()}>
        Reconnect
      </button>
    </div>
  );
}

export default function App() {
  const loaded = useStore((s) => s.loaded);
  const prefs = useStore((s) => s.preferences);

  const [modal, setModal] = useState<ModalKind>(null);
  const [searchSeed, setSearchSeed] = useState('');
  const [datePicker, setDatePicker] = useState<{ itemId: string; token: string | null } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ itemId: string; x: number; y: number } | null>(null);
  const [moveItem, setMoveItem] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAttach = useRef<string | null>(null);

  useEffect(() => {
    // Load local data, then restore a connected file (if any) on top.
    void useStore
      .getState()
      .hydrate()
      .then(() => useStore.getState().tryRestoreFile());
    // Ask the browser to keep our IndexedDB data instead of evicting it under
    // storage pressure — this app's whole point is to not lose your notes.
    void navigator.storage?.persist?.();
  }, []);

  // Apply the active theme to the document root.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', prefs.theme);
    document.documentElement.style.colorScheme = prefs.theme === 'light' ? 'light' : 'dark';
  }, [prefs.theme]);

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const target = pendingAttach.current;
    if (files && files.length && target) {
      const { attachments, errors } = await readFiles(files);
      if (attachments.length) useStore.getState().addAttachments(target, attachments);
      if (errors.length) alert(errors.join('\n'));
    }
    e.target.value = '';
    pendingAttach.current = null;
  };

  // Apply custom CSS.
  useEffect(() => {
    let el = document.getElementById('custom-css') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'custom-css';
      document.head.appendChild(el);
    }
    el.textContent = prefs.customCss;
  }, [prefs.customCss]);

  const ui: UiApi = useMemo(
    () => ({
      onTag: (tag) => {
        setSearchSeed(tag);
        setModal('search');
      },
      onInternalLink: (name) => {
        const item = findItemByTitle(useStore.getState().items, name);
        if (item) useStore.getState().revealItem(item.id);
      },
      openDatePicker: (itemId, token) => setDatePicker({ itemId, token }),
      openContextMenu: (itemId, x, y) => setCtxMenu({ itemId, x, y }),
      openMoveDialog: (itemId) => setMoveItem(itemId),
      attachTo: (itemId) => {
        pendingAttach.current = itemId;
        fileInputRef.current?.click();
      },
      openSearch: () => {
        setSearchSeed('');
        setModal('search');
      },
      openPalette: () => setModal('palette'),
      openSettings: () => setModal('settings'),
      openImportExport: () => setModal('io'),
      openHelp: () => setModal('help'),
    }),
    [],
  );

  // Global keyboard shortcuts.
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 'p' && !e.shiftKey) {
      e.preventDefault();
      setModal((m) => (m === 'palette' ? null : 'palette'));
    } else if (k === 'k') {
      e.preventDefault();
      setSearchSeed('');
      setModal((m) => (m === 'search' ? null : 'search'));
    } else if (k === 'f') {
      e.preventDefault();
      (document.querySelector('.filter-input') as HTMLInputElement | null)?.focus();
    } else if (k === '/') {
      e.preventDefault();
      setModal((m) => (m === 'help' ? null : 'help'));
    } else if (k === 'z') {
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur();
      if (e.shiftKey) useStore.getState().redo();
      else useStore.getState().undo();
    } else if (k === 'y' && !e.shiftKey) {
      e.preventDefault();
      useStore.getState().redo();
    } else if (k === ',') {
      e.preventDefault();
      useStore.getState().zoomOut();
    } else if (k === '\\') {
      e.preventDefault();
      const cur = useStore.getState().preferences.sidebarVisible;
      useStore.getState().setPreferences({ sidebarVisible: !cur });
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  if (!loaded) {
    return (
      <div className="boot">
        <div className="boot-mark">⌗</div>
        <div className="boot-text">loading outliner…</div>
      </div>
    );
  }

  const rootStyle = {
    ['--font-size' as string]: `${prefs.fontSize}px`,
    ['--accent' as string]: prefs.accent,
  } as React.CSSProperties;

  const appClass =
    'app' +
    (prefs.sidebarVisible ? '' : ' sidebar-hidden') +
    (prefs.compact ? ' compact' : '') +
    (prefs.showNotes ? '' : ' hide-notes');

  return (
    <UiContext.Provider value={ui}>
      <div className={appClass} style={rootStyle}>
        {prefs.sidebarVisible && <Sidebar />}
        {!prefs.sidebarVisible && (
          <button
            className="sidebar-reveal"
            title="Show sidebar (Ctrl/⌘ \)"
            onClick={() => useStore.getState().setPreferences({ sidebarVisible: true })}
          >
            ⌗
          </button>
        )}
        <main className="main">
          <ReconnectBanner />
          <DocumentView />
        </main>

        <FormatToolbar />

        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={onFilePicked}
        />

        {modal === 'palette' && <CommandPalette onClose={() => setModal(null)} />}
        {modal === 'search' && <SearchPanel onClose={() => setModal(null)} seed={searchSeed} />}
        {modal === 'help' && <ShortcutHelp onClose={() => setModal(null)} />}
        {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
        {modal === 'io' && <ImportExport onClose={() => setModal(null)} />}
        {datePicker && (
          <DatePicker
            itemId={datePicker.itemId}
            token={datePicker.token}
            onClose={() => setDatePicker(null)}
          />
        )}
        {moveItem && <MoveDialog itemId={moveItem} onClose={() => setMoveItem(null)} />}
        {ctxMenu && (
          <ContextMenu
            itemId={ctxMenu.itemId}
            x={ctxMenu.x}
            y={ctxMenu.y}
            onClose={() => setCtxMenu(null)}
          />
        )}
      </div>
    </UiContext.Provider>
  );
}
