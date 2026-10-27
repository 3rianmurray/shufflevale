// A photo from the card camera made into a card's picture, as the player says the cards are: a rectangular card
// is found and straightened (as Apple's scanner does, but with its colors as they are), and a card of another
// shape is cut out of its background (scaled into the card's frame, never trimmed).
import { insetQuad, quadSize, uprightCorners } from './cardScan';
import { fitInFrame } from './cardFit';
import { straighten } from './cardWarp';
import type { ScanStart } from './cardWarp';
import { cropToShape, keepOriginal, loadUpright } from './images';
import { cutOut, findCardIn } from './subjectLift';

/** What the cards are: rectangular (`card`: found and straightened), or another shape (`cutOut`). */
export type CardKind = 'card' | 'cutOut';

/** A card's picture from a photo, what it was cut from, and how it was made. */
export interface CapturedCard {
  uri: string;
  original: string;
  /** Straightened (a rectangular card), cut out (another shape), or just trimmed (nothing could be found). */
  how: 'straightened' | 'cutOut' | 'trimmed';
  /**
   * A rectangular card's photo (upright) and the corners it was straightened from (or, none found, a rectangle to
   * start from), to drag into place and straighten again; and the card's shape it came out.
   */
  scan?: ScanStart & { ratio: number };
}

/**
 * A photo made into a card's picture, as `kind` says the card is; a photo with nothing to find is trimmed.
 * `ratioFor` gives the deck's card shape (width over height), given the shape of what was found: for a deck whose
 * size is worked out from its first card, that settles it.
 */
export async function cardFromPhoto(uri: string, ratioFor: (measured: number) => number, kind: CardKind): Promise<CapturedCard> {
  const upright = await loadUpright(uri);
  if (kind === 'card') {
    const found = await findCardIn(upright.uri);
    if (found) {
      const { w, h } = quadSize(found.corners);
      const ratio = ratioFor(w / h);
      const straight = await straighten(upright.uri, uprightCorners(found.corners, ratio), ratio);
      return { uri: straight, original: straight, how: 'straightened', scan: { ...upright, corners: found.corners, found: true, ratio } };
    }
    const ratio = ratioFor(upright.width / upright.height);
    return {
      uri: await cropToShape(upright.uri, ratio),
      original: await keepOriginal(upright.uri),
      how: 'trimmed',
      scan: { ...upright, corners: insetQuad(upright.width, upright.height), found: false, ratio },
    };
  } else {
    const lifted = await cutOut(upright.uri);
    if (lifted) {
      const ratio = ratioFor(lifted.width / lifted.height);
      return { uri: await fitInFrame(lifted.uri, ratio), original: lifted.uri, how: 'cutOut' };
    }
  }
  const ratio = ratioFor(upright.width / upright.height);
  return { uri: await cropToShape(upright.uri, ratio), original: await keepOriginal(upright.uri), how: 'trimmed' };
}
