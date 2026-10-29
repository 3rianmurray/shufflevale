// The chess set laid out on the Playground (see playground in sandbox.ts): a board and twelve pieces, drawn for the
// app, see-through round their edges. Copied once into the table pictures' folder (where custom art's pictures are
// kept) and reused after: every piece of a kind shares its picture.
import { File, Paths } from 'expo-file-system';

import { fileOf } from './sampleDeck';
import type { ChessArt, ChessPicture } from './sandbox';
import { importImage, loadSettings, saveSettings } from './storage';

/** Where a table's own pictures are kept (as SandboxTable keeps custom art's). */
const TOKEN_PICTURES = 'tokens';

/** Each picture, bundled, and its size in pixels. */
const ART: Record<ChessPicture, { art: number; w: number; h: number }> = {
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

/** The chess set's pictures, saved: those saved before, if they're all still there; otherwise copied in now. */
export async function chessArt(): Promise<ChessArt> {
  const kept = loadSettings().chessArt;
  const names = Object.keys(ART) as ChessPicture[];
  if (kept && names.every((n) => kept[n] && new File(Paths.document, kept[n].image).exists)) return kept;
  const saved = await Promise.all(
    names.map(async (n) => [n, { image: importImage(TOKEN_PICTURES, await fileOf(ART[n].art)), w: ART[n].w, h: ART[n].h }] as const),
  );
  const art = Object.fromEntries(saved) as ChessArt;
  saveSettings({ ...loadSettings(), chessArt: art });
  return art;
}
