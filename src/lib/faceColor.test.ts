import assert from 'node:assert/strict';
import { test } from 'node:test';

import { edgeColor } from './faceColor.ts';

/** A picture `size` square: `edge` round its border, `middle` inside it. */
function framed(size: number, border: number, edge: number[], middle: number[]) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const near = x < border || y < border || x >= size - border || y >= size - border;
      data.set([...(near ? edge : middle), 255], (y * size + x) * 4);
    }
  }
  return data;
}

test('a face’s color is its edge’s, not its middle’s', () => {
  // A blue border round a big red middle: the die's blue.
  assert.equal(edgeColor(framed(40, 5, [20, 40, 200], [220, 30, 30]), 40, 40, null), '#1428c8');
});

test('the commonest of the edge’s colors wins, not a mix of them', () => {
  // Mostly green round the edge, with a black corner: green, not a darker blend.
  const data = framed(40, 5, [40, 180, 60], [255, 255, 255]);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) data.set([0, 0, 0, 255], (y * 40 + x) * 4);
  assert.equal(edgeColor(data, 40, 40, null), '#28b43c');
});

test('only what’s inside the face’s shape counts', () => {
  // A triangle face (point up) on a picture whose top corners (outside it) are red, the rest yellow: yellow.
  const size = 40;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data.set([...(y < 14 && (x < 10 || x >= 30) ? [230, 20, 20] : [240, 210, 40]), 255], (y * size + x) * 4);
  const triangle: [number, number][] = [[0.5, 0], [1, 1], [0, 1]];
  assert.equal(edgeColor(data, size, size, triangle), '#f0d228');
});
