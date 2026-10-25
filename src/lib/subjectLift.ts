// Cutting the subject out of a picture, as Photos does when a subject is lifted, and finding a card in a photo (see
// modules/subject-lift): for cards of odd shapes photographed on a table, custom art, and the card camera. Only in
// the app's own builds (cutting out from 2.1.0, finding cards from 2.2.0); cutting out needs iOS 17 or later.
// Elsewhere (Expo Go, older builds and iPhones) there's neither, and pictures stay as they are.
import { requireOptionalNativeModule } from 'expo';

import type { Quad } from './cardScan';

/**
 * A subject cut out: a PNG trimmed to it, how much of its own rectangle it fills (near 1 for a plain card), and
 * where it was in the picture (x, y, w, h: shares of the picture's width and height, from the top left).
 */
export interface Lifted {
  uri: string;
  width: number;
  height: number;
  coverage: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A card found in a photo: its corners (in the photo's pixels, clockwise from the top left), and how sure it is. */
export interface FoundCard {
  corners: Quad;
  confidence: number;
}

interface SubjectLiftModule {
  isAvailable(): boolean;
  liftSubject(uri: string): Promise<Lifted | null>;
  /** Missing from 2.1.0's build. */
  findCard?: (uri: string) => Promise<FoundCard | null>;
}

const native = requireOptionalNativeModule<SubjectLiftModule>('SubjectLift');

/** Whether pictures can be cut out here. */
export const canCutOut = () => !!native?.isAvailable();

/** The subject of a picture, cut out; or null if there's no subject to be found (or no cutting out here). */
export async function cutOut(uri: string): Promise<Lifted | null> {
  if (!native?.isAvailable()) return null;
  try {
    return await native.liftSubject(uri);
  } catch {
    return null;
  }
}

/** Whether cards can be found in photos here (the card camera needs it). */
export const canFindCards = () => typeof native?.findCard === 'function';

/** The card in a photo (an upright one), or null if none's found. */
export async function findCardIn(uri: string): Promise<FoundCard | null> {
  if (!native?.findCard) return null;
  try {
    return await native.findCard(uri);
  } catch {
    return null;
  }
}
