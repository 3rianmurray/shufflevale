// Cards coming into a deck, checked over before they're added (see ImportReview). They're kept as one list of
// pictures in the order they came, and paired into cards from it: every picture a front, or fronts with their
// own backs (scanned front, back, front, back; or all the fronts, then all the backs, as from a sheet of fronts
// and a sheet of backs). Taking one picture out pairs the rest again, so a scan missed or taken twice puts every
// card after it right.

/**
 * How the pictures make cards: each a card (with the deck's back), each front followed by its back, or the
 * fronts and then their backs in the same order.
 */
export type Pairing = 'none' | 'inTurn' | 'halves';

export interface ImportCard<T> {
  front: T;
  back?: T;
  /** Where its front and back are in the list of pictures. */
  frontAt: number;
  backAt?: number;
}

/**
 * How many of `count` pictures are fronts. Fronts then backs are half and half (the odd one over a front), unless
 * it's known how many fronts there are (`fronts`: a sheet of fronts, then a sheet of backs, which may not match).
 */
export function frontCount(count: number, pairing: Pairing, fronts?: number): number {
  if (pairing === 'none') return count;
  if (pairing === 'halves' && fronts !== undefined) return Math.min(fronts, count);
  return Math.ceil(count / 2);
}

/** Where card `i`'s front and back are in a list of `count` pictures. */
function placesOf(i: number, count: number, pairing: Pairing, fronts?: number): { frontAt: number; backAt?: number } {
  if (pairing === 'none') return { frontAt: i };
  if (pairing === 'inTurn') return { frontAt: i * 2, ...(i * 2 + 1 < count ? { backAt: i * 2 + 1 } : {}) };
  const n = frontCount(count, pairing, fronts);
  return { frontAt: i, ...(n + i < count ? { backAt: n + i } : {}) };
}

/**
 * The pictures as cards. A front with no back left for it has the deck's back; backs left over with no front
 * (more backs than fronts) aren't used.
 */
export function pairUp<T>(pictures: T[], pairing: Pairing, fronts?: number): ImportCard<T>[] {
  return Array.from({ length: frontCount(pictures.length, pairing, fronts) }, (_, i) => {
    const { frontAt, backAt } = placesOf(i, pictures.length, pairing, fronts);
    return { front: pictures[frontAt], frontAt, ...(backAt !== undefined ? { back: pictures[backAt], backAt } : {}) };
  });
}

/** Card `i`'s front and back swapped (for a card scanned back first). */
export function swapSides<T>(pictures: T[], pairing: Pairing, i: number, fronts?: number): T[] {
  const { frontAt, backAt } = placesOf(i, pictures.length, pairing, fronts);
  if (backAt === undefined) return pictures;
  const out = [...pictures];
  [out[frontAt], out[backAt]] = [out[backAt], out[frontAt]];
  return out;
}

/** How many fronts there are once the picture at `at` is taken out (for a known number of fronts). */
export const frontsAfterRemoving = (fronts: number | undefined, at: number) => (fronts !== undefined && at < fronts ? fronts - 1 : fronts);

/** What to say about the pairing, if anything's amiss: fronts left without a back, or backs left over. */
export function pairingNote(count: number, pairing: Pairing, fronts?: number): string | null {
  if (pairing === 'none') return null;
  const n = frontCount(count, pairing, fronts);
  const backs = count - n;
  if (backs > n) return `${backs - n} more ${backs - n === 1 ? 'back than there are fronts: it isn’t' : 'backs than there are fronts: they aren’t'} used.`;
  if (backs === n) return null;
  const missing = n - backs;
  return fronts === undefined
    ? `${count} pictures: the last card has no back of its own, so it gets the deck’s. Take out a picture that shouldn’t be there, or add its back.`
    : `${missing} ${missing === 1 ? 'card has' : 'cards have'} no back of their own, so ${missing === 1 ? 'it gets' : 'they get'} the deck’s.`;
}
