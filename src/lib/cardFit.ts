// Fitting a picture to the deck's card shape. A plain picture is trimmed to it from the middle (a card's picture
// is close to its shape, so very little goes). A cut-out (a picture with see-through parts, like a shaped card
// lifted from a photo) is never trimmed or stretched: it's scaled to fit inside the card's frame, the rest of the
// frame left see-through.
import { FilterMode, ImageFormat, MipmapMode, Skia } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';

import { newId } from './id';
import { cropToShape, hasTransparency } from './images';

/** The tallest a fitted cut-out is saved (as cards are: see images.ts). */
const MAX_HEIGHT = 1400;

/** The frame a picture this size fits inside, at the given shape (width over height), no smaller than it. */
export function frameAround(width: number, height: number, ratio: number): { width: number; height: number } {
  return width / height > ratio ? { width, height: width / ratio } : { width: height * ratio, height };
}

/** A cut-out, scaled to fit inside a frame of the card's shape (see-through round it), saved as a PNG. */
export async function fitInFrame(uri: string, ratio: number): Promise<string> {
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  if (!image) throw new Error('Could not read the picture');
  const frame = frameAround(image.width(), image.height(), ratio);
  const k = Math.min(1, MAX_HEIGHT / frame.height);
  const width = Math.max(1, Math.round(frame.width * k));
  const height = Math.max(1, Math.round(frame.height * k));
  const surface = Skia.Surface.Make(width, height);
  if (!surface) throw new Error('Could not make the card');
  const canvas = surface.getCanvas();
  const w = image.width() * k;
  const h = image.height() * k;
  canvas.drawImageRectOptions(
    image,
    Skia.XYWHRect(0, 0, image.width(), image.height()),
    Skia.XYWHRect((width - w) / 2, (height - h) / 2, w, h),
    FilterMode.Linear,
    MipmapMode.Linear,
  );
  surface.flush();
  const out = new File(Paths.cache, `card-${newId()}.png`);
  out.create();
  out.write(surface.makeImageSnapshot().encodeToBase64(ImageFormat.PNG, 100), { encoding: 'base64' });
  return out.uri;
}

/** A picture fitted to the card's shape: a cut-out scaled into the frame, anything else trimmed to it. */
export async function fitToCard(uri: string, ratio: number): Promise<string> {
  return (await hasTransparency(uri)) ? fitInFrame(uri, ratio) : cropToShape(uri, ratio);
}
