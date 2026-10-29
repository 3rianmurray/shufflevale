// The Playground's own art (see playground in sandbox.ts), drawn for the app: a chess set (a board and twelve
// pieces, see-through round their edges) and a custom d6's six faces. Copied once into the table pictures' folder
// (where custom art's pictures are kept) and reused after: every piece of a kind shares its picture.
import { File, Paths } from 'expo-file-system';

import { fileOf } from './sampleDeck';
import type { ChessPicture, PlaygroundArt } from './sandbox';
import { importImage, loadSettings, saveSettings } from './storage';

/** Where a table's own pictures are kept (as SandboxTable keeps custom art's). */
const TOKEN_PICTURES = 'tokens';

/** The chess set's pictures, bundled, and their sizes in pixels. */
const CHESS: Record<ChessPicture, { art: number; w: number; h: number }> = {
  board: { art: require('../../assets/chess/board.png'), w: 1112, h: 1123 },
  'white-king': { art: require('../../assets/chess/white-king.png'), w: 230, h: 484 },
  'white-queen': { art: require('../../assets/chess/white-queen.png'), w: 215, h: 438 },
  'white-rook': { art: require('../../assets/chess/white-rook.png'), w: 216, h: 359 },
  'white-bishop': { art: require('../../assets/chess/white-bishop.png'), w: 210, h: 403 },
  'white-knight': { art: require('../../assets/chess/white-knight.png'), w: 246, h: 372 },
  'white-pawn': { art: require('../../assets/chess/white-pawn.png'), w: 200, h: 325 },
  'black-king': { art: require('../../assets/chess/black-king.png'), w: 226, h: 456 },
  'black-queen': { art: require('../../assets/chess/black-queen.png'), w: 215, h: 416 },
  'black-rook': { art: require('../../assets/chess/black-rook.png'), w: 216, h: 353 },
  'black-bishop': { art: require('../../assets/chess/black-bishop.png'), w: 205, h: 386 },
  'black-knight': { art: require('../../assets/chess/black-knight.png'), w: 245, h: 371 },
  'black-pawn': { art: require('../../assets/chess/black-pawn.png'), w: 192, h: 315 },
};

/**
 * The custom d6's faces, 1 to 6 (sword, shield, heal, run, treasure, vortex), and each one's color (the commonest
 * round its edge, as faceArtColor works it out: the stone they're carved in).
 */
const DIE_FACES = [
  require('../../assets/dice/quest-1.png'),
  require('../../assets/dice/quest-2.png'),
  require('../../assets/dice/quest-3.png'),
  require('../../assets/dice/quest-4.png'),
  require('../../assets/dice/quest-5.png'),
  require('../../assets/dice/quest-6.png'),
];
const DIE_COLORS = ['#d7b889', '#d7b888', '#d6b888', '#d7b888', '#d8b888', '#d7b888'];

const exists = (path: string) => new File(Paths.document, path).exists;
const saved = async (art: number) => importImage(TOKEN_PICTURES, await fileOf(art));

/** The Playground's art, saved: as saved before, if it's all still there; otherwise copied in now. */
export async function playgroundArt(): Promise<PlaygroundArt> {
  const kept = loadSettings().playgroundArt;
  const names = Object.keys(CHESS) as ChessPicture[];
  if (kept && names.every((n) => kept.chess[n] && exists(kept.chess[n].image)) && kept.dieFaces.length === DIE_FACES.length && kept.dieFaces.every(exists)) {
    return kept;
  }
  const chess = Object.fromEntries(
    await Promise.all(names.map(async (n) => [n, { image: await saved(CHESS[n].art), w: CHESS[n].w, h: CHESS[n].h }] as const)),
  ) as PlaygroundArt['chess'];
  const art: PlaygroundArt = { chess, dieFaces: await Promise.all(DIE_FACES.map(saved)), dieColors: DIE_COLORS };
  saveSettings({ ...loadSettings(), playgroundArt: art });
  return art;
}
