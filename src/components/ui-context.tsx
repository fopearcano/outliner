// Shared UI callbacks provided by <App> so deep nodes can open dialogs and
// navigate without prop-drilling.
import { createContext, useContext } from 'react';

export interface UiApi {
  /** Jump to a tag: opens search filtered to that tag. */
  onTag: (tag: string) => void;
  /** Follow an [[internal link]] by title. */
  onInternalLink: (name: string) => void;
  /** Open the date picker for an item (token/index identify an existing date). */
  openDatePicker: (itemId: string, token: string | null, index: number | null) => void;
  /** Open the right-click context menu for an item. */
  openContextMenu: (itemId: string, x: number, y: number) => void;
  /** Open the "move to document" dialog for an item. */
  openMoveDialog: (itemId: string) => void;
  /** Open a file picker and attach the chosen files to an item. */
  attachTo: (itemId: string) => void;
  /** App-level overlays. */
  openSearch: () => void;
  openPalette: () => void;
  openSettings: () => void;
  openImportExport: () => void;
  openHelp: () => void;
}

export const UiContext = createContext<UiApi | null>(null);

export function useUi(): UiApi {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('UiContext missing');
  return ctx;
}
