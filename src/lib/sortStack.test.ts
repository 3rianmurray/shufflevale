/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { newSandbox, sortStack } from './sandbox.ts';
import type { SandboxCard, SandboxTable } from './sandbox.ts';

const card = (iid: string, cardId: string, faceUp = false): SandboxCard => ({ iid, deckId: 'd', cardId, faceUp });
const table = (cards: SandboxCard[]): SandboxTable => ({ ...newSandbox('t', 'T', 0), stacks: [{ id: 's', x: 0, y: 0, angle: 0, cards }] });
// A deck of four, in this order.
const order = ['a', 'b', 'c', 'd'];
const rank = (c: SandboxCard) => {
  const i = order.indexOf(c.cardId);
  return i === -1 ? undefined : i;
};
const ids = (t: SandboxTable) => t.stacks[0].cards.map((c) => c.iid);

test('a stack is put back in order with the deck’s first card on top (the stack’s last)', () => {
  const t = table([card('1', 'c'), card('2', 'a'), card('3', 'd'), card('4', 'b')]);
  // Bottom to top: d, c, b, a.
  assert.deepEqual(ids(sortStack(t, 's', rank)), ['3', '1', '4', '2']);
});

test('copies of a card stay together in the order they were, and faces are kept', () => {
  const t = table([card('1', 'b'), card('2', 'a', true), card('3', 'b'), card('4', 'a')]);
  const sorted = sortStack(t, 's', rank).stacks[0].cards;
  assert.deepEqual(sorted.map((c) => c.iid), ['1', '3', '2', '4']);
  assert.equal(sorted.find((c) => c.iid === '2')?.faceUp, true);
});

test('a card no longer in its deck goes to the bottom; sorting twice changes nothing', () => {
  const t = table([card('1', 'a'), card('x', 'gone'), card('2', 'c')]);
  const once = sortStack(t, 's', rank);
  assert.deepEqual(ids(once), ['x', '2', '1']);
  assert.deepEqual(ids(sortStack(once, 's', rank)), ids(once));
});

test('other stacks are left alone', () => {
  const t = table([card('1', 'b'), card('2', 'a')]);
  const two: SandboxTable = { ...t, stacks: [...t.stacks, { id: 'o', x: 9, y: 9, angle: 0, cards: [card('9', 'z'), card('8', 'y')] }] };
  assert.deepEqual(sortStack(two, 's', rank).stacks[1], two.stacks[1]);
});
