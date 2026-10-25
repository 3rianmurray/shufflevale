/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { inTileRows, tileRows } from './tileRows.ts';

test('buttons go up to four to a row, the rows even, the fuller on top', () => {
  assert.deepEqual(tileRows(0), []);
  assert.deepEqual(tileRows(1), [1]);
  assert.deepEqual(tileRows(3), [3]);
  assert.deepEqual(tileRows(4), [4]);
  assert.deepEqual(tileRows(5), [3, 2]);
  assert.deepEqual(tileRows(6), [3, 3]);
  assert.deepEqual(tileRows(7), [4, 3]);
  assert.deepEqual(tileRows(8), [4, 4]);
  assert.deepEqual(tileRows(9), [3, 3, 3]);
  assert.deepEqual(tileRows(10), [4, 3, 3]);
});

test('never a button alone on a row (when there are two or more)', () => {
  for (let n = 2; n <= 20; n++) assert.ok(tileRows(n).every((k) => k >= 2), `${n}: ${tileRows(n)}`);
});

test('the things themselves, in those rows, in order', () => {
  assert.deepEqual(inTileRows(['a', 'b', 'c', 'd', 'e']), [['a', 'b', 'c'], ['d', 'e']]);
});
