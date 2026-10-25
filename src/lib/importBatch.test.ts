/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { frontCount, frontsAfterRemoving, pairingNote, pairUp, swapSides } from './importBatch.ts';

const sides = (cards: { front: string; back?: string }[]) => cards.map((c) => (c.back ? `${c.front}/${c.back}` : c.front));

test('every picture is a card, until backs are paired', () => {
  assert.deepEqual(sides(pairUp(['a', 'b', 'c'], 'none')), ['a', 'b', 'c']);
});

test('scanned in turn: each front, then its back', () => {
  assert.deepEqual(sides(pairUp(['1f', '1b', '2f', '2b'], 'inTurn')), ['1f/1b', '2f/2b']);
  assert.deepEqual(pairUp(['1f', '1b', '2f', '2b'], 'inTurn')[1], { front: '2f', back: '2b', frontAt: 2, backAt: 3 });
});

test('all the fronts, then all the backs in the same order', () => {
  assert.deepEqual(sides(pairUp(['1f', '2f', '3f', '1b', '2b', '3b'], 'halves')), ['1f/1b', '2f/2b', '3f/3b']);
});

test('an odd picture over is a front with the deck’s back, and is pointed out', () => {
  assert.deepEqual(sides(pairUp(['1f', '1b', '2f'], 'inTurn')), ['1f/1b', '2f']);
  assert.deepEqual(sides(pairUp(['1f', '2f', '1b'], 'halves')), ['1f/1b', '2f']);
  assert.equal(frontCount(3, 'halves'), 2);
  assert.ok(pairingNote(3, 'inTurn'));
  assert.equal(pairingNote(4, 'inTurn'), null);
  assert.equal(pairingNote(3, 'none'), null);
});

test('taking out a stray scan pairs every card after it again', () => {
  // A front scanned twice: 2f, 2f, 2b, 3f, 3b pairs wrongly until the extra one goes.
  const scans = ['1f', '1b', '2f', '2f', '2b', '3f', '3b'];
  assert.deepEqual(sides(pairUp(scans, 'inTurn')), ['1f/1b', '2f/2f', '2b/3f', '3b']);
  assert.deepEqual(sides(pairUp(scans.filter((_, i) => i !== 3), 'inTurn')), ['1f/1b', '2f/2b', '3f/3b']);
});

test('a sheet of fronts and a sheet of backs pair by number, even when they don’t match', () => {
  // 3 fronts, 2 backs: the last front has the deck's back.
  assert.deepEqual(sides(pairUp(['1f', '2f', '3f', '1b', '2b'], 'halves', 3)), ['1f/1b', '2f/2b', '3f']);
  assert.match(pairingNote(5, 'halves', 3)!, /^1 card has no back/);
  // 2 fronts, 3 backs: the one over isn't used.
  assert.deepEqual(sides(pairUp(['1f', '2f', '1b', '2b', '3b'], 'halves', 2)), ['1f/1b', '2f/2b']);
  assert.match(pairingNote(5, 'halves', 2)!, /^1 more back/);
  assert.equal(pairingNote(4, 'halves', 2), null);
  // Taking out a front leaves one fewer; taking out a back, the same.
  assert.equal(frontsAfterRemoving(3, 1), 2);
  assert.equal(frontsAfterRemoving(3, 4), 3);
  assert.equal(frontsAfterRemoving(undefined, 0), undefined);
  assert.deepEqual(swapSides(['1f', '2f', '1b', '2b'], 'halves', 1, 2), ['1f', '2b', '1b', '2f']);
});

test('a card scanned back first has its sides swapped', () => {
  assert.deepEqual(sides(pairUp(swapSides(['1b', '1f', '2f', '2b'], 'inTurn', 0), 'inTurn')), ['1f/1b', '2f/2b']);
  assert.deepEqual(sides(pairUp(swapSides(['1f', '2b', '1b', '2f'], 'halves', 1), 'halves')), ['1f/1b', '2f/2b']);
  // Nothing to swap with.
  assert.deepEqual(swapSides(['a'], 'inTurn', 0), ['a']);
});
