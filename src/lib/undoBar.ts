// The Undo bar: for a moment after an import updated or replaced something, or decks were merged, a bar at the bottom
// of the screen saying what changed, with Undo (see UndoBar). What to undo is kept as ids, so it's undone as things
// are by then.
import { useSyncExternalStore } from 'react';

export interface UndoChange {
  /** What changed, as the bar says it: "Updated “Monsters”". */
  label: string;
  /** Decks and tables the import added (they go). */
  addedDecks?: string[];
  addedTables?: string[];
  /** Decks it updated and tables it replaced (their previous versions come back). */
  updatedDecks?: string[];
  replacedTables?: string[];
  /** A deck another was merged into (that one comes back). */
  mergedInto?: string;
}

let current: (UndoChange & { key: number }) | null = null;
const listeners = new Set<() => void>();
const set = (next: typeof current) => {
  current = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Shows the bar for a change (in place of any showing). */
export const showUndo = (change: UndoChange) => set({ ...change, key: Date.now() });
/** Puts the bar away. */
export const hideUndo = () => set(null);
export const useUndoChange = () => useSyncExternalStore(subscribe, () => current);
