// A photo from the card camera made into a card's picture, its shape worked out from the photo itself: a plain
// rectangular card is found and straightened (as Apple's scanner does, but with its colors as they are), and a
// card of another shape is cut out of its background (scaled into the card's frame, never trimmed).
import { quadArea, quadSize, uprightCorners } from './cardScan';
import type { Quad } from './cardScan';
import { fitInFrame } from './cardFit';
import { straighten } from './cardWarp';
import { cropToShape, keepOriginal, loadUpright } from './images';
import { cutOut, findCardIn } from './subjectLift';

/** A card's picture from a photo, what it was cut from, and how it was made. */
export interface CapturedCard {
  uri: string;
  original: string;
  /** Straightened (a rectangular card), cut out (another shape), or just trimmed (nothing could be found). */
  how: 'straightened' | 'cutOut' | 'trimmed';
}

/**
 * What the cards are: worked out from each photo (`auto`), or said outright: rectangular (`card`: found and
 * straightened) or another shape (`cutOut`).
 */
export type CardKind = 'auto' | 'card' | 'cutOut';

/** How sure the rectangle finder must be of a card. */
const MIN_CONFIDENCE = 0.7;
/** The rectangle found must cover the lifted subject to within this much to be the card, rather than part of it. */
const SAME_AREA = 0.15;

/**
 * A photo made into a card's picture. `ratioFor` gives the deck's card shape (width over height), given the shape
 * of what was found: for a deck whose size is worked out from its first card, that settles it. `kind` says what
 * the cards are, or leaves it to the photo (see CardKind); either way, a photo with nothing to find is trimmed.
 */
export async function cardFromPhoto(uri: string, ratioFor: (measured: number) => number, kind: CardKind = 'auto'): Promise<CapturedCard> {
  const upright = await loadUpright(uri);
  // Only what's needed: no cutting out for rectangular cards, no looking for a rectangle in cut-outs.
  const found = kind === 'cutOut' ? null : await findCardIn(upright.uri);
  const lifted = kind === 'card' ? null : await cutOut(upright.uri);
  // Said to be rectangular, whatever's found is taken for the card.
  const card = found && (kind === 'card' || found.confidence >= MIN_CONFIDENCE) ? found.corners : null;
  // The subject's own area, in the photo's pixels, against the rectangle's: about the same, and it's a plain card
  // (a rectangle much smaller is just a part of an odd-shaped one, like its picture's frame).
  const subject = lifted ? lifted.coverage * lifted.w * upright.width * lifted.h * upright.height : 0;
  const coversSubject = (q: Quad) => !lifted || Math.abs(quadArea(q) / subject - 1) <= SAME_AREA;
  if (card && (kind === 'card' || coversSubject(card))) {
    const { w, h } = quadSize(card);
    const ratio = ratioFor(w / h);
    const straight = await straighten(upright.uri, uprightCorners(card, ratio), ratio);
    return { uri: straight, original: straight, how: 'straightened' };
  }
  if (lifted) {
    const ratio = ratioFor(lifted.width / lifted.height);
    return { uri: await fitInFrame(lifted.uri, ratio), original: lifted.uri, how: 'cutOut' };
  }
  const ratio = ratioFor(upright.width / upright.height);
  return { uri: await cropToShape(upright.uri, ratio), original: await keepOriginal(upright.uri), how: 'trimmed' };
}
