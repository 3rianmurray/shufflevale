/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildRows, dropDeck, dropGroup, withoutDeck } from './groups.ts';
import type { DeckGroup, Placed } from './groups.ts';

const groups: DeckGroup[] = [
  { id: 'zombicide', name: 'Zombicide' },
  { id: 'other', name: 'Other' },
];
const decks: Placed[] = [
  { id: 'loose' },
  { id: 'spawn', groupId: 'zombicide' },
  { id: 'items', groupId: 'zombicide' },
  { id: 'misc', groupId: 'other' },
];
const ids = (rows: { kind: string; id: string }[]) => rows.map((r) => (r.kind === 'group' ? `[${r.id}]` : r.kind === 'end' ? '/' : r.id));
/** The rows a drop leaves, read back as the list would show them. */
const after = (next: { order: string[]; groupOf: Record<string, string | undefined>; groups: DeckGroup[] }) =>
  ids(buildRows(next.order.map((id) => ({ id, groupId: next.groupOf[id] })), next.groups));

test('rows list ungrouped decks first (for groups not yet placed), then each group with its decks and its end', () => {
  assert.deepEqual(ids(buildRows(decks, groups)), ['loose', '[zombicide]', 'spawn', 'items', '/', '[other]', 'misc', '/']);
});

test('collapsed groups show only their header and end', () => {
  const folded = [{ ...groups[0], collapsed: true }, groups[1]];
  assert.deepEqual(ids(buildRows(decks, folded)), ['loose', '[zombicide]', '/', '[other]', 'misc', '/']);
});

test('a group lies just above the ungrouped deck it was put above', () => {
  const two = [{ id: 'a' }, { id: 'b' }, ...decks.slice(1)];
  const placed = [{ ...groups[0], before: 'b' }, groups[1]];
  assert.deepEqual(ids(buildRows(two, placed)), ['a', '[zombicide]', 'spawn', 'items', '/', 'b', '[other]', 'misc', '/']);
  // A deck it was above that's since gone into a group: the next ungrouped deck after it.
  const filed = [{ id: 'a' }, { id: 'b', groupId: 'other' }, { id: 'c' }, ...decks.slice(1)];
  assert.deepEqual(ids(buildRows(filed, placed)), ['a', '[zombicide]', 'spawn', 'items', '/', 'c', '[other]', 'b', 'misc', '/']);
});

test('dropping a deck inside a group moves it into that group', () => {
  // Rows: loose, [zombicide], spawn, items, /, [other], misc, /. Drop "loose" just after [other].
  const { order, groupOf } = dropDeck(decks, groups, 'loose', 6);
  assert.deepEqual(order, ['spawn', 'items', 'loose', 'misc']);
  assert.equal(groupOf.loose, 'other');
  assert.equal(groupOf.spawn, 'zombicide');
});

test('dropping a deck outside every group takes it out of its group', () => {
  const { order, groupOf } = dropDeck(decks, groups, 'misc', 0);
  assert.deepEqual(order, ['misc', 'loose', 'spawn', 'items']);
  assert.equal(groupOf.misc, undefined);
});

test('a deck dropped below a group’s end lies after the group, out of it', () => {
  // Drop "loose" just after zombicide's end (row 5): between the two groups.
  const next = dropDeck(decks, groups, 'loose', 5);
  assert.equal(next.groupOf.loose, undefined);
  assert.deepEqual(after(next), ['[zombicide]', 'spawn', 'items', '/', 'loose', '[other]', 'misc', '/']);
});

test('reordering within a group keeps the group', () => {
  const { order, groupOf } = dropDeck(decks, groups, 'items', 2);
  assert.deepEqual(order, ['loose', 'items', 'spawn', 'misc']);
  assert.equal(groupOf.items, 'zombicide');
});

test('decks hidden in a collapsed group keep their place', () => {
  const folded = [{ ...groups[0], collapsed: true }, groups[1]];
  // Rows: loose, [zombicide], /, [other], misc, /. Drop "misc" just after [zombicide].
  const { order, groupOf } = dropDeck(decks, folded, 'misc', 2);
  assert.deepEqual(order, ['loose', 'spawn', 'items', 'misc']);
  assert.equal(groupOf.misc, 'zombicide');
  assert.equal(groupOf.spawn, 'zombicide');
});

test('dragging a header moves the whole group, anywhere among the decks', () => {
  // Drop [other] before [zombicide] (row 1).
  assert.deepEqual(after(dropGroup(decks, groups, 'other', 1)), ['loose', '[other]', 'misc', '/', '[zombicide]', 'spawn', 'items', '/']);
  // Drop [zombicide] at the very end.
  assert.deepEqual(after(dropGroup(decks, groups, 'zombicide', 8)), ['loose', '[other]', 'misc', '/', '[zombicide]', 'spawn', 'items', '/']);
  // Drop [other] above the ungrouped deck: groups aren't stuck at the bottom.
  assert.deepEqual(after(dropGroup(decks, groups, 'other', 0)), ['[other]', 'misc', '/', 'loose', '[zombicide]', 'spawn', 'items', '/']);
});

test('a group dropped inside another goes just after it', () => {
  // [other] dropped between spawn and items.
  assert.deepEqual(after(dropGroup(decks, groups, 'other', 3)), ['loose', '[zombicide]', 'spawn', 'items', '/', '[other]', 'misc', '/']);
});

test('a group above a deck that’s deleted stays where it was', () => {
  const two = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, ...decks.slice(1)];
  const placed = [{ ...groups[0], before: 'b' }, groups[1]];
  const kept = withoutDeck(placed, two, 'b');
  assert.equal(kept[0].before, 'c');
  assert.deepEqual(ids(buildRows(two.filter((d) => d.id !== 'b'), kept)).slice(0, 2), ['a', '[zombicide]']);
});
