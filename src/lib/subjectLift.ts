// Cutting the subject out of a picture, as Photos does when a subject is lifted (see modules/subject-lift): for
// cards of odd shapes photographed on a table, and for custom art. Only in the app's own builds from 2.1.0, on
// iOS 17 and later; elsewhere (Expo Go, older iPhones) there's no cutting out, and pictures stay as they are.
import { requireOptionalNativeModule } from 'expo';

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

interface SubjectLiftModule {
  isAvailable(): boolean;
  liftSubject(uri: string): Promise<Lifted | null>;
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
