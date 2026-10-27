import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cardsByDeck,
  DeckFileError,
  deckFileName,
  extOf,
  imagePixels,
  packDecks,
  packManifest,
  partFromHead,
  pictureData,
  remapTable,
  unpackDecks,
  unpackFile,
  unpackManifest,
} from './deckFile.ts';
import type { FilePicture } from './deckFile.ts';
import type { Deck } from './types.ts';

const deck = (over: Partial<Deck> = {}): Deck => ({
  id: 'd1',
  name: 'Monsters',
  backImage: 'decks/d1/back.png',
  cards: [
    { id: 'c1', name: 'Goblin', image: 'decks/d1/a.jpg', copies: 3 },
    { id: 'c2', name: 'Troll', image: 'decks/d1/b.jpeg' },
    // Sharing a picture with the first card (as older decks can).
    { id: 'c3', name: 'Goblin chief', image: 'decks/d1/a.jpg' },
  ],
  cardShape: { kind: 'usMini' },
  playMode: 'reveal',
  createdAt: 1,
  updatedAt: 2,
  ...over,
});

const read = (path: string) => `data-of-${path}`;

test('a deck survives being packed into a file and read back', () => {
  const [back] = unpackDecks(JSON.stringify(packDecks([deck()], read)));
  assert.equal(back.name, 'Monsters');
  assert.deepEqual(back.cardShape, { kind: 'usMini' });
  assert.equal(back.playMode, 'reveal');
  assert.deepEqual(back.back, { ext: 'png', data: 'data-of-decks/d1/back.png' });
  assert.deepEqual(
    back.cards.map((c) => [c.name, c.copies, c.image.ext, pictureData(c.image)]),
    [
      ['Goblin', 3, 'jpg', 'data-of-decks/d1/a.jpg'],
      ['Troll', undefined, 'jpeg', 'data-of-decks/d1/b.jpeg'],
      ['Goblin chief', undefined, 'jpg', 'data-of-decks/d1/a.jpg'],
    ],
  );
});

test('a picture used by several cards is kept once in the file', () => {
  const reads: string[] = [];
  const file = packDecks([deck()], (p) => (reads.push(p), read(p)));
  assert.equal(Object.keys(file.images).length, 3);
  assert.deepEqual(reads.sort(), ['decks/d1/a.jpg', 'decks/d1/b.jpeg', 'decks/d1/back.png']);
});

test('several decks go in one file, and a deck without a back keeps the built-in one', () => {
  const file = packDecks([deck(), deck({ id: 'd2', name: 'Loot', backImage: null })], read);
  const decks = unpackDecks(JSON.stringify(file));
  assert.deepEqual(
    decks.map((d) => d.name),
    ['Monsters', 'Loot'],
  );
  assert.equal(decks[1].back, null);
});

test("files that aren't deck files, or are damaged or too new, are turned away with a reason", () => {
  assert.throws(() => unpackDecks('not json'), DeckFileError);
  assert.throws(() => unpackDecks('{"hello":1}'), /isn't a Shufflevale deck/);
  const file = packDecks([deck()], read);
  assert.throws(() => unpackDecks(JSON.stringify({ ...file, version: 99 })), /newer version/);
  assert.throws(() => unpackDecks(JSON.stringify({ ...file, images: {} })), /pictures are missing/);
  assert.throws(() => unpackDecks(JSON.stringify({ ...file, decks: [] })), /no decks/);
});

test('deck files are named after the deck, safely', () => {
  assert.equal(deckFileName([{ name: 'Monsters: Vol/2' }]), 'Monsters Vol 2.shufflevale');
  assert.equal(deckFileName([{ name: 'A' }, { name: 'B' }]), 'Shufflevale decks.shufflevale');
  assert.equal(extOf('decks/x/1.PNG'), 'png');
  assert.equal(extOf('decks/x/noext'), 'jpg');
});

test('nothing in a file is trusted: copies, sizes, corners, names and pictures are checked', () => {
  const file = (deck: Record<string, unknown>, images: Record<string, unknown> = { a: { ext: 'jpg', data: 'xx' } }) =>
    JSON.stringify({ kind: 'shufflevale-decks', version: 1, decks: [{ back: null, cards: [{ name: 'A', image: 'a' }], ...deck }], images });
  const [huge] = unpackDecks(file({ cards: [{ name: 'A', image: 'a', copies: 1e9 }] }));
  assert.equal(huge.cards[0].copies, 99);
  const [odd] = unpackDecks(file({ name: 'x'.repeat(500), cardShape: { kind: 'wobbly' }, roundness: 40 }));
  assert.equal(odd.name.length, 60);
  assert.equal(odd.cardShape, undefined);
  assert.equal(odd.roundness, 0.25);
  const [custom] = unpackDecks(file({ cardShape: { kind: 'custom', width: 'wide', height: 2 } }));
  assert.equal(custom.cardShape, undefined);
  const [auto] = unpackDecks(file({ cardShape: { kind: 'auto', detected: { kind: 'usMini', landscape: true } } }));
  assert.deepEqual(auto.cardShape, { kind: 'auto', detected: { kind: 'usMini', landscape: true } });
  assert.throws(() => unpackDecks(file({}, { a: { ext: 'exe', data: 'xx' } })), DeckFileError);
  assert.throws(() => unpackDecks(file({}, { a: { ext: 'png', data: 'x'.repeat(20_000_001) } })), DeckFileError);
});

test('a picture’s size is read from its header, and huge ones are turned away', async () => {
  const { readFileSync } = await import('node:fs');
  assert.deepEqual(imagePixels(readFileSync('assets/playing-cards/as.jpg').toString('base64')), { w: 500, h: 700 });
  assert.deepEqual(imagePixels(readFileSync('assets/about-icon.png').toString('base64')), { w: 336, h: 336 });
  // A PNG header claiming 20,000 pixels across.
  const png = new Uint8Array(33);
  png.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0x4e, 0x20, 0, 0, 1, 0]);
  const data = Buffer.from(png).toString('base64');
  assert.deepEqual(imagePixels(data), { w: 20000, h: 256 });
  const text = JSON.stringify({ kind: 'shufflevale-decks', version: 1, decks: [{ back: null, cards: [{ name: 'A', image: 'a' }] }], images: { a: { ext: 'png', data } } });
  assert.throws(() => unpackDecks(text), DeckFileError);
});

test('a table travels with its decks: packed, read back, and pointed at the decks as added', () => {
  const d = deck();
  const table = {
    id: 't1', name: 'Game Night', createdAt: 0, updatedAt: 0,
    stacks: [{ id: 's1', x: 100, y: 200, angle: 90, locked: true, cards: [{ iid: 'a', deckId: 'd1', cardId: 'c1', faceUp: true }, { iid: 'b', deckId: 'd1', cardId: 'c2', faceUp: false }] }],
    hands: [[{ iid: 'h', deckId: 'd1', cardId: 'c3', faceUp: true }], [], [], []],
    handNames: ['Ana', 'Hand 2', 'Hand 3', 'Hand 4'],
    background: 'charcoal', snapToGrid: true, gridStep: 60,
  };
  const file = JSON.stringify(packDecks([d], (p) => `data-of-${p}`, [table]));
  const read = unpackFile(file);
  assert.equal(read.tables.length, 1);
  assert.equal(read.decks[0].fileId, 'd1');
  assert.deepEqual(read.decks[0].cards.map((c) => c.fileId), ['c1', 'c2', 'c3']);
  // As the decks were added: new ids for the deck and its cards.
  const map = new Map([['d1', { id: 'D', cards: new Map([['c1', 'X'], ['c2', 'Y'], ['c3', 'Z']]) }]]);
  let n = 0;
  const t = remapTable(read.tables[0], map, () => `n${n++}`);
  assert.equal(t.name, 'Game Night');
  assert.deepEqual(t.stacks[0].cards.map((c) => [c.deckId, c.cardId, c.faceUp]), [['D', 'X', true], ['D', 'Y', false]]);
  assert.equal(t.stacks[0].locked, true);
  assert.equal(t.stacks[0].angle, 90);
  assert.deepEqual(t.hands[0].map((c) => c.cardId), ['Z']);
  assert.equal(t.handNames[0], 'Ana');
  assert.equal(t.background, 'charcoal');
  assert.equal(t.gridStep, 60);
  // Fresh ids for its stacks and cards.
  assert.ok(t.stacks[0].id.startsWith('n') && t.stacks[0].cards.every((c) => c.iid.startsWith('n')));
});

test('a table’s components, custom art and card sizes come with it', () => {
  const d = deck();
  const table = {
    id: 't1', name: 'Zombicide', createdAt: 0, updatedAt: 0, hideHands: true,
    stacks: [{ id: 's1', x: 100, y: 200, angle: 0, cards: [{ iid: 'a', deckId: 'd1', cardId: 'c1', faceUp: true, scale: 1.5 }] }],
    hands: [[], [], [], []],
    handNames: ['Hand 1', 'Hand 2', 'Hand 3', 'Hand 4'],
    pieces: [
      { id: 'p1', kind: 'die' as const, x: 10, y: 20, value: 17, sides: 20, angle: 30, color: '#e24b4a' },
      { id: 'p2', kind: 'art' as const, x: 300, y: 300, value: 0, image: 'decks/tokens/board.png', w: 400, h: 300, over: 's1', scale: 2 },
      {
        id: 'p3', kind: 'bag' as const, x: 0, y: 0, value: 0,
        items: [{ card: { iid: 'b', deckId: 'd1', cardId: 'c2', faceUp: false } }, { piece: { id: 'p4', kind: 'token' as const, x: 0, y: 0, value: 2, image: 'decks/tokens/t.jpg', tokenShape: 'hexagon' as const } }],
      },
      { id: 'p5', kind: 'zone' as const, x: 0, y: 0, value: 0, w: 500, h: 400, look: 'dashed' as const, label: 'Discard', hideLabel: true, opacity: 0.4 },
    ],
  };
  const reads: string[] = [];
  const text = JSON.stringify(packDecks([d], (p) => (reads.push(p), `data-of-${p}`), [table]));
  // The pieces' pictures go in the file, and the paths don't.
  assert.ok(reads.includes('decks/tokens/board.png') && reads.includes('decks/tokens/t.jpg'));
  assert.match(JSON.parse(text).tables[0].pieces[1].image, /^i\d+$/);
  const read = unpackFile(text);
  assert.equal(Object.keys(read.images).length, 2);
  const map = new Map([['d1', { id: 'D', cards: new Map([['c1', 'X'], ['c2', 'Y'], ['c3', 'Z']]) }]]);
  let n = 0;
  const saved: string[] = [];
  const t = remapTable(read.tables[0], map, () => `n${n++}`, (key) => (saved.push(pictureData(read.images[key]) as string),`decks/tokens/new-${key}`));
  assert.equal(t.hideHands, true);
  assert.equal(t.stacks[0].cards[0].scale, 1.5);
  const [die, art, bag, zone] = t.pieces!;
  assert.deepEqual([die.kind, die.value, die.sides, die.angle, die.color], ['die', 17, 20, 30, '#e24b4a']);
  // Custom art keeps its picture (saved again), its size and scale, and lies over the same stack (by its new id).
  assert.equal(art.image, `decks/tokens/new-${Object.keys(read.images)[0]}`);
  assert.deepEqual([art.w, art.h, art.scale, art.over], [400, 300, 2, t.stacks[0].id]);
  assert.deepEqual(saved.sort(), ['data-of-decks/tokens/board.png', 'data-of-decks/tokens/t.jpg']);
  // A bag keeps its card (pointed at the deck as added) and its token.
  assert.equal(bag.items![0].card!.cardId, 'Y');
  assert.equal(bag.items![1].piece!.kind, 'token');
  assert.ok(bag.items![1].piece!.image);
  assert.equal(bag.items![1].piece!.tokenShape, 'hexagon');
  assert.deepEqual([zone.look, zone.label, zone.w, zone.hideLabel, zone.opacity], ['dashed', 'Discard', 500, true, 0.4]);
  // Fresh ids for every piece.
  assert.ok(t.pieces!.every((p) => p.id.startsWith('n')));
});

test('a d6’s and a coin’s own face art come with the table', () => {
  const d = deck();
  const table = {
    id: 't1', name: 'T', createdAt: 0, updatedAt: 0, stacks: [], hands: [[], [], [], []], handNames: ['Hand 1', 'Hand 2', 'Hand 3', 'Hand 4'],
    pieces: [
      {
        id: 'p1', kind: 'die' as const, x: 0, y: 0, value: 1, sides: 6,
        faces: ['decks/tokens/one.png', null, null, null, null, 'decks/tokens/six.png'],
        faceColors: ['#123456', null, null, null, null, 'not a color'],
      },
      { id: 'p2', kind: 'coin' as const, x: 0, y: 0, value: 1, faces: [null, 'decks/tokens/tails.png'] },
    ],
  };
  const reads: string[] = [];
  const text = JSON.stringify(packDecks([d], (p) => (reads.push(p), `data-of-${p}`), [table]));
  assert.deepEqual(reads.filter((r) => r.startsWith('decks/tokens/')).sort(), ['decks/tokens/one.png', 'decks/tokens/six.png', 'decks/tokens/tails.png']);
  const read = unpackFile(text);
  let n = 0;
  const t = remapTable(read.tables[0], new Map(), () => `n${n++}`, (key) => `decks/tokens/new-${key}`);
  const [die, coin] = t.pieces!;
  // Each face's picture saved again, the standard ones left standard, in their places.
  assert.deepEqual(die.faces!.map((f) => f !== null), [true, false, false, false, false, true]);
  assert.ok(die.faces![0]!.startsWith('decks/tokens/new-'));
  // Each face's color comes too (only real colors).
  assert.deepEqual(die.faceColors, ['#123456', null, null, null, null, null]);
  assert.deepEqual(coin.faces!.map((f) => f !== null), [false, true]);
});

test('a table’s pieces are checked: unknown kinds, nonsense values and missing pictures go', () => {
  const d = deck();
  const raw = JSON.parse(JSON.stringify(packDecks([d], (p) => `data-of-${p}`, [{ id: 't', name: 'T', createdAt: 0, updatedAt: 0, handNames: [], hands: [[], [], [], []], stacks: [] }])));
  raw.tables[0].pieces = [
    { kind: 'dragon', x: 0, y: 0, value: 1 },
    { kind: 'die', x: 0, y: 0, value: 99, sides: 7 },
    { kind: 'token', x: 'left', y: 0, value: 1 },
    { kind: 'token', x: 0, y: 0, value: 1, image: 'nope', scale: 1e9, color: 'javascript:alert(1)' },
  ];
  const [t] = unpackFile(JSON.stringify(raw)).tables;
  assert.equal(t.pieces!.length, 2);
  assert.deepEqual([t.pieces![0].sides, t.pieces![0].value], [6, 6]);
  assert.deepEqual([t.pieces![1].image, t.pieces![1].scale, t.pieces![1].color], [undefined, 4, undefined]);
});

test('a table of just components, with no decks, still opens', () => {
  const table = { id: 't', name: 'Dice', createdAt: 0, updatedAt: 0, handNames: [], hands: [[], [], [], []], stacks: [], pieces: [{ id: 'p', kind: 'die' as const, x: 0, y: 0, value: 3 }] };
  const read = unpackFile(JSON.stringify(packDecks([], (p) => p, [table])));
  assert.equal(read.decks.length, 0);
  assert.equal(read.tables[0].pieces!.length, 1);
});

test('a table’s cards from decks not in the file are left out; files from before tables still open', () => {
  const d = deck();
  const table = { id: 't', name: 'T', createdAt: 0, updatedAt: 0, handNames: [], hands: [[], [], [], []],
    stacks: [{ id: 's', x: 0, y: 0, angle: 0, cards: [{ iid: 'a', deckId: 'elsewhere', cardId: 'q', faceUp: true }] }] };
  const read = unpackFile(JSON.stringify(packDecks([d], (p) => `data-of-${p}`, [table])));
  assert.equal(read.tables[0].stacks.length, 0);
  // An older file: no ids, no tables.
  const old = JSON.parse(JSON.stringify(packDecks([d], (p) => `data-of-${p}`)));
  delete old.decks[0].id;
  for (const c of old.decks[0].cards) delete c.id;
  assert.deepEqual(unpackFile(JSON.stringify(old)).tables, []);
  assert.equal(unpackDecks(JSON.stringify(old)).length, 1);
});

test('a part says which it is at its very start, and its tables find cards in the other parts', () => {
  const d1 = deck();
  const d2 = deck({ id: 'd2', cards: [{ id: 'x', name: 'Ogre', image: 'decks/d2/x.jpg' }] });
  const table = { id: 't', name: 'T', createdAt: 0, updatedAt: 0, handNames: [], hands: [[], [], [], []],
    stacks: [{ id: 's', x: 0, y: 0, angle: 0, cards: [{ iid: 'a', deckId: 'd1', cardId: 'c2', faceUp: true }, { iid: 'b', deckId: 'd2', cardId: 'x', faceUp: true }] }] };
  const first = JSON.stringify({ part: { n: 1, of: 2, set: 'abc' }, ...packDecks([d1], read) });
  const second = JSON.stringify({ part: { n: 2, of: 2, set: 'abc' }, ...packDecks([d2], read, [table]) });
  assert.deepEqual(partFromHead(second.slice(0, 100)), { n: 2, of: 2, set: 'abc' });
  assert.equal(partFromHead(JSON.stringify(packDecks([d1], read)).slice(0, 100)), null);
  assert.equal(partFromHead('{"part":{"n":3,"of":2,"set":"abc"}'), null);
  const one = unpackFile(first);
  assert.deepEqual(one.part, { n: 1, of: 2, set: 'abc' });
  // By itself, only the card from its own deck; with the first part's decks, both.
  assert.equal(unpackFile(second).tables[0].stacks[0].cards.length, 1);
  assert.equal(unpackFile(second, cardsByDeck(one.decks)).tables[0].stacks[0].cards.length, 2);
});

test('a zipped file lists each picture once beside what is in it, and its decks keep their groups', () => {
  const groups = [
    { id: 'g1', name: 'Monsters', collapsed: true, before: 'd2' },
    // No deck of the file's is in it, so it stays out.
    { id: 'g2', name: 'Empty' },
  ];
  const decks = [deck({ groupId: 'g1' }), deck({ id: 'd2', name: 'Loot', backImage: null }), deck({ id: 'd3', groupId: 'g2-gone' })];
  const { file, pictures } = packManifest(decks, [], groups);
  assert.deepEqual(
    pictures.map((p) => p.path).sort(),
    ['decks/d1/a.jpg', 'decks/d1/b.jpeg', 'decks/d1/back.png'],
  );
  assert.ok(Object.values(file.images).every((i) => !('data' in i)));
  // Each picture, as the zip would hand it over: by where it is in it.
  const names = new Set(pictures.map((p) => p.name));
  const asked: string[] = [];
  const picture = (name: string, ext: string): FilePicture => {
    asked.push(name);
    if (!names.has(name)) throw new DeckFileError('missing');
    return { ext, name, bytes: () => new Uint8Array([1]) };
  };
  const read = unpackManifest(JSON.stringify(file), picture);
  assert.deepEqual(read.groups, [{ fileId: 'g1', name: 'Monsters', collapsed: true, before: 'd2' }]);
  assert.deepEqual(read.decks.map((d) => d.fileGroup), ['g1', undefined, undefined]);
  // Asked for once each, however many cards (and decks) use it.
  assert.equal(asked.length, 3);
  assert.equal(read.decks[0].cards[0].image, read.decks[0].cards[2].image);
  // A picture missing from the zip.
  assert.throws(() => unpackManifest(JSON.stringify(file), () => { throw new DeckFileError('missing'); }), DeckFileError);
});

test('a group lying above a deck not in the file keeps its decks, lying with the rest instead', () => {
  const { file } = packManifest([deck({ groupId: 'g' })], [], [{ id: 'g', name: 'G', before: 'elsewhere' }]);
  const read = unpackManifest(JSON.stringify(file), (name, ext) => ({ ext, name, bytes: () => new Uint8Array() }));
  assert.deepEqual(read.groups, [{ fileId: 'g', name: 'G' }]);
});

test('card spots, score pads, a zone lining up cards, names placed and a track without numbers all travel in a file', () => {
  const table = { id: 't', name: 'T', createdAt: 0, updatedAt: 0, handNames: [], hands: [[], [], [], []], stacks: [], pieces: [
    { id: 'a', kind: 'spot' as const, x: 0, y: 0, value: 0, w: 116, h: 156, label: 'Draw', labelAlign: 'right' as const, labelBelow: true },
    { id: 'b', kind: 'zone' as const, x: 0, y: 0, value: 0, w: 300, h: 200, grid: true },
    { id: 'c', kind: 'score' as const, x: 0, y: 0, value: 0, names: ['Ann', 'Bo'], scores: [{ player: 0, points: 5 }, { player: 7, points: 1 }, { player: 1, points: -3 }] },
    { id: 'd', kind: 'track' as const, x: 0, y: 0, value: 0, spaces: 10, hideNumbers: true },
  ] };
  const raw = JSON.parse(JSON.stringify(packDecks([], (p) => p, [table])));
  // A zone cards snapped into, from an older file: a card spot.
  raw.tables[0].pieces.push({ id: 'e', kind: 'zone', x: 0, y: 0, value: 0, snap: true });
  const [spot, zone, pad, track, old] = unpackFile(JSON.stringify(raw)).tables[0].pieces!;
  assert.deepEqual([spot.kind, spot.labelAlign, spot.labelBelow], ['spot', 'right', true]);
  assert.equal(zone.grid, true);
  // Points for a player it hasn't got are left out.
  assert.deepEqual([pad.names, pad.scores], [['Ann', 'Bo'], [{ player: 0, points: 5 }, { player: 1, points: -3 }]]);
  assert.equal(track.hideNumbers, true);
  assert.equal(old.kind, 'spot');
});
