// The player's sandbox tables, kept on the phone. Outside React state (a small store), like the walkthrough's:
// a table changes with every card moved, and only the screens showing it need to hear about it.
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { deckIdsOn } from './deckFile';
import { repointTable } from './deckMatch';
import { withoutDeck } from './groups';
import type { Arrangement, DeckGroup, Placed } from './groups';
import { newId } from './id';
import { previousOf, setPrevious, tableSlot } from './previousVersions';
import { newSandbox, upgradeTable } from './sandbox';
import type { SandboxTable } from './sandbox';
import { loadSandboxes, loadTableGroups, saveSandboxes, saveTableGroups } from './storage';
import type { TableGroups } from './storage';

/** Changes are written to the phone this long after the last one (and straight away if the app is left). */
const SAVE_DELAY_MS = 400;

let tables: SandboxTable[] | null = null;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// As they were saved, brought up to date (see upgradeTable).
const all = () => (tables ??= loadSandboxes().map(upgradeTable));
const flush = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (tables) saveSandboxes(tables);
};
const set = (next: SandboxTable[]) => {
  tables = next;
  listeners.forEach((l) => l());
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, SAVE_DELAY_MS);
};
AppState.addEventListener('change', (s) => s !== 'active' && flush());

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Every sandbox table, newest first, as they are now (outside React). */
export const sandboxes = () => all();

/** Every sandbox table, newest first. Redraws when any changes. */
export const useSandboxes = () => useSyncExternalStore(subscribe, all);

/** One table, or undefined if it's gone. Redraws when it changes. */
export const useSandbox = (id: string) => useSyncExternalStore(subscribe, () => all().find((t) => t.id === id));

export function createSandbox(name: string): SandboxTable {
  const table = newSandbox(newId(), name, Date.now());
  set([table, ...all()]);
  return table;
}

/** A new table made from an empty one (e.g. with a ready-made layout on it), added to the top. */
export function createSandboxWith(name: string, lay: (empty: SandboxTable) => SandboxTable): SandboxTable {
  const table = lay(newSandbox(newId(), name, Date.now()));
  set([table, ...all()]);
  return table;
}

/** A copy of a table, cards, hands, camera and all, just after it (named as a copy). */
export function duplicateSandbox(id: string): SandboxTable | undefined {
  const tables = all();
  const at = tables.findIndex((t) => t.id === id);
  if (at < 0) return undefined;
  const now = Date.now();
  // A copy is a table of its own, not the one it was copied from (see SandboxTable.origin).
  const { origin: _from, ...source } = tables[at];
  const copy = { ...source, id: newId(), name: `${tables[at].name} Copy`, createdAt: now, updatedAt: now };
  set([...tables.slice(0, at + 1), copy, ...tables.slice(at + 1)]);
  // In the same group as the one copied.
  const g = allGrouping();
  if (g.groupOf[id]) setGrouping({ ...g, groupOf: { ...g.groupOf, [copy.id]: g.groupOf[id] } });
  return copy;
}

/** Saves a changed table. */
export function updateSandbox(table: SandboxTable) {
  set(all().map((t) => (t.id === table.id ? { ...table, updatedAt: Date.now() } : t)));
}

/** Moves a table to another place in the list: `to` is its index once moved. */
export function moveSandbox(id: string, to: number) {
  const rest = all().filter((t) => t.id !== id);
  const table = all().find((t) => t.id === id);
  if (table) set([...rest.slice(0, to), table, ...rest.slice(to)]);
}

export function deleteSandbox(id: string) {
  if (previousOf(tableSlot(id))) setPrevious(tableSlot(id), undefined);
  // Any group lying just above it stays where it was; it leaves its group.
  const g = allGrouping();
  if (g.groupOf[id] || g.groups.some((x) => x.before === id)) {
    const { [id]: _gone, ...groupOf } = g.groupOf;
    setGrouping({ groups: withoutDeck(g.groups, placedTables(all(), g), id), groupOf });
  }
  set(all().filter((t) => t.id !== id));
}

/**
 * Replaces a table with a newer version of it (from a file): its place and id kept, the rest as given. The table
 * as it was is kept to put back (see previousVersions).
 */
export function replaceSandbox(id: string, laid: Omit<SandboxTable, 'id' | 'createdAt' | 'updatedAt'>) {
  const old = all().find((t) => t.id === id);
  if (!old) return;
  const now = Date.now();
  setPrevious(tableSlot(id), { at: now, table: old });
  set(all().map((t) => (t.id === id ? { ...laid, id, createdAt: old.createdAt, updatedAt: now } : t)));
}

/** Puts back a table's previous version: the two swap, so it can be put back again. */
export function restoreSandbox(id: string) {
  const cur = all().find((t) => t.id === id);
  const prev = previousOf(tableSlot(id))?.table;
  if (!cur || !prev) return;
  const now = Date.now();
  setPrevious(tableSlot(id), { at: now, table: cur });
  set(all().map((t) => (t.id === id ? { ...prev, id, updatedAt: now } : t)));
}

/** Undoes a replacing just made: the previous version back, and none kept. */
export function undoReplaceSandbox(id: string) {
  const prev = previousOf(tableSlot(id))?.table;
  if (!prev) return;
  setPrevious(tableSlot(id), undefined);
  set(all().map((t) => (t.id === id ? { ...prev, id } : t)));
}

// ---- Table groups on the home screen ----
// Named groups of tables, as decks have (see lib/groups.ts): the groups, in order, and which group each table is in.
// Kept apart from the tables, so a table replaced from a file or put back keeps its group.

let grouping: TableGroups | null = null;
const groupListeners = new Set<() => void>();
const allGrouping = () => (grouping ??= loadTableGroups());
const setGrouping = (next: TableGroups) => {
  grouping = next;
  saveTableGroups(next);
  groupListeners.forEach((l) => l());
};
const subscribeGrouping = (l: () => void) => {
  groupListeners.add(l);
  return () => groupListeners.delete(l);
};

/** The table groups, and which group each table is in. Redraws when they change. */
export const useTableGroups = () => useSyncExternalStore(subscribeGrouping, allGrouping);

/** The tables with the group each is in, for lib/groups' rows. */
export const placedTables = (list: SandboxTable[], g: TableGroups): Placed[] =>
  list.map((t) => ({ id: t.id, groupId: g.groupOf[t.id] }));

export function createTableGroup(name: string): DeckGroup {
  const group: DeckGroup = { id: newId(), name };
  setGrouping({ ...allGrouping(), groups: [...allGrouping().groups, group] });
  return group;
}

export function renameTableGroup(id: string, name: string) {
  const g = allGrouping();
  setGrouping({ ...g, groups: g.groups.map((x) => (x.id === id ? { ...x, name } : x)) });
}

export function toggleTableGroup(id: string) {
  const g = allGrouping();
  setGrouping({ ...g, groups: g.groups.map((x) => (x.id === id ? { ...x, collapsed: !x.collapsed } : x)) });
}

/** Deletes a group: its tables stay, out of any group (unless `withTables`, when they go too). */
export function deleteTableGroup(id: string, withTables = false) {
  const g = allGrouping();
  const inIt = Object.keys(g.groupOf).filter((t) => g.groupOf[t] === id);
  if (withTables) for (const t of inIt) deleteSandbox(t);
  const groupOf = { ...allGrouping().groupOf };
  for (const t of inIt) delete groupOf[t];
  setGrouping({ groups: allGrouping().groups.filter((x) => x.id !== id), groupOf });
}

/** The tables' order, groups and where each group lies, as a drag on the home screen left them. */
export function arrangeTables(next: Arrangement) {
  const byId = new Map(all().map((t) => [t.id, t]));
  const ordered = next.order.flatMap((id) => byId.get(id) ?? []);
  set([...ordered, ...all().filter((t) => !next.order.includes(t.id))]);
  const groupOf: Record<string, string> = {};
  for (const [t, gid] of Object.entries(next.groupOf)) if (gid) groupOf[t] = gid;
  setGrouping({ groups: next.groups, groupOf });
}

/** Every table's cards from one deck pointed at another's (merging decks: see `repointTable`). */
export function repointSandboxes(fromDeck: string, toDeck: string, cards: Map<string, string>) {
  set(all().map((t) => (deckIdsOn(t).has(fromDeck) ? repointTable(t, fromDeck, toDeck, cards) : t)));
}
