import assert from 'node:assert/strict';
import { test } from 'node:test';

import { drawPoly, polyModel, restingPolyTurn } from './polyhedra.ts';
import type { Vec } from './cube3d.ts';

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const KINDS = [
  { sides: 4, faces: 4, corners: 3 },
  { sides: 8, faces: 8, corners: 3 },
  { sides: 10, faces: 10, corners: 4 },
  { sides: 12, faces: 12, corners: 5 },
  { sides: 20, faces: 20, corners: 3 },
];

test('each die is a closed solid of flat faces, each facing out', () => {
  for (const { sides, faces, corners } of KINDS) {
    const m = polyModel(sides);
    assert.equal(m.faces.length, faces, `d${sides}`);
    for (const f of m.faces) {
      assert.equal(f.verts.length, corners, `d${sides}`);
      // Flat: every corner as far along its facing as its middle.
      for (const i of f.verts) assert.ok(Math.abs(dot(m.vertices[i], f.n) - dot(f.c, f.n)) < 1e-6, `d${sides} face flat`);
      assert.ok(dot(f.n, f.c) > 0, `d${sides} faces out`);
      // Its frame: across × down is the way it faces.
      const cr: Vec = [f.u[1] * f.v[2] - f.u[2] * f.v[1], f.u[2] * f.v[0] - f.u[0] * f.v[2], f.u[0] * f.v[1] - f.u[1] * f.v[0]];
      assert.ok(dot(cr, f.n) > 0.999, `d${sides} frame`);
    }
  }
});

test('numbered as real dice are: every number once, opposite faces adding to sides + 1', () => {
  for (const { sides } of KINDS.filter((k) => k.sides !== 4)) {
    const m = polyModel(sides);
    const values = m.faces.map((f) => f.labels[0].value).sort((a, b) => a - b);
    assert.deepEqual(values, Array.from({ length: sides }, (_, i) => i + 1), `d${sides}`);
    for (const f of m.faces) {
      const opposite = m.faces.find((g) => dot(g.n, f.n) < -0.999)!;
      assert.equal(f.labels[0].value + opposite.labels[0].value, sides + 1, `d${sides}`);
    }
  }
  // A d4: each face has the numbers of its three corners, the one it faces away from missing.
  const d4 = polyModel(4);
  d4.faces.forEach((f) => assert.equal(f.labels.length, 3));
  assert.deepEqual([...new Set(d4.faces.flatMap((f) => f.labels.map((l) => l.value)))].sort(), [1, 2, 3, 4]);
});

test('lying showing a number, that face is up (a d4: that corner); turned on the table, it stays up', () => {
  for (const { sides } of KINDS) {
    const m = polyModel(sides);
    for (let v = 1; v <= sides; v++) {
      for (const deg of [0, 137]) {
        const turn = restingPolyTurn(m, v, deg);
        const up = (p: Vec): number => turn[2][0] * p[0] + turn[2][1] * p[1] + turn[2][2] * p[2];
        if (sides === 4) {
          const top = m.vertices.reduce((a, b, i) => (up(b) > up(m.vertices[a]) ? i : a), 0);
          assert.equal(top + 1, v, `d4 shows ${v}`);
        } else {
          const top = m.faces.reduce((a, b) => (up(b.n) > up(a.n) ? b : a));
          assert.equal(top.labels[0].value, v, `d${sides} shows ${v}`);
          assert.ok(up(top.n) > 0.999);
        }
      }
    }
  }
});

test('drawn lying flat, a die shows its top and some sides, all inside its box with room for its shadow', () => {
  for (const { sides } of KINDS) {
    const m = polyModel(sides);
    const { slots, outline } = drawPoly(m, restingPolyTurn(m, 1, 0));
    assert.equal(slots.length, m.faces.length);
    assert.ok(slots.some((s) => s.seen) && slots.some((s) => !s.seen), `d${sides}`);
    for (const [x, y] of outline) assert.ok(x > -0.15 && x < 1.15 && y > -0.15 && y < 1.15, `d${sides} in its box`);
  }
});
