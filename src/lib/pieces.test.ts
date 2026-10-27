import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addPiece, movePiece, newPiece, pieceAt, piecesInShape, removePiece, rollDie, setPiece, newSandbox, PIECE_SIZE, THROW_MAX, THROW_MIN, throwDice, separateDice, movePieces, gridDice, DICE_SPACE, toggleTimer, parseTimerText, timerText, zoneAt, spotAt, zoneGripAt, resizeZone, ZONE_MIN, putInBag, drawFromBag, emptyBag, tableCardCount, prune, bagItems, itemKey, reorderBag, shuffleBag, allAlike, bagTakes, endSupply, raiseArt, artLevel, layerArt, keepArtLevels, copyItems, pasteItems, clipCards, fitZone, trackSize, trackSpaceAt, pieceSizeOf, playground, keepCards, upgradeTable, fitSpots, settleStacks, zoneCellAt, labelAt, addScore, scoreColumns, scoreSize, scoreSpotAt, setScorePlayers, setScore, SCORE_PAD, SCORE_HEAD, SCORE_ROW, scoreWindow, resizeScore, faceCount, withFace } from './sandbox.ts';
import type { TablePiece } from './sandbox.ts';

test('a six-sided die has six faces for art and a coin two; other dice and pieces none', () => {
  const at = { x: 0, y: 0, value: 1 };
  assert.equal(faceCount({ kind: 'die', sides: 6 }), 6);
  assert.equal(faceCount({ kind: 'die' }), 6);
  assert.equal(faceCount({ kind: 'die', sides: 20 }), 0);
  assert.equal(faceCount({ kind: 'coin' }), 2);
  assert.equal(faceCount({ kind: 'counter' }), 0);
  // A face given art, and put back: none at all once every face is standard again.
  const die: TablePiece = { id: 'd', kind: 'die', sides: 6, ...at };
  const one = withFace(die, 2, 'decks/tokens/three.png');
  assert.deepEqual(one, [null, null, 'decks/tokens/three.png', null, null, null]);
  assert.equal(withFace({ ...die, faces: one }, 2, null), undefined);
  assert.deepEqual(withFace({ id: 'c', kind: 'coin', ...at }, 1, 'decks/tokens/tails.png'), [null, 'decks/tokens/tails.png']);
});

const table = () => newSandbox('t', 'Test', 0);

test('a counter starts at 0 and a die on its highest face, at a whole table point', () => {
  assert.deepEqual(newPiece('counter', 'c', { x: 10.4, y: 20.6 }), { id: 'c', kind: 'counter', x: 10, y: 21, value: 0 });
  assert.deepEqual(newPiece('die', 'd', { x: 0, y: 0 }, 20), { id: 'd', kind: 'die', x: 0, y: 0, value: 20, sides: 20 });
});

test('a counter has − on its left end, + on its right, and its number between', () => {
  const t = addPiece(table(), newPiece('counter', 'c', { x: 500, y: 500 }));
  const half = PIECE_SIZE.counter.w / 2;
  assert.equal(pieceAt(t, 500 - half + 5, 500)?.part, 'minus');
  assert.equal(pieceAt(t, 500 + half - 5, 500)?.part, 'plus');
  assert.equal(pieceAt(t, 500, 500)?.part, 'body');
  assert.equal(pieceAt(t, 500 + half + 5, 500), null);
});

test('the topmost piece is the one found, and moving one brings it to the top', () => {
  let t = addPiece(addPiece(table(), newPiece('die', 'a', { x: 100, y: 100 })), newPiece('die', 'b', { x: 110, y: 100 }));
  assert.equal(pieceAt(t, 105, 100)?.piece.id, 'b');
  t = movePiece(t, 'a', { x: 104, y: 100 });
  assert.equal(pieceAt(t, 105, 100)?.piece.id, 'a');
  assert.deepEqual(t.pieces?.map((p) => p.id), ['b', 'a']);
});

test('pieces change and come off the table', () => {
  let t = addPiece(table(), newPiece('counter', 'c', { x: 0, y: 0 }));
  t = setPiece(t, 'c', { value: 20, label: 'Life' });
  assert.equal(t.pieces?.[0].value, 20);
  assert.equal(t.pieces?.[0].label, 'Life');
  assert.deepEqual(removePiece(t, 'c').pieces, []);
});

test('a die rolls every face, and nothing outside them', () => {
  assert.equal(rollDie(6, () => 0), 1);
  assert.equal(rollDie(6, () => 0.999999), 6);
  assert.equal(rollDie(20, () => 0.5), 11);
});
test('thrown dice each land on a new face a little way off, and only the dice asked for move', () => {
  let t = addPiece(table(), newPiece('die', 'a', { x: 1000, y: 1000 }));
  t = addPiece(t, newPiece('die', 'b', { x: 1200, y: 1000 }));
  t = addPiece(t, newPiece('counter', 'c', { x: 1400, y: 1000 }));
  const { table: thrown, from } = throwDice(t, ['a', 'c'], () => 0.25);
  assert.deepEqual(Object.keys(from), ['a']);
  const a = thrown.pieces!.find((p) => p.id === 'a')!;
  const moved = Math.hypot(from.a.dx, from.a.dy);
  assert.ok(moved >= THROW_MIN - 1 && moved <= THROW_MAX + 1, `moved ${moved}`);
  assert.equal(a.x - from.a.dx, 1000);
  assert.equal(a.value, rollDie(6, () => 0.25));
  assert.deepEqual(thrown.pieces!.find((p) => p.id === 'b'), t.pieces![1]);
});

test('a lasso catches dice it goes round or over, and not counters', () => {
  let t = addPiece(table(), newPiece('die', 'in', { x: 100, y: 100 }));
  t = addPiece(t, newPiece('die', 'out', { x: 500, y: 500 }));
  t = addPiece(t, newPiece('counter', 'c', { x: 110, y: 110 }));
  const loop = [{ x: 0, y: 0 }, { x: 250, y: 0 }, { x: 250, y: 250 }, { x: 0, y: 250 }];
  assert.deepEqual(piecesInShape(t, loop, 'die'), ['in']);
  assert.deepEqual(piecesInShape(t, [{ x: 505, y: 495 }], 'die'), ['out']);
});

const overlaps = (t: ReturnType<typeof table>) => {
  const d = (t.pieces ?? []).filter((p) => p.kind === 'die');
  return d.some((a, i) => d.slice(i + 1).some((b) => Math.abs(a.x - b.x) < PIECE_SIZE.die.w && Math.abs(a.y - b.y) < PIECE_SIZE.die.w));
};

test('dice are pushed off each other the shortest way; ones not allowed to move stay put', () => {
  let t = addPiece(table(), newPiece('die', 'a', { x: 500, y: 500 }));
  t = addPiece(t, newPiece('die', 'b', { x: 520, y: 505 }));
  const apart = separateDice(t, ['b']);
  assert.equal(overlaps(apart), false);
  assert.deepEqual([apart.pieces![0].x, apart.pieces![0].y], [500, 500]);
  assert.equal(apart.pieces![1].x, 500 + PIECE_SIZE.die.w + DICE_SPACE);
  assert.equal(apart.pieces![1].y, 505);
  // Already apart: left as it was.
  assert.equal(separateDice(apart, ['a', 'b']), apart);
});

test('thrown dice never land on each other, and one that rolls in place stays put', () => {
  let t = table();
  for (let i = 0; i < 8; i++) t = addPiece(t, newPiece('die', `d${i}`, { x: 1000 + (i % 4) * 66, y: 1000 + Math.floor(i / 4) * 66 }));
  t = setPiece(t, 'd0', { rollInPlace: true });
  let r = 0.1;
  const random = () => (r = (r * 9301 + 49297) % 233280 / 233280);
  const { table: thrown, from } = throwDice(t, t.pieces!.map((p) => p.id), random);
  assert.equal(overlaps(thrown), false);
  assert.deepEqual(from.d0, { dx: 0, dy: 0 });
});

test('a group of pieces moves together, and dice dropped on others are moved off them', () => {
  let t = addPiece(addPiece(table(), newPiece('die', 'a', { x: 100, y: 100 })), newPiece('die', 'b', { x: 200, y: 100 }));
  t = addPiece(t, newPiece('die', 'still', { x: 400, y: 400 }));
  const moved = movePieces(t, ['a', 'b'], { x: 300, y: 300 });
  assert.equal(overlaps(moved), false);
  assert.deepEqual(moved.pieces!.find((p) => p.id === 'still'), t.pieces![2]);
  assert.deepEqual(moved.pieces!.find((p) => p.id === 'b'), { ...t.pieces![1], x: 500, y: 400 });
});

test('picked-out dice line up in a near-square grid round where they were', () => {
  let t = table();
  for (const [i, x] of [300, 900, 600, 1200, 100].entries()) t = addPiece(t, newPiece('die', `d${i}`, { x, y: 500 + i * 37 }));
  const g = gridDice(t, t.pieces!.map((p) => p.id));
  const xs = new Set(g.pieces!.map((p) => p.x));
  const ys = new Set(g.pieces!.map((p) => p.y));
  assert.equal(xs.size, 3);
  assert.equal(ys.size, 2);
  assert.equal(overlaps(g), false);
});
test('a timer starts, pauses keeping what it had left, and is set back once it runs out', () => {
  let t = addPiece(table(), newPiece('timer', 'tm', { x: 0, y: 0 }));
  t = toggleTimer(t, 'tm', 1000);
  assert.equal(t.pieces![0].endsAt, 61000);
  t = toggleTimer(t, 'tm', 31000);
  assert.equal(t.pieces![0].endsAt, undefined);
  assert.equal(t.pieces![0].left, 30);
  t = toggleTimer(t, 'tm', 100000);
  assert.equal(t.pieces![0].endsAt, 130000);
  t = toggleTimer(t, 'tm', 200000);
  assert.equal(t.pieces![0].left, undefined);
  assert.equal(t.pieces![0].endsAt, undefined);
});

test('a timer is set in minutes, or minutes and seconds, and shown as m:ss', () => {
  assert.equal(parseTimerText('5'), 300);
  assert.equal(parseTimerText('1:30'), 90);
  assert.equal(parseTimerText('0:00'), null);
  assert.equal(parseTimerText('abc'), null);
  assert.equal(timerText(90), '1:30');
  assert.equal(timerText(0.2), '0:01');
  assert.equal(timerText(0), '0:00');
});
test('zones lie under pieces: found on their own, and never as the piece under a point', () => {
  let t = addPiece(table(), newPiece('zone', 'z', { x: 500, y: 500 }));
  t = addPiece(t, newPiece('die', 'd', { x: 500, y: 500 }));
  assert.equal(pieceAt(t, 500, 500)?.piece.id, 'd');
  assert.equal(pieceAt(t, 600, 560), null);
  assert.equal(zoneAt(t, 600, 560)?.id, 'z');
  assert.deepEqual(piecesInShape(t, [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }]), ['d']);
});

test('a zone resizes from its bottom-right grip, its top-left corner staying put, and not too small', () => {
  const z = newPiece('zone', 'z', { x: 500, y: 500 });
  const t = addPiece(table(), z);
  assert.equal(zoneGripAt(t, 500 + 160, 500 + 110, 20)?.id, 'z');
  assert.equal(zoneGripAt(t, 500, 500, 20), null);
  assert.deepEqual(resizeZone(z, 420, 10), { w: 420, h: ZONE_MIN, x: 340 + 210, y: 390 + ZONE_MIN / 2 });
});

test('a card spot is found under a point; a zone isn’t one, and a zone cards snapped into (as spots once were) becomes one', () => {
  let t = addPiece(table(), { ...newPiece('spot', 's', { x: 100, y: 100 }), w: 120, h: 160 });
  t = addPiece(t, newPiece('zone', 'plain', { x: 800, y: 800 }));
  assert.equal(spotAt(t, 140, 160)?.id, 's');
  assert.equal(spotAt(t, 800, 800), null);
  // It's under pieces, as zones are, and found before a zone it lies in.
  t = addPiece(t, { ...newPiece('spot', 'in', { x: 800, y: 800 }) });
  assert.equal(zoneAt(t, 800, 800)?.id, 'in');
  assert.equal(pieceAt(t, 800, 800), null);
  const old = { ...table(), pieces: [{ ...newPiece('zone', 'o', { x: 0, y: 0 }), snap: true } as TablePiece] };
  const up = upgradeTable(old);
  assert.equal(up.pieces![0].kind, 'spot');
  assert.ok(!('snap' in up.pieces![0]));
  assert.equal(upgradeTable(t), t);
});

test('a card spot takes the size of the cards put in it, and a stack let go in it settles in its middle', () => {
  const size = () => ({ w: 100, h: 70 });
  let t = addPiece(table(), newPiece('spot', 's', { x: 500, y: 500 }));
  t = { ...t, stacks: [{ id: 'k', x: 510, y: 495, angle: 30, cards: [{ iid: 'a', deckId: 'd', cardId: 'c', faceUp: true }] }] };
  t = fitSpots(settleStacks(t, ['k'], size), size);
  assert.deepEqual([t.stacks[0].x, t.stacks[0].y, t.stacks[0].angle], [500, 500, 0]);
  assert.deepEqual([t.pieces![0].w, t.pieces![0].h], [116, 86]);
  // Nothing to change: the same table.
  assert.equal(fitSpots(t, size), t);
});

test('a zone that lines up cards puts each in the free place nearest where it’s let go', () => {
  const card = { w: 100, h: 140 };
  // Room for three across and one down.
  let t = addPiece(table(), { ...newPiece('zone', 'z', { x: 1000, y: 1000 }), w: 360, h: 170 });
  const cell = zoneCellAt(t, 1150, 1010, card);
  assert.deepEqual(cell?.at, { x: 1112, y: 1000, angle: 0 });
  // That place taken: the next nearest.
  t = { ...t, stacks: [{ id: 'k', x: 1112, y: 1000, angle: 0, cards: [{ iid: 'a', deckId: 'd', cardId: 'c', faceUp: true }] }] };
  assert.deepEqual(zoneCellAt(t, 1150, 1010, card)?.at, { x: 1000, y: 1000, angle: 0 });
  // Not lining up: nothing.
  const loose = { ...t, pieces: t.pieces!.map((p) => ({ ...p, grid: undefined })) };
  assert.equal(zoneCellAt(loose, 1150, 1010, card), null);
  // Every place taken: onto the stack in the nearest.
  const full = { ...t, stacks: [888, 1000, 1112].map((x, i) => ({ id: `k${i}`, x, y: 1000, angle: 0, cards: [{ iid: `${i}`, deckId: 'd', cardId: 'c', faceUp: true }] })) };
  assert.equal(zoneCellAt(full, 1150, 1010, card)?.onto?.id, 'k2');
});

test('a zone’s or card spot’s name can be held: over it, or under it, at its left, middle or right', () => {
  let t = addPiece(table(), { ...newPiece('zone', 'z', { x: 500, y: 500 }), w: 300, h: 200, label: 'Market' });
  // Over its top-left edge, but not over its middle, nor inside it.
  assert.equal(labelAt(t, 365, 385)?.id, 'z');
  assert.equal(labelAt(t, 600, 385), null);
  assert.equal(labelAt(t, 500, 500), null);
  t = setPiece(t, 'z', { labelAlign: 'right', labelBelow: true });
  assert.equal(labelAt(t, 630, 615)?.id, 'z');
  assert.equal(labelAt(t, 365, 385), null);
});

test('a score pad keeps each player’s points and totals; fewer players drops theirs', () => {
  let t = addPiece(table(), newPiece('score', 'p', { x: 500, y: 500 }));
  t = addScore(addScore(addScore(t, 'p', 0, 5), 'p', 1, 3), 'p', 0, -2);
  const pad = t.pieces![0];
  assert.deepEqual(scoreColumns(pad), [{ points: [5, -2], total: 3 }, { points: [3], total: 3 }]);
  assert.deepEqual(pieceSizeOf(pad), scoreSize(2));
  // Its second column, at the top (the name); its first, among the rows of points, and its + at the bottom.
  const { w, h } = scoreSize(2);
  assert.deepEqual(scoreSpotAt(pad, 500 + w / 2 - 20, 500 - h / 2 + 20), { player: 1, area: 'name' });
  assert.deepEqual(scoreSpotAt(pad, 500 - w / 2 + 20, 500), { player: 0, area: 'rows' });
  assert.deepEqual(scoreSpotAt(pad, 500 - w / 2 + 40, 500 + h / 2 - SCORE_PAD - 10), { player: 0, area: 'add' });
  // On the first points written down for the first player (its first row); changed, then crossed off.
  assert.deepEqual(scoreSpotAt(pad, 500 - w / 2 + 20, 500 - h / 2 + SCORE_PAD + SCORE_HEAD + 5), { player: 0, area: 'rows', entry: 0 });
  assert.deepEqual(scoreColumns(setScore(t, 'p', 0, 8).pieces![0])[0], { points: [8, -2], total: 6 });
  assert.deepEqual(setScore(t, 'p', 0, null).pieces![0].scores, [{ player: 1, points: 3 }, { player: 0, points: -2 }]);
  const three = setScorePlayers(t, 'p', 3).pieces![0];
  assert.deepEqual(three.names, ['Player 1', 'Player 2', 'Player 3']);
  const one = setScorePlayers(t, 'p', 1).pieces![0];
  assert.deepEqual(scoreColumns(one), [{ points: [5, -2], total: 3 }]);
});

test('a score pad shows its latest rows, scrolls back through older ones, and is made taller or shorter', () => {
  let t = addPiece(table(), { ...newPiece('score', 'p', { x: 500, y: 500 }), rows: 2 });
  for (const n of [1, 2, 3, 4]) t = addScore(t, 'p', 0, n);
  t = addScore(t, 'p', 1, 9);
  let pad = t.pieces![0];
  // Four rounds, two showing: the last two, and it can go back two.
  assert.deepEqual(scoreWindow(pad), { start: 2, rows: 2, most: 2, scroll: 0 });
  const { w, h } = pieceSizeOf(pad);
  const firstRow = 500 - h / 2 + SCORE_PAD + SCORE_HEAD + 5;
  // Its first row now holds the third points written down for the first player.
  assert.equal(scoreSpotAt(pad, 500 - w / 2 + 20, firstRow).entry, 2);
  // Scrolled all the way back: the first row is the first points again (and too far is as far as it goes).
  pad = { ...pad, scroll: 9 };
  assert.deepEqual(scoreWindow(pad), { start: 0, rows: 2, most: 2, scroll: 2 });
  assert.equal(scoreSpotAt(pad, 500 - w / 2 + 20, firstRow).entry, 0);
  // More points: back to the latest.
  assert.equal(addScore({ ...t, pieces: [pad] }, 'p', 1, 1).pieces![0].scroll, undefined);
  // Taller by three rows, from its top (which stays put); never fewer than two rows.
  const taller = resizeScore(pad, pieceSizeOf({ ...pad, scale: 1 }).h + 3 * SCORE_ROW);
  assert.equal(taller.rows, 5);
  assert.equal(taller.y - pieceSizeOf({ ...pad, rows: 5 }).h / 2, 500 - h / 2);
  assert.equal(resizeScore(pad, 10).rows, 2);
});
test('a bag holds cards and pieces like a stack: the top comes out first; shuffled and searched like one', () => {
  const card = (iid: string) => ({ card: { iid, deckId: 'd', cardId: iid, faceUp: true } });
  let t = addPiece(table(), newPiece('bag', 'b', { x: 1000, y: 1000 }));
  t = putInBag(t, 'b', [card('x'), { piece: newPiece('die', 'die1', { x: 5, y: 5 }) }, card('z')]);
  assert.equal(tableCardCount(t), 2);
  assert.equal(bagItems(t.pieces![0]).length, 3);
  // The top (last in) comes out first, beside the bag.
  const one = drawFromBag(t, 'b', 's1', false);
  assert.equal(one.stacks[0].cards[0].iid, 'z');
  assert.equal(one.stacks[0].cards[0].faceUp, false);
  const two = drawFromBag(one, 'b', 's2');
  assert.ok(two.pieces!.some((p) => p.id === 'die1' && p.x > 1000));
  // Rearranged as a search shows it (top first): the bottom card to the top.
  const moved = reorderBag(t, 'b', [2], 0);
  assert.deepEqual(bagItems(moved.pieces![0]).map(itemKey), ['die1', 'z', 'x']);
  assert.equal(bagItems(shuffleBag(t, 'b', () => 0).pieces![0]).length, 3);
  // Emptied out: cards in a stack, pieces beside it.
  const emptied = emptyBag(t, 'b', () => 'new');
  assert.equal(bagItems(emptied.pieces!.find((p) => p.id === 'b')!).length, 0);
  assert.equal(emptied.stacks[0].cards.length, 2);
  assert.ok(emptied.pieces!.some((p) => p.id === 'die1'));
  // Gone with their deck.
  assert.equal(bagItems(prune(t, []).pieces![0]).length, 1);
});

test('a supply never runs out: each drawn is a fresh one, and only the same thing goes back in', () => {
  const die = newPiece('die', 'd1', { x: 0, y: 0 }, 20);
  let t = addPiece(table(), newPiece('bag', 'b', { x: 1000, y: 1000 }));
  assert.ok(allAlike([{ piece: die }, { piece: { ...die, id: 'd2', value: 3 } }]));
  assert.equal(allAlike([{ piece: die }, { piece: newPiece('die', 'd3', { x: 0, y: 0 }, 6) }]), false);
  t = putInBag(t, 'b', [{ piece: die }], true);
  const bag = () => t.pieces!.find((p) => p.id === 'b')!;
  assert.equal(bagItems(bag()).length, 0);
  const a = drawFromBag(t, 'b', 'fresh1');
  const b = drawFromBag(a, 'b', 'fresh2');
  assert.deepEqual(b.pieces!.filter((p) => p.kind === 'die').map((p) => p.id).sort(), ['fresh1', 'fresh2']);
  assert.equal(bagTakes(bag(), [{ piece: { ...die, id: 'other' } }]), true);
  assert.equal(bagTakes(bag(), [{ piece: newPiece('die', 'x', { x: 0, y: 0 }, 6) }]), false);
  assert.equal(endSupply(t, 'b').pieces![0].supply, undefined);
});
test('a track’s spaces are found under a point, ends included', () => {
  const tr = newPiece('track', 'tr', { x: 1000, y: 500 });
  const w = trackSize(10).w;
  assert.equal(trackSpaceAt(tr, 1000 - w / 2 + 10, 500), 0);
  assert.equal(trackSpaceAt(tr, 1000 + w / 2 - 10, 500), 9);
  assert.equal(trackSpaceAt(tr, 1000 + 1, 500), 5);
  // Numbered the other way; standing up (down it, not across).
  assert.equal(trackSpaceAt({ ...tr, reversed: true }, 1000 - w / 2 + 10, 500), 9);
  const up = { ...tr, vertical: true };
  assert.deepEqual(pieceSizeOf(up), { w: PIECE_SIZE.track.h, h: w });
  assert.equal(trackSpaceAt(up, 1000, 500 - w / 2 + 10), 0);
  assert.equal(trackSpaceAt({ ...up, reversed: true }, 1000, 500 - w / 2 + 10), 9);
});
test('custom art lies among the cards: over the stack it was put on, under any put down after', () => {
  const size = () => ({ w: 100, h: 140 });
  const card = (iid: string) => ({ iid, deckId: 'd', cardId: iid, faceUp: true });
  let t = { ...table(), stacks: [{ id: 'A', x: 500, y: 500, angle: 0, cards: [card('a')] }] };
  t = raiseArt(addPiece(t, { ...newPiece('art', 'art', { x: 520, y: 520 }), w: 200, h: 200 }), ['art']);
  assert.equal(artLevel(t, t.pieces![0]), 0);
  // A card put down over it: on top of it.
  const withB = { ...t, stacks: [...t.stacks, { id: 'B', x: 530, y: 530, angle: 0, cards: [card('b')] }] };
  assert.ok(withB.stacks.findIndex((s) => s.id === 'B') > artLevel(withB, withB.pieces![0]));
  // Up past B; back under everything; front again.
  assert.equal(layerArt(withB, 'art', 'up', size).pieces![0].over, 'B');
  assert.equal(layerArt(withB, 'art', 'back', size).pieces![0].over, undefined);
  assert.equal(layerArt(withB, 'art', 'down', size).pieces![0].over, undefined);
  // Its stack taken up: it stays over the one under that (none here: under every card).
  const gone = keepArtLevels(withB, { ...withB, stacks: withB.stacks.filter((s) => s.id !== 'A') });
  assert.equal(gone.pieces![0].over, undefined);
  // A piece other than art is found first, wherever it is in the list.
  const both = addPiece({ ...withB, pieces: [newPiece('die', 'die', { x: 520, y: 520 }), ...withB.pieces!] }, newPiece('coin', 'c', { x: 2000, y: 2000 }));
  assert.equal(pieceAt(both, 520, 520)?.piece.id, 'die');
});
test('a copy is pasted laid out as it was, round a point, everything new; dice kept apart', () => {
  const card = (iid: string) => ({ iid, deckId: 'd', cardId: iid, faceUp: true });
  let t = { ...table(), stacks: [{ id: 'S', x: 100, y: 100, angle: 0, cards: [card('a'), card('b')] }] };
  t = addPiece(t, newPiece('die', 'D', { x: 300, y: 100 }));
  t = putInBag(addPiece(t, newPiece('bag', 'B', { x: 200, y: 300 })), 'B', [{ card: card('c') }]);
  const clip = copyItems(t, ['S'], ['D', 'B']);
  assert.equal(clipCards(clip), 3);
  let n = 0;
  const { table: pasted, stackIds, pieceIds } = pasteItems(t, clip, { x: 1000, y: 1000 }, () => `new${n++}`);
  assert.equal(pasted.stacks.length, 2);
  assert.equal(stackIds.length, 1);
  assert.equal(pieceIds.length, 2);
  const s = pasted.stacks.find((x) => x.id === stackIds[0])!;
  // Its middle round the point: the copy spanned 100–300 across and 100–300 down.
  assert.deepEqual([s.x, s.y], [900, 900]);
  assert.ok(s.cards.every((c) => c.iid.startsWith('new')));
  const bag = pasted.pieces!.find((p) => p.id === pieceIds[1])!;
  assert.ok(bagItems(bag)[0].card!.iid.startsWith('new'));
  assert.equal(tableCardCount(pasted), 6);
});
test('a zone fits snugly round the cards and pieces whose middles are in it', () => {
  const size = () => ({ w: 100, h: 140 });
  const card = (iid: string) => ({ iid, deckId: 'd', cardId: iid, faceUp: true });
  let t = { ...table(), stacks: [{ id: 'S', x: 500, y: 500, angle: 0, cards: [card('a')] }] };
  t = addPiece(t, { ...newPiece('zone', 'z', { x: 520, y: 520 }), w: 600, h: 600 });
  t = addPiece(t, { ...newPiece('art', 'a', { x: 700, y: 500 }), w: 100, h: 100 });
  t = addPiece(t, { ...newPiece('art', 'far', { x: 2000, y: 2000 }), w: 100, h: 100 });
  const z = fitZone(t, 'z', size).pieces!.find((p) => p.id === 'z')!;
  // Cards 450–550 × 430–570, art 650–750 × 450–550: with 12 of room round them.
  assert.deepEqual([z.x, z.y, z.w, z.h], [600, 500, 324, 164]);
  // Text (its label) and other zones inside it are left out; any other piece is fitted round.
  let labeled = addPiece(t, { ...newPiece('text', 'words', { x: 300, y: 300 }), label: 'Discard' });
  labeled = addPiece(labeled, { ...newPiece('zone', 'inner', { x: 780, y: 780 }), w: 50, h: 50 });
  const same = fitZone(labeled, 'z', size).pieces!.find((p) => p.id === 'z')!;
  assert.deepEqual([same.x, same.y, same.w, same.h], [600, 500, 324, 164]);
  const withDie = addPiece(t, newPiece('die', 'd', { x: 500, y: 700 }));
  const fz = fitZone(withDie, 'z', size).pieces!.find((p) => p.id === 'z')!;
  assert.ok(fz.y + fz.h! / 2 > 700);
  const empty =addPiece(table(), newPiece('zone', 'e', { x: 100, y: 100 }));
  assert.equal(fitZone(empty, 'e', size), empty);
});
test('a small piece is caught a little way off it, but not over one right under the finger', () => {
  let t = addPiece(table(), newPiece('meeple', 'm', { x: 500, y: 500 }, 6, 'cube'));
  assert.equal(pieceAt(t, 500 + 35, 500)?.piece.id, undefined);
  assert.equal(pieceAt(t, 500 + 35, 500, 40)?.piece.id, 'm');
  t = addPiece(t, newPiece('die', 'd', { x: 570, y: 500 }));
  assert.equal(pieceAt(t, 545, 500, 40)?.piece.id, 'd');
});
test('the Playground has every component (a bag of cubes, an endless supply) and no cards', () => {
  let n = 0;
  const t = playground(newSandbox('p', 'Playground', 0), undefined, () => `p${n++}`);
  assert.equal(t.stacks.length, 0);
  const deck = { id: 'pc', name: 'Playing Cards', backImage: null, cards: [{ id: 'a', name: 'A', image: 'a.png', copies: 3 }, { id: 'b', name: 'B', image: 'b.png', copies: 3 }], createdAt: 0, updatedAt: 0 };
  const dealt = playground(newSandbox('p', 'Playground', 0), deck, () => `q${n++}`);
  // The rest face down in the card spot; four face up, one in each of the market zone's places (its row full).
  assert.deepEqual(dealt.stacks.map((s) => [s.cards.length, s.cards[0].faceUp]), [[2, false], [1, true], [1, true], [1, true], [1, true]]);
  const draw = dealt.pieces!.find((p) => p.kind === 'spot')!;
  assert.deepEqual([dealt.stacks[0].x, dealt.stacks[0].y], [draw.x, draw.y]);
  const market = dealt.pieces!.find((p) => p.label === 'Market')!;
  const card = { w: 100, h: 140 };
  assert.ok(zoneCellAt(dealt, market.x, market.y, card)?.onto, 'every place in the market is taken');
  // The last card taken out: its place is the free one.
  assert.equal(zoneCellAt({ ...dealt, stacks: dealt.stacks.slice(0, 4) }, market.x + 200, market.y, card)?.at.x, dealt.stacks[4].x);
  // Nothing lies on anything else (zones and card spots included), so it reads as tidy rows.
  const box = (p: TablePiece) => {
    const { w, h } = pieceSizeOf(p);
    return { l: p.x - w / 2, r: p.x + w / 2, t: p.y - h / 2, b: p.y + h / 2 };
  };
  const all = dealt.pieces!.map((p) => ({ p, ...box(p) }));
  for (const [i, a] of all.entries()) {
    for (const b of all.slice(i + 1)) {
      assert.ok(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t, `${a.p.kind} ${a.p.label ?? ''} overlaps ${b.p.kind} ${b.p.label ?? ''}`);
    }
  }
  const kinds = new Set((t.pieces ?? []).map((p) => p.kind));
  for (const k of ['zone', 'spot', 'score', 'text', 'track', 'meeple', 'bag', 'counter', 'die', 'coin', 'spinner', 'timer', 'marker']) assert.ok(kinds.has(k as never), k);
  const bags = (t.pieces ?? []).filter((p) => p.kind === 'bag');
  assert.equal(bagItems(bags[0]).length, 6);
  assert.equal(bags[1].supply?.piece?.shape, 'disc');
  assert.equal(new Set((t.pieces ?? []).map((p) => p.id)).size, t.pieces!.length);
});

test('keepCards leaves only the cards that pass, everywhere, and drops emptied stacks', () => {
  const c = (iid: string, deckId: string) => ({ iid, deckId, cardId: iid, faceUp: false });
  const t = { ...newSandbox('t', 'T', 0), stacks: [{ id: 's', x: 0, y: 0, angle: 0, cards: [c('1', 'mine')] }, { id: 'k', x: 0, y: 0, angle: 0, cards: [c('2', 'pc'), c('3', 'mine')] }], hands: [[c('4', 'mine')], [c('5', 'pc')], [], []], trash: [c('6', 'mine')] };
  const kept = keepCards(t, (x) => x.deckId === 'pc');
  assert.deepEqual(kept.stacks.map((s) => [s.id, s.cards.map((x) => x.iid)]), [['k', ['2']]]);
  assert.deepEqual(kept.hands.map((h) => h.length), [0, 1, 0, 0]);
  assert.equal(kept.trash?.length, 0);
});
