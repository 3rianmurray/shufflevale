import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TOKEN_SHAPES, tokenOutline, tokenShapeOf } from './tokenShapes.ts';

test('every token shape fits its box, centered, and fills it one way at least', () => {
  for (const { shape } of TOKEN_SHAPES) {
    const pts = tokenOutline(shape);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    for (const v of [...xs, ...ys]) assert.ok(v >= -1e-9 && v <= 1 + 1e-9, `${shape} stays in its box`);
    const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    assert.ok(Math.abs(left + right - 1) < 0.02 && Math.abs(top + bottom - 1) < 0.02, `${shape} is centered`);
    assert.ok(right - left > 0.75 && bottom - top > 0.75, `${shape} is as big as fits`);
    assert.ok(right - left > 0.97 || bottom - top > 0.97, `${shape} reaches the box's edges`);
  }
});

test("a token from before there were shapes keeps its own: square if it was, round otherwise", () => {
  assert.equal(tokenShapeOf({}), 'circle');
  assert.equal(tokenShapeOf({ square: true }), 'square');
  assert.equal(tokenShapeOf({ square: true, tokenShape: 'star' }), 'star');
});
