// Undo history kept for the last few tables opened (while the app's open), so going back to one, or to the home
// screen and back, can still undo what was done there. The newest table's kept; the oldest beyond the limit goes.

/** How many tables' undo history is kept. */
export const UNDO_TABLES = 3;

/** A table's changes, latest last: those to undo, and those undone, to make again. */
export interface UndoHistory<T> {
  history: T[];
  future: T[];
}

/** The tables' histories, the most recently kept last. */
const kept = new Map<string, UndoHistory<unknown>>();

/** A table's history, as it was last kept (none, if it's not one of the last few). */
export function undoHistoryFor<T>(id: string): UndoHistory<T> {
  return (kept.get(id) as UndoHistory<T> | undefined) ?? { history: [], future: [] };
}

/** Keeps a table's history (as the most recent), letting go of the oldest beyond UNDO_TABLES. */
export function keepUndoHistory<T>(id: string, undo: UndoHistory<T>) {
  kept.delete(id);
  kept.set(id, undo as UndoHistory<unknown>);
  while (kept.size > UNDO_TABLES) kept.delete(kept.keys().next().value!);
}

/** A table's history let go (e.g. the table's deleted). */
export function forgetUndoHistory(id: string) {
  kept.delete(id);
}
