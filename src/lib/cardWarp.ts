// Straightening a photographed card on the phone: finding it in the photo (see cardScan.ts) and stretching the
// photo so its corners land on a flat card of the deck's shape, drawn with Skia and saved as a JPEG.
//
// Meant to be swapped for Apple's document scanner (VisionKit) once the app has its own builds: that finds and
// straightens the card itself, and the rest of the app only needs a card-shaped picture back.
import { FilterMode, ImageFormat, MipmapMode, Skia } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';

import { findCard, homography, outputSize, quadSize } from './cardScan';
import type { Quad } from './cardScan';
import { newId } from './id';
import { loadUpright, smallPixels } from './images';

/** A photo ready for finding a card in: upright, its size, and where the card's corners seem to be. */
export interface ScanStart {
  uri: string;
  width: number;
  height: number;
  /** The card's corners, in the photo's own pixels (clockwise from top left). */
  corners: Quad;
  /** Whether a card was actually found (otherwise the corners are just a starting rectangle). */
  found: boolean;
  /** None found, so the corners are the picture's own (art that's the card already, edge to edge). */
  whole?: boolean;
}

/** Turns the photo upright and looks for the card in it. */
export async function startScan(uri: string): Promise<ScanStart> {
  const upright = await loadUpright(uri);
  const small = await smallPixels(upright.uri, upright.width);
  const { corners, found } = findCard(small);
  // Found in the small copy: scaled back up to the photo's own pixels.
  const k = upright.width / small.width;
  return { ...upright, corners: corners.map((p) => ({ x: p.x * k, y: p.y * k })) as Quad, found };
}

/**
 * A picture from Photos or Files, ready for its corners to be set: the card found in it, or (none found, as for art
 * that's the card already) as much of the picture as fits the card's shape, in its middle (as the cropper starts),
 * so it isn't stretched. `ratioFor` gives the card's shape (width over height), given the shape of what's found.
 */
export async function startFit(uri: string, ratioFor: (measured: number) => number): Promise<ScanStart> {
  const s = await startScan(uri);
  if (s.found) {
    const { w, h } = quadSize(s.corners);
    ratioFor(w / h);
    return s;
  }
  const { width, height } = s;
  const ratio = ratioFor(width / height);
  const w = Math.min(width, height * ratio);
  const h = w / ratio;
  const x = (width - w) / 2;
  const y = (height - h) / 2;
  return { ...s, whole: true, corners: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] };
}

/**
 * Stretches the photo so `corners` (top left first, clockwise) become the corners of a flat card of the given
 * shape (width over height), and saves it. Returns the new picture's uri.
 */
export async function straighten(uri: string, corners: Quad, cardRatio: number): Promise<string> {
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  if (!image) throw new Error('Could not read the photo');
  const { width, height } = outputSize(corners, cardRatio);
  const surface = Skia.Surface.Make(width, height);
  if (!surface) throw new Error('Could not make the card');
  const canvas = surface.getCanvas();
  canvas.concat(
    Skia.Matrix(
      homography(corners, [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ]),
    ),
  );
  const whole = Skia.XYWHRect(0, 0, image.width(), image.height());
  canvas.drawImageRectOptions(image, whole, whole, FilterMode.Linear, MipmapMode.Linear);
  surface.flush();
  const out = new File(Paths.cache, `card-${newId()}.jpg`);
  out.create();
  out.write(surface.makeImageSnapshot().encodeToBase64(ImageFormat.JPEG, 90), { encoding: 'base64' });
  return out.uri;
}
