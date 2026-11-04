/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cardPartners, findDuplicates, matchDeck, matchTable, pairKey, repointTable } from './deckMatch.ts';
import type { FilePicture, FileTable, UnpackedDeck } from './deckFile.ts';
import type { SandboxTable } from './sandbox.ts';
import type { Deck } from './types.ts';

// Pictures stand in as names: a saved one's path is "decks/x/<name>", a file's has `data` "<name>".
const pic = (name: string): FilePicture => ({ ext: 'jpg', data: name });
const same = (path: string, p: FilePicture) => 'data' in p && path.endsWith(`/${p.data}`);
const sameSaved = (a: string, b: string) => a.split('/').pop() === b.split('/').pop();

const deck = (id: string, cards: [string, string, number?][], extra: Partial<Deck> = {}): Deck => ({
  id,
  name: 'Monsters',
  backImage: `decks/${id}/back`,
  cards: cards.map(([cid, img, copies]) => ({ id: cid, name: cid.toUpperCase(), image: `decks/${id}/${img}`, ...(copies ? { copies } : {}) })),
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});
const fileDeck = (fileId: string, cards: [string, string, number?, string?][], extra: Partial<UnpackedDeck> = {}): UnpackedDeck => ({
  fileId,
  name: 'Monsters',
  back: pic('back'),
  cards: cards.map(([cid, img, copies, origin]) => ({ fileId: cid, ...(origin ? { origin } : {}), name: (origin ?? cid).toUpperCase(), image: pic(img), ...(copies ? { copies } : {}) })),
  ...extra,
});

test('a deck exported from here comes back as itself, unchanged', () => {
  const own = [deck('d1', [['a', 'a.jpg'], ['b', 'b.jpg']])];
  const m = matchDeck(fileDeck('d1', [['a', 'a.jpg'], ['b', 'b.jpg']]), own, same);
  assert.equal(m?.deckId, 'd1');
  assert.equal(m?.how, 'id');
  assert.equal(m?.identical, true);
  assert.equal(m?.changed, 0);
  assert.deepEqual([...m!.cards], [['a', 'a'], ['b', 'b']]);
});

test("a friend's newer version is found by where it came from, and its changes counted", () => {
  // Imported here earlier: its own ids, remembering the friend's.
  const own = [
    deck('mine', [['m1', 'a.jpg'], ['m2', 'b.jpg'], ['m3', 'c.jpg']], { origin: 'theirs' }),
  ].map((d) => ({ ...d, cards: d.cards.map((c, i) => ({ ...c, origin: ['f1', 'f2', 'f3'][i], name: ['F1', 'F2', 'F3'][i] })) }));
  // Their file now: card 2's picture changed, card 3 gone, card 4 new.
  const u = fileDeck('theirs', [['f1', 'a.jpg'], ['f2', 'b2.jpg'], ['f4', 'd.jpg']]);
  const m = matchDeck(u, own, same);
  assert.equal(m?.deckId, 'mine');
  assert.equal(m?.identical, false);
  assert.equal(m?.changed, 3);
  assert.deepEqual([...m!.cards], [['f1', 'm1'], ['f2', 'm2']]);
});

test('a re-shared copy is found through its origin, either way round', () => {
  // My deck, imported by a friend (their ids, my origin), sent back to me.
  const own = [deck('d1', [['a', 'a.jpg']])];
  const m = matchDeck(fileDeck('their-d', [['their-a', 'a.jpg', undefined, 'a']], { origin: 'd1' }), own, same);
  assert.equal(m?.deckId, 'd1');
  assert.equal(m?.identical, true);
  assert.deepEqual([...m!.cards], [['their-a', 'a']]);
});

test('a reordered deck is not identical, though no card changed', () => {
  const own = [deck('d1', [['a', 'a.jpg'], ['b', 'b.jpg']])];
  const m = matchDeck(fileDeck('d1', [['b', 'b.jpg'], ['a', 'a.jpg']]), own, same);
  assert.equal(m?.identical, false);
  assert.equal(m?.changed, 0);
});

test('with no id in common, only a deck the same in every way matches', () => {
  const own = [deck('x', [['a', 'a.jpg'], ['b', 'b.jpg', 3]])];
  const twin = fileDeck('other', [['A', 'a.jpg'], ['B', 'b.jpg', 3]]);
  twin.cards = twin.cards.map((c) => ({ ...c, name: c.fileId!.toUpperCase() }));
  const m = matchDeck(twin, own, same);
  assert.equal(m?.how, 'same');
  assert.deepEqual([...m!.cards], [['A', 'a'], ['B', 'b']]);
  // Different copies, a different picture, a different order, a different name: none match.
  const off = (f: (d: UnpackedDeck) => void) => {
    const d = structuredClone(twin);
    d.cards = d.cards.map((c) => ({ ...c, image: pic((c.image as { data: string }).data) }));
    d.back = pic('back');
    f(d);
    return matchDeck(d, own, same);
  };
  assert.equal(off((d) => (d.cards[1].copies = 2)), null);
  assert.equal(off((d) => (d.cards[0].image = pic('z.jpg'))), null);
  assert.equal(off((d) => d.cards.reverse()), null);
  assert.equal(off((d) => (d.name = 'Other')), null);
  assert.equal(off((d) => (d.back = null)), null);
});

test('a deck already matched is passed over, and the latest changed of several is found', () => {
  const own = [deck('old', [['a', 'a.jpg']], { origin: 'o', updatedAt: 1 }), deck('new', [['a', 'a.jpg']], { origin: 'o', updatedAt: 5 })];
  const u = fileDeck('o', [['a', 'a.jpg']]);
  assert.equal(matchDeck(u, own, same)?.deckId, 'new');
  assert.equal(matchDeck(u, own, same, new Set(['new']))?.deckId, 'old');
});

const table = (id: string, origin?: string, updatedAt = 1) => ({ id, origin, updatedAt }) as SandboxTable;

test('a table is found by where it came from', () => {
  const t = { origin: 't1' } as FileTable;
  assert.equal(matchTable(t, [table('t1'), table('t2')]), 't1');
  assert.equal(matchTable(t, [table('x', 't1')]), 'x');
  assert.equal(matchTable({} as FileTable, [table('t1')]), null);
});

test("merging: a deck's cards find their partners, and tables follow", () => {
  const keep = deck('k', [['k1', 'a.jpg'], ['k2', 'b.jpg']]);
  const gone = { ...deck('g', [['g1', 'a.jpg'], ['g2', 'b.jpg'], ['g3', 'c.jpg']]) };
  gone.cards = gone.cards.map((c, i) => ({ ...c, name: ['K1', 'K2', 'G3'][i] }));
  const partners = cardPartners(gone, keep);
  assert.deepEqual([...partners], [['g1', 'k1'], ['g2', 'k2']]);
  const card = (cardId: string, deckId = 'g') => ({ iid: cardId, deckId, cardId, faceUp: false });
  const t = repointTable(
    { stacks: [{ id: 's', x: 0, y: 0, angle: 0, cards: [card('g1'), card('g3'), card('z', 'other')] }], hands: [[card('g2')]], pieces: [{ id: 'b', kind: 'bag', x: 0, y: 0, value: 0, items: [{ card: card('g1') }] }] },
    'g',
    'k',
    partners,
  );
  assert.deepEqual(t.stacks[0].cards.map((c) => `${c.deckId}:${c.cardId}`), ['k:k1', 'g:g3', 'other:z']);
  assert.deepEqual(t.hands[0].map((c) => c.cardId), ['k2']);
  assert.equal(t.pieces![0].items![0].card!.cardId, 'k1');
});

test('duplicates: identical decks and two versions of one, the older first, kept pairs left out', () => {
  const a = deck('a', [['1', 'x.jpg']], { createdAt: 5 });
  const b = deck('b', [['2', 'x.jpg']], { createdAt: 2 });
  b.cards[0].name = '1';
  const c = deck('c', [['3', 'y.jpg']], { origin: 'a', createdAt: 9 });
  const d = deck('d', [['4', 'z.jpg']], { name: 'Other' });
  const pairs = findDuplicates([a, b, c, d], sameSaved);
  assert.deepEqual(pairs.map((p) => [p.a.id, p.b.id, p.identical]), [
    ['b', 'a', true],
    ['a', 'c', false],
  ]);
  assert.deepEqual(findDuplicates([a, b, c, d], sameSaved, new Set([pairKey('a', 'b')])).map((p) => p.b.id), ['c']);
});
