// Telling a deck (or table) from a file apart from one already here: the same one by where it came from (its id,
// carried through files: "the id doesn't lie"), or failing that, the same in every way but its id (name, pictures,
// cards, copies, order). And the same between the player's own decks, to find duplicates to merge. Pictures are
// compared by whoever calls (see pictureCompare.ts), so this stays free of files and can be tested.
// (Type imports only, so the tests can run it as it is.)
import type { FilePicture, FileTable, UnpackedDeck } from './deckFile';
import type { BagItem, SandboxCard, SandboxTable, TablePiece } from './sandbox';
import type { Card, Deck } from './types';

/** Which deck (card, table) something is the same one as: where it first came from, or itself if it was made here. */
export const lineage = (x: { id: string; origin?: string }) => x.origin ?? x.id;
/** The same, for a deck or card read from a file (none, for a file from before ids). */
export const fileLineage = (x: { fileId?: string; origin?: string }) => x.origin ?? x.fileId;

/** How many copies (as `copiesOf` in types.ts: missing is 1). */
const copies = (c: { copies?: number }) => (typeof c.copies === 'number' && c.copies > 1 ? Math.min(99, Math.floor(c.copies)) : 1);

/** A deck's contents, to be compared: its pictures of type `P` (a saved path, or a file's picture). */
export interface Contents<P> {
  name: string;
  back: P | null;
  cards: { name: string; copies?: number; image: P; back?: P }[];
}

/** A deck here, as `Contents`. */
export const ownContents = (d: Deck): Contents<string> => ({ name: d.name, back: d.backImage, cards: d.cards });
/** A deck from a file, as `Contents`. */
export const fileContents = (d: UnpackedDeck): Contents<FilePicture> => ({ name: d.name, back: d.back, cards: d.cards });

const sameBack = <A, B>(a: A | null | undefined, b: B | null | undefined, same: (a: A, b: B) => boolean) => (a ? !!b && same(a, b) : !b);

/** Whether two cards are the same: name, copies, picture and own back. */
function sameCard<A, B>(a: Contents<A>['cards'][number], b: Contents<B>['cards'][number], same: (a: A, b: B) => boolean): boolean {
  return a.name === b.name && copies(a) === copies(b) && same(a.image, b.image) && sameBack(a.back, b.back, same);
}

/**
 * Whether two decks are the same in every way that shows: name, back, and each card in order (name, copies,
 * picture, own back). Everything cheap is compared first, so pictures are only looked at when all else matches.
 */
export function sameContents<A, B>(a: Contents<A>, b: Contents<B>, same: (a: A, b: B) => boolean): boolean {
  if (a.name !== b.name || a.cards.length !== b.cards.length || !a.back !== !b.back) return false;
  if (a.cards.some((c, i) => c.name !== b.cards[i].name || copies(c) !== copies(b.cards[i]) || !c.back !== !b.cards[i].back)) return false;
  return sameBack(a.back, b.back, same) && a.cards.every((c, i) => sameCard(c, b.cards[i], same));
}

/** A deck from a file found among those here. */
export interface DeckMatch {
  /** The deck here. */
  deckId: string;
  /** Found by where it came from (`id`), or by being the same in every way (`same`). */
  how: 'id' | 'same';
  /** Nothing about it differs from the one here. */
  identical: boolean;
  /** How many of its cards are new, gone or changed (for one found by id). */
  changed: number;
  /** The file's cards (by their ids in the file) to the deck's own, for a table's cards to point at. */
  cards: Map<string, string>;
}

/** Compares a picture saved here (its path) with one in a file. */
export type SameAsFile = (path: string, picture: FilePicture) => boolean;

/**
 * The deck here a file's deck is (see `DeckMatch`), if any: the one it came from (the latest changed, if several
 * have), or else one the same in every way. Decks in `taken` (already matched to another of the file's) are passed
 * over.
 */
export function matchDeck(u: UnpackedDeck, own: Deck[], same: SameAsFile, taken: Set<string> = new Set()): DeckMatch | null {
  const from = fileLineage(u);
  const kin = from ? own.filter((d) => !taken.has(d.id) && lineage(d) === from).sort((a, b) => b.updatedAt - a.updatedAt)[0] : undefined;
  if (kin) {
    const byLine = new Map(kin.cards.map((c) => [lineage(c), c]));
    const cards = new Map<string, string>();
    const seen = new Set<string>();
    let changed = 0;
    for (const c of u.cards) {
      const line = fileLineage(c);
      const mine = line ? byLine.get(line) : undefined;
      if (!mine || seen.has(mine.id)) {
        changed++;
        continue;
      }
      seen.add(mine.id);
      if (c.fileId) cards.set(c.fileId, mine.id);
      if (!sameCard(mine, c, same)) changed++;
    }
    changed += kin.cards.filter((c) => !seen.has(c.id)).length;
    const inOrder = kin.cards.length === u.cards.length && u.cards.every((c, i) => fileLineage(c) === lineage(kin.cards[i]));
    const identical = !changed && inOrder && kin.name === u.name && sameBack(kin.backImage, u.back, same);
    return { deckId: kin.id, how: 'id', identical, changed, cards };
  }
  const twin = own.find((d) => !taken.has(d.id) && sameContents(ownContents(d), fileContents(u), same));
  if (!twin) return null;
  const cards = new Map(u.cards.flatMap((c, i) => (c.fileId ? [[c.fileId, twin.cards[i].id] as const] : [])));
  return { deckId: twin.id, how: 'same', identical: true, changed: 0, cards };
}

/** The table here a file's table came from, if any (the latest changed, if several have). */
export function matchTable(t: FileTable, own: SandboxTable[], taken: Set<string> = new Set()): string | null {
  if (!t.origin) return null;
  return own.filter((o) => !taken.has(o.id) && lineage(o) === t.origin).sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? null;
}

/**
 * Where each of `from`'s cards goes in `to`, merging the two: the same card by where it came from, else the card at
 * the same place with the same name, else the first with its name not yet taken. Cards with no partner are left out.
 */
export function cardPartners(from: Deck, to: Deck): Map<string, string> {
  const map = new Map<string, string>();
  const taken = new Set<string>();
  const give = (c: Card, partner: Card | undefined) => {
    if (!partner || taken.has(partner.id) || map.has(c.id)) return;
    map.set(c.id, partner.id);
    taken.add(partner.id);
  };
  const byLine = new Map(to.cards.map((c) => [lineage(c), c]));
  for (const c of from.cards) give(c, byLine.get(lineage(c)));
  from.cards.forEach((c, i) => to.cards[i]?.name === c.name && give(c, to.cards[i]));
  for (const c of from.cards) give(c, to.cards.find((p) => p.name === c.name && !taken.has(p.id)));
  return map;
}

/** A table with one deck's cards pointed at another's (see `cardPartners`); cards with no partner are left as they are. */
export function repointTable<T extends Pick<SandboxTable, 'stacks' | 'hands' | 'trash' | 'pieces'>>(t: T, fromDeck: string, toDeck: string, cards: Map<string, string>): T {
  const card = (c: SandboxCard): SandboxCard => {
    const cardId = c.deckId === fromDeck ? cards.get(c.cardId) : undefined;
    return cardId ? { ...c, deckId: toDeck, cardId } : c;
  };
  const item = (i: BagItem): BagItem => (i.card ? { card: card(i.card) } : { piece: piece(i.piece!) });
  const piece = (p: TablePiece): TablePiece => ({
    ...p,
    ...(p.cards ? { cards: p.cards.map(card) } : {}),
    ...(p.items ? { items: p.items.map(item) } : {}),
    ...(p.supply ? { supply: item(p.supply) } : {}),
  });
  return {
    ...t,
    stacks: t.stacks.map((s) => ({ ...s, cards: s.cards.map(card) })),
    hands: t.hands.map((h) => h.map(card)),
    ...(t.trash ? { trash: t.trash.map(card) } : {}),
    ...(t.pieces ? { pieces: t.pieces.map(piece) } : {}),
  };
}

/** Two of the player's decks that are the same one: identical, or two versions of it (from the same place). */
export interface DuplicatePair {
  a: Deck;
  b: Deck;
  identical: boolean;
}

/** A pair's key, the same whichever way round (for pairs the player chose to keep both of). */
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * The player's duplicate decks, in pairs, the older of each first: decks from the same place, or the same in every
 * way (see `sameContents`). Pairs in `kept` (see `pairKey`) are left out.
 */
export function findDuplicates(decks: Deck[], same: (a: string, b: string) => boolean, kept: Set<string> = new Set()): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  const sorted = [...decks].sort((x, y) => x.createdAt - y.createdAt);
  sorted.forEach((a, i) => {
    for (const b of sorted.slice(i + 1)) {
      if (kept.has(pairKey(a.id, b.id))) continue;
      const identical = sameContents(ownContents(a), ownContents(b), same);
      if (identical || lineage(a) === lineage(b)) pairs.push({ a, b, identical });
    }
  });
  return pairs;
}
