// A deck's or table's version from before it was updated or replaced from a file, or before another deck was merged
// into it: one each, kept to put back (Restore previous version, or Undo right after), until the next time. A small
// store outside React, saved as it changes (it rarely does).
import { useSyncExternalStore } from 'react';

import type { SandboxTable } from './sandbox';
import { loadPrevious, savePrevious } from './storage';
import type { Deck } from './types';

export interface PreviousVersion {
  /** When it was put aside. */
  at: number;
  /** The deck as it was (its pictures are kept in its folder till this goes). */
  deck?: Deck;
  /** A deck merged into this one, to bring back (its folder is kept till this goes). */
  merged?: Deck;
  /** The table as it was. */
  table?: SandboxTable;
}

let all: Record<string, PreviousVersion> | null = null;
const listeners = new Set<() => void>();
const get = () => (all ??= loadPrevious<PreviousVersion>());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Where a table's is kept (a deck's is under its own id). */
export const tableSlot = (id: string) => `table:${id}`;

/** The version kept for a deck (its id) or a table (see `tableSlot`), if any. */
export const previousOf = (slot: string): PreviousVersion | undefined => get()[slot];

/** Keeps a version for a deck or table (or, with none, lets it go). Whoever calls looks after its pictures. */
export function setPrevious(slot: string, version: PreviousVersion | undefined) {
  const next = { ...get() };
  if (version) next[slot] = version;
  else delete next[slot];
  all = next;
  savePrevious(next);
  listeners.forEach((l) => l());
}

/** Every version kept (to tell which pictures are still needed). */
export const allPrevious = () => Object.values(get());

/** The version kept for a deck or table, redrawing when it changes. */
export const usePrevious = (slot: string) => useSyncExternalStore(subscribe, () => get()[slot]);

/** When a kept version is from: when it was last changed, before it was put aside. */
export const versionDate = (v: PreviousVersion) => (v.deck ?? v.merged ?? v.table)?.updatedAt ?? v.at;
