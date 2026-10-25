// Cards coming into a deck, checked over before they're added (see ImportReview). They're kept as one list of
// pictures in the order they came, and paired into cards from it: every picture a front, or fronts with their
// own backs (scanned front, back, front, back; or all the fronts, then all the backs). Taking one picture out
// pairs the rest again, so a scan missed or taken twice puts every card after it right.

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

/** How many of `count` pictures are fronts. */
export const frontCount = (count: number, pairing: Pairing) => (pairing === 'none' ? count : Math.ceil(count / 2));

/** Where card `i`'s front and back are in a list of `count` pictures. */
function placesOf(i: number, count: number, pairing: Pairing): { frontAt: number; backAt?: number } {
  if (pairing === 'none') return { frontAt: i };
  if (pairing === 'inTurn') return { frontAt: i * 2, ...(i * 2 + 1 < count ? { backAt: i * 2 + 1 } : {}) };
  const fronts = frontCount(count, pairing);
  return { frontAt: i, ...(fronts + i < count ? { backAt: fronts + i } : {}) };
}

/** The pictures as cards. An odd one left over is a front with no back of its own (it has the deck's). */
export function pairUp<T>(pictures: T[], pairing: Pairing): ImportCard<T>[] {
  return Array.from({ length: frontCount(pictures.length, pairing) }, (_, i) => {
    const { frontAt, backAt } = placesOf(i, pictures.length, pairing);
    return { front: pictures[frontAt], frontAt, ...(backAt !== undefined ? { back: pictures[backAt], backAt } : {}) };
  });
}

/** Card `i`'s front and back swapped (for a card scanned back first). */
export function swapSides<T>(pictures: T[], pairing: Pairing, i: number): T[] {
  const { frontAt, backAt } = placesOf(i, pictures.length, pairing);
  if (backAt === undefined) return pictures;
  const out = [...pictures];
  [out[frontAt], out[backAt]] = [out[backAt], out[frontAt]];
  return out;
}

/** What to say about the pairing, if anything's amiss: a front left without a back. */
export function pairingNote(count: number, pairing: Pairing): string | null {
  if (pairing === 'none' || count % 2 === 0) return null;
  return `${count} pictures: the last card has no back of its own, so it gets the deck’s. Take out a picture that shouldn’t be there, or add its back.`;
}
