// Ephemeral drag-and-drop state, kept separate from the document store so that
// hover updates only re-render the nodes that care about the drop target.
import { create } from 'zustand';

export type DropPosition = 'before' | 'after' | 'child';

interface DragState {
  dragId: string | null;
  overId: string | null;
  position: DropPosition | null;
  start: (id: string) => void;
  over: (id: string, position: DropPosition) => void;
  end: () => void;
}

export const useDragStore = create<DragState>((set) => ({
  dragId: null,
  overId: null,
  position: null,
  start: (id) => set({ dragId: id }),
  over: (id, position) => set({ overId: id, position }),
  end: () => set({ dragId: null, overId: null, position: null }),
}));
