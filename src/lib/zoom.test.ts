/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cameraAngle, cameraLookingAt, cameraZoom, doubleTapZoom, sameView, toScreen, zoomInOn, zoomOnto } from './sandbox.ts';
import type { Camera } from './sandbox.ts';

const space = { x: 0, y: 100, w: 800, h: 600 };
const mid = { x: 400, y: 400 };
const upright: Camera = { a: 0.5, b: 0, tx: 0, ty: 0 };
// Turned a quarter, at zoom 0.5.
const turned: Camera = { a: 0, b: 0.5, tx: 0, ty: 0 };

const near = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6;

test('the camera looks at a table point from the middle of the room, turned as it was', () => {
  const c = cameraLookingAt(turned, { x: 1200, y: 900 }, 2, space);
  assert.ok(near(toScreen(c, 1200, 900), mid));
  assert.equal(Math.round(cameraZoom(c) * 1000) / 1000, 2);
  assert.equal(Math.round(cameraAngle(c)), 90);
});

test('a double tap on the table zooms in on that spot: close enough to see, or twice as close', () => {
  const c = zoomInOn(upright, { x: 1000, y: 700 }, space);
  assert.ok(near(toScreen(c, 1000, 700), mid));
  assert.equal(cameraZoom(c), 1.25);
  assert.equal(cameraZoom(zoomInOn({ a: 1, b: 0, tx: 0, ty: 0 }, { x: 0, y: 0 }, space)), 2);
  // Never past the most.
  assert.equal(cameraZoom(zoomInOn({ a: 2, b: 0, tx: 0, ty: 0 }, { x: 0, y: 0 }, space)), 2.4);
});

test('a double-tapped thing fills most of the room, in the middle', () => {
  const zone = { x: 500, y: 500, w: 400, h: 300, angle: 0 };
  const c = zoomOnto(upright, zone, space);
  assert.ok(near(toScreen(c, 500, 500), mid));
  // 0.8 of the room: 600 × 0.8 / 300 tall (the tighter way).
  assert.equal(Math.round(cameraZoom(c) * 100) / 100, 1.6);
  // A small card can't take the camera past its limit.
  assert.equal(cameraZoom(zoomOnto(upright, { x: 0, y: 0, w: 20, h: 28, angle: 0 }, space)), 3);
});

test('two cameras showing much the same are the same view', () => {
  const c = zoomOnto(upright, { x: 500, y: 500, w: 400, h: 300, angle: 0 }, space);
  assert.ok(sameView(c, { ...c, tx: c.tx + 5 }));
  assert.ok(!sameView(c, upright));
});

test('a double tap zooms in once, and the next one zooms out (never in further)', () => {
  const fit: Camera = { a: 0.3, b: 0, tx: 40, ty: 150 };
  // Fitted: the first double tap goes in...
  const first = zoomInOn(fit, { x: 1000, y: 700 }, space);
  assert.equal(doubleTapZoom(fit, fit, first, null), 'in');
  // ...and from there, tapped again (anywhere, a little panned or not), it goes out.
  assert.equal(doubleTapZoom(first, fit, zoomInOn(first, { x: 1000, y: 700 }, space), first), 'out');
  assert.equal(doubleTapZoom({ ...first, tx: first.tx + 300 }, fit, zoomInOn(first, { x: 0, y: 0 }, space), first), 'out');
});

test('a thing double-tapped is zoomed onto once, and the next double tap zooms out', () => {
  const fit: Camera = { a: 0.3, b: 0, tx: 40, ty: 150 };
  // A big zone, so the zoom onto it is not close up.
  const zone = { x: 1500, y: 900, w: 2000, h: 1200, angle: 0 };
  const onto = zoomOnto(fit, zone, space);
  assert.ok(cameraZoom(onto) < 1);
  assert.equal(doubleTapZoom(fit, fit, onto, null), 'in');
  assert.equal(doubleTapZoom(onto, fit, zoomOnto(onto, zone, space), onto), 'out');
});

test('a small table that fits only zoomed in still goes in once, then out', () => {
  const fit: Camera = { a: 1.5, b: 0, tx: 0, ty: 0 };
  const first = zoomInOn(fit, { x: 100, y: 100 }, space);
  assert.equal(doubleTapZoom(fit, fit, first, null), 'in');
  assert.equal(doubleTapZoom(first, fit, first, first), 'out');
});
