/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { overlaps, placeWindow, unionOf } from './windowSpot.ts';

const screen = { w: 1000, h: 800 };
const insets = { top: 20, bottom: 20 };
const size = { w: 300, h: 200 };

test('a fresh window opens directly above the finger, centered on it', () => {
  const p = placeWindow({ screen, insets, size, at: { x: 500, y: 600 } });
  assert.deepEqual(p, { x: 350, y: 384 });
});

test('with no room above the finger it opens below it; and it stays on screen', () => {
  const low = placeWindow({ screen, insets, size, at: { x: 500, y: 100 } });
  assert.equal(low.y, 116);
  const corner = placeWindow({ screen, insets, size, at: { x: 990, y: 790 } });
  assert.equal(corner.x, 1000 - 300 - 12);
  assert.ok(corner.y + size.h <= 800 - 20);
});

test('a follow-up window opens where the last one was', () => {
  const p = placeWindow({ screen, insets, size, from: { x: 600, y: 300, w: 340, h: 260 } });
  assert.deepEqual(p, { x: 600, y: 300 });
});

test('a follow-up keeps off the thing it is for, at the nearest side that is clear', () => {
  const target = { x: 580, y: 280, w: 120, h: 160 };
  const p = placeWindow({ screen, insets, size, from: { x: 600, y: 300, w: 340, h: 260 }, avoid: target });
  assert.ok(!overlaps({ ...p, ...size }, target));
  // Nothing in the way: left as it was.
  const clear = placeWindow({ screen, insets, size, from: { x: 600, y: 300, w: 340, h: 260 }, avoid: { x: 20, y: 20, w: 50, h: 50 } });
  assert.deepEqual(clear, { x: 600, y: 300 });
});

test('when nowhere is clear, a follow-up still opens (over it, to be moved)', () => {
  const everything = { x: 0, y: 0, w: 1000, h: 800 };
  const p = placeWindow({ screen, insets, size, from: { x: 100, y: 100, w: 300, h: 200 }, avoid: everything });
  assert.deepEqual(p, { x: 100, y: 100 });
});

test('rectangles overlap or not, and a set is boxed', () => {
  assert.ok(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }));
  assert.ok(!overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 40, y: 0, w: 10, h: 10 }));
  assert.deepEqual(unionOf([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 10, h: 10 }]), { x: 0, y: 0, w: 30, h: 15 });
  assert.equal(unionOf([]), undefined);
});
