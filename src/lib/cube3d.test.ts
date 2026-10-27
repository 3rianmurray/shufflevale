import assert from 'node:assert/strict';
import { test } from 'node:test';

import { drawCube, restingTurn, tumbleFor, tumblingTurn } from './cube3d.ts';
import type { Pt } from './cube3d.ts';

const near = (a: Pt[], b: Pt[]) => a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i][0]) < 1e-9 && Math.abs(p[1] - b[i][1]) < 1e-9);
const has = (list: Pt[], p: Pt) => list.some((q) => Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9);

test('lying flat, a d6 is drawn just as the flat drawing was: its face up, and its right and lower sides', () => {
  const { sides, outline } = drawCube(restingTurn(5, 0));
  // Three sides: the 5 up, and two of its neighbors (never the 2, opposite it).
  assert.equal(sides.length, 3);
  assert.ok(sides.some((s) => s.value === 5) && !sides.some((s) => s.value === 2));
  const top = sides.find((s) => s.value === 5)!;
  assert.ok(near(top.corners, [[0.02, 0.02], [0.82, 0.02], [0.82, 0.82], [0.02, 0.82]]));
  // Its square maps straight onto it, the right way round.
  assert.ok(near([top.origin, top.across, top.down], [[0.02, 0.02], [0.8, 0], [0, 0.8]]));
  // The outline of the old drawing: the top face's top and left edges, then round the far side.
  assert.equal(outline.length, 6);
  for (const p of [[0.02, 0.02], [0.82, 0.02], [0.96, 0.16], [0.96, 0.96], [0.16, 0.96], [0.02, 0.82]] as Pt[]) assert.ok(has(outline, p));
  // Lit as it was: its top a touch light, the side to the right darker, the one below darker still.
  const right = sides.find((s) => s.light < 0 && s.corners.every((c) => c[0] >= 0.82 - 1e-9))!;
  assert.ok(Math.abs(top.light - 0.04) < 0.01 && Math.abs(right.light + 0.3) < 0.01);
  assert.ok(sides.every((s) => s === top || s === right || s.light < right.light));
});

test('every face can lie up, and opposite faces add up to 7', () => {
  for (let v = 1; v <= 6; v++) {
    const { sides } = drawCube(restingTurn(v, 0));
    const up = sides.reduce((a, b) => (a.light > b.light ? a : b));
    assert.equal(up.value, v);
    assert.ok(!sides.some((s) => s.value === 7 - v));
  }
});

test('turned on the table, its face up turns with it; the sides shown are still the lower right ones', () => {
  const { sides } = drawCube(restingTurn(1, 90));
  const top = sides.find((s) => s.value === 1)!;
  // A quarter turn clockwise: its square's across now runs down the screen.
  assert.ok(Math.abs(top.across[0]) < 1e-9 && top.across[1] > 0);
  assert.equal(sides.length, 3);
});

test('a tumble ends just as it lands, and is turned another way before that', () => {
  const rest = restingTurn(4, 30);
  const spin = tumbleFor(7);
  assert.deepEqual(drawCube(tumblingTurn(rest, spin, 1)), drawCube(rest));
  const midway = drawCube(tumblingTurn(rest, spin, 0.5));
  assert.notDeepEqual(midway.outline, drawCube(rest).outline);
  // Still a cube, seen from one side: never more than three faces at once.
  assert.ok(midway.sides.length >= 1 && midway.sides.length <= 3);
});
