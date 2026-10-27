// Deck files: one or more decks, pictures and all, their groups, and any tables laid out with them, in a single
// file to back up, move to another phone, or give to a friend. A zip (from version 2): what's in it as JSON
// (`MANIFEST`), and each picture as it is, beside it (see `picturePath`), so a file of any size can be written and
// read a picture at a time. Older files are plain JSON with the pictures inside (as base64), and still open. Only
// the packing and unpacking is here; reading and writing the files is in deckExport.ts (and zip.ts).
import type { DeckGroup } from './groups';
import type { BagItem, PieceKind, PieceShape, SandboxCard, SandboxStack, SandboxTable, TablePiece, ZoneLook } from './sandbox';
import type { CardShape, Deck, PlayMode } from './types';

/** Marks a file as ours, and which version of the format it's in (1: JSON, 2: a zip). */
const KIND = 'shufflevale-decks';
const VERSION = 2;

/** What's in a zipped file, as JSON: a `DeckFile`, its pictures' bytes beside it. */
export const MANIFEST = 'shufflevale.json';

/** Where a picture's bytes are in a zipped file. */
export const picturePath = (key: string, ext: string) => `pictures/${key}.${ext}`;

/** A picture in the file: its type (from the file name it had), and in older files its bytes, as base64. */
interface FileImage {
  ext: string;
  data?: string;
}

/**
 * A picture read back from a file, ready to be saved: its type, and its bytes as base64 (an older file's), or a
 * way to read them (a zipped file's, named for where they are in it).
 */
export type FilePicture = { ext: string; data: string } | { ext: string; name: string; bytes: () => Uint8Array };

/** A picture's bytes, to be saved: as base64, or as they are. */
export const pictureData = (p: FilePicture): string | Uint8Array => ('data' in p ? p.data : p.bytes());

/** What tells one picture from another (the same for two cards using the same one). */
export const pictureId = (p: FilePicture) => ('data' in p ? p.data : p.name);

/** A group in a file: its decks say they're in it. Where it lies among the decks is by their ids in the file. */
type FileGroup = Pick<DeckGroup, 'id' | 'name' | 'collapsed' | 'before'>;

interface FileCard {
  /** The card's id, for a table's cards to point at (files from before tables had none). */
  id?: string;
  name: string;
  copies?: number;
  /** Key into the file's `images`. */
  image: string;
  /** Its own back, for a two-sided card (key into `images`). */
  back?: string;
}

interface FileDeck {
  /** The deck's id, for a table's cards to point at (files from before tables had none). */
  id?: string;
  name: string;
  cardShape?: CardShape;
  roundness?: number;
  playMode?: PlayMode;
  /** Key into the file's `images`, or null for the built-in back. */
  back: string | null;
  cards: FileCard[];
  /** The id of the group it's in, among the file's `groups`. */
  group?: string;
}

/**
 * Which part of a file saved in parts it is (one too big to be a single file: see `planParts`): the nth of `of`,
 * every part sharing `set`. Written first in the file, so it can be read without reading the rest.
 */
export interface FilePart {
  n: number;
  of: number;
  set: string;
}

export interface DeckFile {
  part?: FilePart;
  kind: typeof KIND;
  version: number;
  decks: FileDeck[];
  /** Each picture once, even if several cards (or decks) use it. */
  images: Record<string, FileImage>;
  /** Tables, as they lie, their cards pointing at the file's decks and cards by id (older files have none). */
  tables?: FileTable[];
  /** The decks' groups, in order (older files have none). */
  groups?: FileGroup[];
}

/**
 * A table in a file: everything but its own id and dates. Its cards point at the file's decks and cards, and its
 * pieces' pictures (tokens, custom art) are keys into the file's `images`.
 */
export type FileTable = Omit<SandboxTable, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * A file's contents, read back: its decks, and its tables (their cards still pointing at the file's ids, their
 * pieces' pictures at `images`).
 */
export interface UnpackedFile {
  /** For a file saved in parts (as big backups were, briefly), which one this is. */
  part?: FilePart;
  decks: UnpackedDeck[];
  tables: FileTable[];
  /** The decks' groups, in order: each with at least one of its decks. */
  groups: UnpackedGroup[];
  /** The pictures the tables' pieces use, by key. */
  images: Record<string, FilePicture>;
}

/** A group read back from a file: its id in the file (which its decks' `fileGroup` is), and the deck it lies above. */
export interface UnpackedGroup {
  fileId: string;
  name: string;
  collapsed?: boolean;
  /** The file's id for the deck it lies just above (see `DeckGroup.before`). */
  before?: string;
}

/** A deck read back from a file, ready to be added: its pictures still to be written out. */
export interface UnpackedDeck {
  /** Its id in the file, which a table's cards point at. */
  fileId?: string;
  name: string;
  cardShape?: CardShape;
  roundness?: number;
  playMode?: PlayMode;
  back: FilePicture | null;
  cards: { fileId?: string; name: string; copies?: number; image: FilePicture; back?: FilePicture }[];
  /** The group it's in (its `fileId`, among the file's groups). */
  fileGroup?: string;
}

/** The type of a picture, from its saved path (e.g. `decks/abc/123.png` is png). */
export function extOf(path: string): string {
  return path.match(/\.(\w{2,5})$/)?.[1]?.toLowerCase() ?? 'jpg';
}

/** A picture to go in a zipped file: where it is in the file, and where it's saved (its path, as on a card). */
export interface PackedPicture {
  name: string;
  path: string;
}

/**
 * Packs decks, any tables, and the decks' groups into what's in a zipped file: its `DeckFile` (as `MANIFEST`), and
 * the pictures to go beside it. A table's decks must be among `decks` (see `decksOnTable`); only groups some of
 * the decks are in go in.
 */
export function packManifest(decks: Deck[], tables: SandboxTable[] = [], groups: DeckGroup[] = []): { file: DeckFile; pictures: PackedPicture[] } {
  const images: Record<string, FileImage> = {};
  const pictures: PackedPicture[] = [];
  const keys = new Map<string, string>();
  const keyOf = (path: string) => {
    const known = keys.get(path);
    if (known) return known;
    const key = `i${keys.size + 1}`;
    const ext = extOf(path);
    keys.set(path, key);
    images[key] = { ext };
    pictures.push({ name: picturePath(key, ext), path });
    return key;
  };
  // A piece's picture, and those of the pieces in a bag, go in the file with the cards'.
  const packItem = (i: BagItem): BagItem => (i.piece ? { piece: packPiece(i.piece) } : i);
  const packPiece = (p: TablePiece): TablePiece => ({
    ...p,
    ...(p.image ? { image: keyOf(p.image) } : {}),
    // A die's or coin's own face art too.
    ...(p.faces ? { faces: p.faces.map((f) => (f ? keyOf(f) : null)) } : {}),
    ...(p.items ? { items: p.items.map(packItem) } : {}),
    ...(p.supply ? { supply: packItem(p.supply) } : {}),
  });
  const ids = new Set(decks.map((d) => d.id));
  const used = groups.filter((g) => decks.some((d) => d.groupId === g.id));
  const inFile = new Set(used.map((g) => g.id));
  const file: DeckFile = {
    kind: KIND,
    version: VERSION,
    decks: decks.map((d) => ({
      id: d.id,
      name: d.name,
      ...(d.cardShape ? { cardShape: d.cardShape } : {}),
      ...(d.roundness !== undefined ? { roundness: d.roundness } : {}),
      ...(d.playMode ? { playMode: d.playMode } : {}),
      back: d.backImage ? keyOf(d.backImage) : null,
      cards: d.cards.map((c) => ({
        id: c.id,
        name: c.name,
        ...(c.copies ? { copies: c.copies } : {}),
        image: keyOf(c.image),
        ...(c.back ? { back: keyOf(c.back) } : {}),
      })),
      ...(d.groupId && inFile.has(d.groupId) ? { group: d.groupId } : {}),
    })),
    images,
    ...(tables.length
      ? { tables: tables.map(({ id: _id, createdAt: _c, updatedAt: _u, ...t }) => (t.pieces ? { ...t, pieces: t.pieces.map(packPiece) } : t)) }
      : {}),
    ...(used.length
      ? {
          groups: used.map((g) => ({
            id: g.id,
            name: g.name,
            ...(g.collapsed ? { collapsed: true } : {}),
            ...(g.before && ids.has(g.before) ? { before: g.before } : {}),
          })),
        }
      : {}),
  };
  return { file, pictures };
}

/**
 * Packs decks, and any tables, into an older (version 1) file: plain JSON, the pictures in it as base64 (`read`
 * gives a saved picture's, by its path). Only made now to check older files still open.
 */
export function packDecks(decks: Deck[], read: (path: string) => string, tables: SandboxTable[] = []): DeckFile {
  const { file, pictures } = packManifest(decks, tables);
  const paths = new Map(pictures.map((p) => [p.name, p.path]));
  const images = Object.fromEntries(Object.entries(file.images).map(([key, { ext }]) => [key, { ext, data: read(paths.get(picturePath(key, ext))!) }]));
  return { ...file, version: 1, images };
}

/** A file's part, if it's one, from the start of its text (see `FilePart`), or null. */
export function partFromHead(head: string): FilePart | null {
  const found = head.match(/^\s*\{\s*"part"\s*:\s*(\{[^{}]*\})/);
  if (!found) return null;
  try {
    return partFrom(JSON.parse(found[1]));
  } catch {
    return null;
  }
}

/** The most parts a file can be saved in. */
const MAX_PARTS = 999;

function partFrom(v: unknown): FilePart | null {
  if (!isObject(v)) return null;
  const { n, of } = v;
  const set = idFrom(v.set);
  if (!Number.isInteger(n) || !Number.isInteger(of) || !set) return null;
  return (n as number) >= 1 && (n as number) <= (of as number) && (of as number) <= MAX_PARTS ? { n: n as number, of: of as number, set } : null;
}

/** Each deck's cards, by their ids in the file, for a table's cards to be checked against. */
export function cardsByDeck(decks: UnpackedDeck[]): Map<string, Set<string>> {
  const known = new Map<string, Set<string>>();
  for (const d of decks) {
    if (d.fileId) known.set(d.fileId, new Set(d.cards.flatMap((c) => (c.fileId ? [c.fileId] : []))));
  }
  return known;
}

/** The cards in a bag (and in the bags in it), its supply's too. */
function bagCards(p: TablePiece): SandboxCard[] {
  const items = [...(p.items ?? (p.cards ?? []).map((card) => ({ card }))), ...(p.supply ? [p.supply] : [])];
  return items.flatMap((i) => (i.card ? [i.card] : i.piece ? bagCards(i.piece) : []));
}

/** The ids of the decks a table's cards come from (on it, in its hands, its trash and its bags). */
export function deckIdsOn(table: Pick<SandboxTable, 'stacks' | 'hands' | 'trash' | 'pieces'>): Set<string> {
  const cards = [...table.stacks.flatMap((s) => s.cards), ...table.hands.flat(), ...(table.trash ?? []), ...(table.pieces ?? []).flatMap(bagCards)];
  return new Set(cards.map((c) => c.deckId));
}

/** The decks a table's cards come from, in the order given. */
export function decksOnTable(table: SandboxTable, decks: Deck[]): Deck[] {
  const used = deckIdsOn(table);
  return decks.filter((d) => used.has(d.id));
}

/** Thrown for a file that isn't a deck file, or is damaged; its message is fit to show the player. */
export class DeckFileError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// What a file may hold. Anyone can send a deck file, so nothing in one is trusted: these keep a damaged or
// made-up file from breaking the app (a million copies of a card, a picture too big to draw, a nonsense size).
/** The most copies of a card (as `MAX_COPIES` in types.ts). */
const MAX_COPIES = 99;
/** The roundest corners can be (as `MAX_ROUNDNESS` in types.ts). */
const MAX_ROUNDNESS = 0.25;
/** The longest a name can be (as `MAX_NAME_LENGTH` in names.ts). */
const MAX_NAME = 60;
/** The biggest a single picture in a file can be (15 MB), and the same as base64. */
const MAX_IMAGE_BYTES = 15_000_000;
const MAX_IMAGE_CHARS = 20_000_000;
/** Picture types the app can show. */
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'heic', 'webp']);

/** The most pixels a picture's side can have: far sharper than any phone shows a card, and safe to draw. */
const MAX_IMAGE_SIDE = 6000;

/**
 * A picture's size in pixels, read from the start of its base64 (a PNG's header, or a JPEG's frame marker), or
 * null if it can't be told from there.
 */
export function imagePixels(base64: string): { w: number; h: number } | null {
  try {
    const head = atob(base64.slice(0, 262_144).replace(/=+$/, '').slice(0, Math.floor(Math.min(base64.length, 262_144) / 4) * 4));
    return pixelsOf(Uint8Array.from(head, (ch) => ch.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** How much of a picture's start `pixelsOf` needs (a JPEG's frame marker can come after a big thumbnail). */
export const PICTURE_HEAD = 196_608;

/** A picture's size in pixels, from its first bytes (see `imagePixels`), or null if it can't be told from them. */
export function pixelsOf(bytes: Uint8Array): { w: number; h: number } | null {
  const u16 = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  const u32 = (i: number) => ((bytes[i] << 24) >>> 0) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
  // PNG: the header chunk comes first.
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes.length >= 24) return { w: u32(16), h: u32(20) };
  // JPEG: walk the markers to a start-of-frame.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let i = 2; i + 9 < bytes.length; ) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: u16(i + 7), h: u16(i + 5) };
      }
      i += 2 + u16(i + 2);
    }
  }
  return null;
}

/**
 * Checks a picture in a zipped file, from its first bytes (see `PICTURE_HEAD`) and its size: throws a
 * DeckFileError if it's too big to open.
 */
export function checkPicture(head: Uint8Array, size: number) {
  const pixels = pixelsOf(head);
  if (size > MAX_IMAGE_BYTES || (pixels && Math.max(pixels.w, pixels.h) > MAX_IMAGE_SIDE)) {
    throw new DeckFileError('This deck file has a picture that’s too big to open.');
  }
}

const nameFrom =(v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_NAME).trim() : fallback);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** A card size from a file, if it's one the app knows; anything else is left out (the deck is standard size). */
function shapeFrom(v: unknown, nested = false): CardShape | undefined {
  if (!isObject(v)) return undefined;
  const landscape = v.landscape === true ? { landscape: true } : {};
  if (v.kind === 'standard' || v.kind === 'usMini') return { kind: v.kind, ...landscape };
  if (v.kind === 'custom' && positive(v.width) && positive(v.height)) {
    const unit = v.unit === 'in' || v.unit === 'mm' ? { unit: v.unit as 'in' | 'mm' } : {};
    return { kind: 'custom', width: v.width, height: v.height, ...unit };
  }
  if (v.kind === 'auto' && !nested) {
    const detected = shapeFrom(v.detected, true);
    return detected && detected.kind !== 'auto' ? { kind: 'auto', detected } : { kind: 'auto' };
  }
  return undefined;
}

/** Reads a deck file's contents back into decks (see `unpackFile` for its tables too). */
export const unpackDecks = (text: string): UnpackedDeck[] => unpackFile(text).decks;

/** A file's JSON, if it's a Shufflevale file one this version can read. */
function fileFrom(text: string): Record<string, unknown> {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new DeckFileError("This file isn't a Shufflevale deck.");
  }
  if (!isObject(file) || file.kind !== KIND) throw new DeckFileError("This file isn't a Shufflevale deck.");
  if (typeof file.version !== 'number' || file.version > VERSION) {
    throw new DeckFileError('This deck was saved by a newer version of Shufflevale. Update the app to open it.');
  }
  return file;
}

const missingPictures = () => new DeckFileError('This deck file is damaged: some of its pictures are missing.');

/** A picture's type from a file, if it's one the app can show. */
function extFrom(found: Record<string, unknown>): string {
  if (typeof found.ext !== 'string') throw missingPictures();
  const ext = found.ext.toLowerCase();
  if (!IMAGE_EXTS.has(ext)) throw new DeckFileError('This deck file has a picture Shufflevale can’t show.');
  return ext;
}

/**
 * Reads an older (JSON) deck file's contents back into decks, groups and tables. Throws a DeckFileError if it isn't
 * one, or can't be read. For a part of a file saved in parts, `earlier` gives the decks of its other parts (see
 * `cardsByDeck`), which its tables' cards can come from too.
 */
export function unpackFile(text: string, earlier?: Map<string, Set<string>>): UnpackedFile {
  const file = fileFrom(text);
  const images = isObject(file.images) ? file.images : {};
  return unpackWith(
    file,
    (key) => {
      const found = images[key];
      if (!isObject(found) || typeof found.data !== 'string' || !found.data) throw missingPictures();
      const ext = extFrom(found);
      const pixels = imagePixels(found.data);
      if (found.data.length > MAX_IMAGE_CHARS || (pixels && Math.max(pixels.w, pixels.h) > MAX_IMAGE_SIDE)) {
        throw new DeckFileError('This deck file has a picture that’s too big to open.');
      }
      return { ext, data: found.data };
    },
    earlier,
  );
}

/**
 * Reads a zipped deck file's `MANIFEST` back into decks, groups and tables. `picture` gives a picture in the zip,
 * by where it is (see `picturePath`), checked (see `checkPicture`); it throws a DeckFileError if it's missing or
 * unsound, as this does if the file isn't one or can't be read.
 */
export function unpackManifest(text: string, picture: (name: string, ext: string) => FilePicture): UnpackedFile {
  const file = fileFrom(text);
  const images = isObject(file.images) ? file.images : {};
  return unpackWith(file, (key) => {
    const found = images[key];
    if (!isObject(found)) throw missingPictures();
    const ext = extFrom(found);
    return picture(picturePath(key, ext), ext);
  });
}

/** The most groups a file is opened with. */
const MAX_GROUPS = 200;

/** A file's decks, groups and tables, checked; `picture` gives its pictures, by key, checked. */
function unpackWith(file: Record<string, unknown>, picture: (key: string) => FilePicture, earlier?: Map<string, Set<string>>): UnpackedFile {
  // Each picture checked once, however many cards use it.
  const checked = new Map<string, FilePicture>();
  const image = (key: unknown): FilePicture => {
    if (typeof key !== 'string' || !key) throw missingPictures();
    if (!checked.has(key)) checked.set(key, picture(key));
    return checked.get(key)!;
  };
  // A table's file may hold no decks at all (a table of just components); otherwise it needs some.
  const hasTables = Array.isArray(file.tables) && file.tables.length > 0;
  // Groups, once: only those some deck is in are kept (below).
  const allGroups = new Map<string, UnpackedGroup>();
  for (const g of Array.isArray(file.groups) ? file.groups.slice(0, MAX_GROUPS) : []) {
    const id = isObject(g) ? idFrom(g.id) : undefined;
    if (!isObject(g) || !id || allGroups.has(id)) continue;
    const before = idFrom(g.before);
    allGroups.set(id, { fileId: id, name: nameFrom(g.name, 'Group'), ...(g.collapsed === true ? { collapsed: true } : {}), ...(before ? { before } : {}) });
  }
  if (!Array.isArray(file.decks) || (!file.decks.length && !hasTables)) throw new DeckFileError('This file has no decks in it.');
  const decks: UnpackedDeck[] = file.decks.map((d: unknown) => {
    if (!isObject(d) || !Array.isArray(d.cards)) throw new DeckFileError('This deck file is damaged.');
    const group = idFrom(d.group);
    return {
      ...(idFrom(d.id) ? { fileId: idFrom(d.id) } : {}),
      name: nameFrom(d.name, 'Imported deck'),
      ...(shapeFrom(d.cardShape) ? { cardShape: shapeFrom(d.cardShape) } : {}),
      ...(typeof d.roundness === 'number' && Number.isFinite(d.roundness)
        ? { roundness: Math.min(MAX_ROUNDNESS, Math.max(0, d.roundness)) }
        : {}),
      ...(d.playMode === 'table' || d.playMode === 'reveal' ? { playMode: d.playMode } : {}),
      back: d.back ? image(d.back) : null,
      cards: d.cards.map((c: unknown, i: number) => {
        if (!isObject(c)) throw new DeckFileError('This deck file is damaged.');
        const copies = typeof c.copies === 'number' && c.copies >= 2 ? Math.min(MAX_COPIES, Math.floor(c.copies)) : undefined;
        return {
          ...(idFrom(c.id) ? { fileId: idFrom(c.id) } : {}),
          name: nameFrom(c.name, `Card ${i + 1}`),
          ...(copies ? { copies } : {}),
          image: image(c.image),
          ...(c.back ? { back: image(c.back) } : {}),
        };
      }),
      ...(group && allGroups.has(group) ? { fileGroup: group } : {}),
    };
  });
  // Each kept group lies above a deck of the file's, or none.
  const deckIds = new Set(decks.flatMap((d) => (d.fileId ? [d.fileId] : [])));
  const groups = [...allGroups.values()]
    .filter((g) => decks.some((d) => d.fileGroup === g.fileId))
    .map(({ before, ...g }) => (before && deckIds.has(before) ? { ...g, before } : g));
  // Tables: only cards from the file's own decks (and its other parts') are kept.
  const known = new Map([...(earlier ?? []), ...cardsByDeck(decks)]);
  // A piece's picture: kept if it's a sound one (a damaged one is just left off the piece, as it isn't a card).
  const tableImages: Record<string, FilePicture> = {};
  const pieceImage = (key: string) => {
    if (tableImages[key]) return key;
    try {
      tableImages[key] = image(key);
      return key;
    } catch {
      return undefined;
    }
  };
  const tables = hasTables ? (file.tables as unknown[]).slice(0, MAX_TABLES).flatMap((t) => tableFrom(t, known, pieceImage)) : [];
  const part = partFrom(file.part);
  return { ...(part ? { part } : {}), decks, tables, groups, images: tableImages };
}

/** The most tables a file is opened with, and the most cards each can hold (as `MAX_TABLE_CARDS` in sandbox.ts). */
const MAX_TABLES = 50;
const MAX_TABLE_CARDS = 1000;
/** Hands a table has (as `HAND_COUNT` in sandbox.ts), and the grid sizes it can have (as `GRID_SIZES`). */
const HANDS = 4;
const GRID_STEPS = [20, 40, 60];

const idFrom = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : undefined);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** How much bigger or smaller a card or piece can be drawn (as SCALE_MIN and SCALE_MAX in sandbox.ts). */
const SCALE_MIN = 0.1;
const SCALE_MAX = 4;
/** A scale from a file, kept to what the app allows; none for its own size. */
const scaleFrom = (v: unknown) => (finite(v) && v > 0 && Math.abs(v - 1) >= 0.005 ? { scale: Math.min(SCALE_MAX, Math.max(SCALE_MIN, v)) } : {});

// What a table's pieces can be (as in sandbox.ts).
const PIECE_KINDS = new Set<PieceKind>(['counter', 'die', 'coin', 'text', 'marker', 'spinner', 'meeple', 'token', 'timer', 'zone', 'spot', 'bag', 'track', 'art', 'score']);
/** A score pad's most players (as SCORE_MAX_PLAYERS), the most points written down, and the biggest any can be. */
const SCORE_MAX_PLAYERS = 6;
const MAX_SCORES = 2000;
const MAX_POINTS = 1_000_000;
const PIECE_SHAPES = new Set<PieceShape>(['meeple', 'pawn', 'cube', 'disc']);
const ZONE_LOOKS = new Set<ZoneLook>(['outline', 'filled', 'dashed']);
const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100];
/** The most pieces a table is opened with, the most custom art (as ART_MAX), and a track's spaces (as TRACK_MAX). */
const MAX_PIECES = 500;
const ART_MAX = 40;
const TRACK_MAX = 50;
/** The longest a piece's words can be, and the biggest its own size (twice the table's width, as TABLE_W). */
const MAX_LABEL = 500;
const MAX_PIECE_SIDE = 7200;
/** The longest a timer can be set for (as TIMER_MAX). */
const TIMER_MAX = 99 * 60 + 59;
/** How deep bags in bags go. */
const MAX_BAG_DEPTH = 3;

const color = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : undefined);
const angleFrom = (v: number) => {
  const r = ((((v + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
};

/**
 * A piece from a file, checked: a kind the app has, a place on the table, and only the settings that make sense
 * for it (its picture, a key into the file's pictures, kept if it's sound). A bag's cards and pieces come too.
 * Running timers come paused, at their full time (the time they'd have run out is the sender's).
 */
function pieceFrom(
  v: unknown,
  card: (c: unknown) => SandboxCard[],
  pictureKey: (key: string) => string | undefined,
  depth = 0,
): TablePiece[] {
  if (!isObject(v) || typeof v.kind !== 'string' || !PIECE_KINDS.has(v.kind as PieceKind) || !finite(v.x) || !finite(v.y)) return [];
  // A zone cards snapped into, from before there were card spots: one.
  const kind = v.kind === 'zone' && v.snap === true ? 'spot' : (v.kind as PieceKind);
  const p: TablePiece = { id: idFrom(v.id) ?? '', kind, x: v.x, y: v.y, value: finite(v.value) ? v.value : 0 };
  if (kind === 'die') {
    p.sides = DIE_SIDES.includes(v.sides as number) ? (v.sides as number) : 6;
    p.value = Math.min(p.sides, Math.max(1, Math.round(p.value)));
  }
  if (typeof v.label === 'string') p.label = v.label.slice(0, MAX_LABEL);
  if (typeof v.shape === 'string' && PIECE_SHAPES.has(v.shape as PieceShape)) p.shape = v.shape as PieceShape;
  if (typeof v.look === 'string' && ZONE_LOOKS.has(v.look as ZoneLook)) p.look = v.look as ZoneLook;
  const over = idFrom(v.over);
  if (over) p.over = over;
  if (finite(v.angle)) p.angle = angleFrom(v.angle);
  const picture = typeof v.image === 'string' ? pictureKey(v.image) : undefined;
  if (picture) p.image = picture;
  // A die's or coin's own face art: one picture (or standard, null) per face, as many as it has (see faceCount), and
  // each one's color.
  // (Only a six-sided die and a coin take any, as in faceCount.)
  const faceSlots = kind === 'coin' ? 2 : kind === 'die' && p.sides === 6 ? 6 : 0;
  const given: unknown[] = Array.isArray(v.faces) ? v.faces : [];
  const tints: unknown[] = Array.isArray(v.faceColors) ? v.faceColors : [];
  if (faceSlots && given.length) {
    const faces = Array.from({ length: faceSlots }, (_, i) => {
      const key = given[i];
      return typeof key === 'string' ? (pictureKey(key) ?? null) : null;
    });
    if (faces.some(Boolean)) {
      p.faces = faces;
      const faceColors = faces.map((f, i) => (f ? (color(tints[i]) ?? null) : null));
      if (faceColors.some(Boolean)) p.faceColors = faceColors;
    }
  }
  for (const flag of ['square', 'grid', 'labelBelow', 'hideNumbers', 'locked', 'vertical', 'reversed', 'rollInPlace'] as const) if (v[flag] === true) p[flag] = true;
  if (v.labelAlign === 'left' || v.labelAlign === 'center' || v.labelAlign === 'right') p.labelAlign = v.labelAlign;
  if (kind === 'score') {
    // Its players (named, up to the most a pad has), and the points written down for them.
    const names = Array.isArray(v.names) ? v.names.slice(0, SCORE_MAX_PLAYERS).map((n, i) => nameFrom(n, `Player ${i + 1}`)) : [];
    p.names = names.length ? names : ['Player 1', 'Player 2'];
    // How many rows of points it shows (as SCORE_ROWS_MIN to SCORE_ROWS_MAX).
    if (finite(v.rows)) p.rows = Math.min(30, Math.max(2, Math.round(v.rows)));
    const players = p.names.length;
    p.scores = (Array.isArray(v.scores) ? v.scores.slice(0, MAX_SCORES) : []).flatMap((s) =>
      isObject(s) && Number.isInteger(s.player) && (s.player as number) >= 0 && (s.player as number) < players && finite(s.points) && Math.abs(s.points) <= MAX_POINTS
        ? [{ player: s.player as number, points: Math.round(s.points) }]
        : [],
    );
  }
  if (finite(v.left) && v.left >= 0) p.left = Math.min(TIMER_MAX, v.left);
  if (positive(v.w)) p.w = Math.min(MAX_PIECE_SIDE, v.w);
  if (positive(v.h)) p.h = Math.min(MAX_PIECE_SIDE, v.h);
  if (finite(v.spaces)) p.spaces = Math.min(TRACK_MAX, Math.max(2, Math.round(v.spaces)));
  if (v.first === 0 || v.first === 1) p.first = v.first;
  const own = color(v.color);
  if (own) p.color = own;
  const marker = color(v.markerColor);
  if (marker) p.markerColor = marker;
  Object.assign(p, scaleFrom(v.scale));
  if (kind === 'bag') {
    const item = (i: unknown): BagItem[] => {
      if (!isObject(i)) return [];
      if (i.card) return card(i.card).map((c) => ({ card: c }));
      return depth < MAX_BAG_DEPTH ? pieceFrom(i.piece, card, pictureKey, depth + 1).map((piece) => ({ piece })) : [];
    };
    // Bags from before they held pieces too: their cards.
    const items = Array.isArray(v.items) ? v.items.flatMap(item) : Array.isArray(v.cards) ? v.cards.flatMap(card).map((c) => ({ card: c })) : [];
    if (items.length) p.items = items;
    const [supply] = item(v.supply);
    if (supply) p.supply = supply;
  }
  return [p];
}

/**
 * A table from a file, checked: only its cards from the file's own decks, up to the most a table holds; positions
 * and settings only where they make sense; its pieces as `pieceFrom` reads them. Its cards still point at the
 * file's ids, and its pieces' pictures at the file's (see `remapTable`).
 */
function tableFrom(v: unknown, known: Map<string, Set<string>>, pictureKey: (key: string) => string | undefined): FileTable[] {
  if (!isObject(v) || !Array.isArray(v.stacks)) return [];
  let count = 0;
  const card = (c: unknown): SandboxCard[] => {
    if (count >= MAX_TABLE_CARDS || !isObject(c) || typeof c.deckId !== 'string' || typeof c.cardId !== 'string') return [];
    if (!known.get(c.deckId)?.has(c.cardId)) return [];
    count++;
    return [
      {
        iid: '',
        deckId: c.deckId,
        cardId: c.cardId,
        faceUp: c.faceUp === true,
        ...(c.solo === true ? { solo: true } : {}),
        ...(c.single === true ? { single: true } : {}),
        ...scaleFrom(c.scale),
      },
    ];
  };
  const cards = (list: unknown) => (Array.isArray(list) ? list.flatMap(card) : []);
  const stacks: SandboxStack[] = v.stacks.flatMap((s: unknown) => {
    if (!isObject(s) || !finite(s.x) || !finite(s.y)) return [];
    const inStack = cards(s.cards);
    if (!inStack.length) return [];
    // Its id from the file, which custom art lying over it points at (a new one's given as it's added).
    return [{ id: idFrom(s.id) ?? '', x: s.x, y: s.y, angle: finite(s.angle) ? s.angle : 0, cards: inStack, ...(s.locked === true ? { locked: true } : {}) }];
  });
  let art = 0;
  const pieces = (Array.isArray(v.pieces) ? v.pieces.slice(0, MAX_PIECES) : [])
    .flatMap((p) => pieceFrom(p, card, pictureKey))
    .filter((p) => p.kind !== 'art' || ++art <= ART_MAX);
  const hands = Array.from({ length: HANDS }, (_, i) => cards(Array.isArray(v.hands) ? v.hands[i] : undefined));
  const handNames = Array.from({ length: HANDS }, (_, i) => nameFrom(Array.isArray(v.handNames) ? v.handNames[i] : undefined, `Hand ${i + 1}`));
  const trash = cards(v.trash);
  const flag = (key: string) => (v[key] === true ? { [key]: true } : {});
  const cam = isObject(v.camera) ? v.camera : {};
  const camera = finite(cam.a) && finite(cam.b) && finite(cam.tx) && finite(cam.ty) ? { camera: { a: cam.a, b: cam.b, tx: cam.tx, ty: cam.ty } } : {};
  const area = isObject(v.focus) ? v.focus : {};
  const focus = finite(area.x) && finite(area.y) && finite(area.w) && finite(area.h) ? { focus: { x: area.x, y: area.y, w: area.w, h: area.h } } : {};
  return [
    {
      name: nameFrom(v.name, 'Imported table'),
      stacks,
      hands,
      handNames,
      ...(trash.length ? { trash } : {}),
      ...(typeof v.background === 'string' && v.background.length <= 20 ? { background: v.background } : {}),
      ...(typeof v.gridStep === 'number' && GRID_STEPS.includes(v.gridStep) ? { gridStep: v.gridStep } : {}),
      ...flag('snapToGrid'),
      ...flag('lockCamera'),
      ...flag('showGrid'),
      ...flag('hideCounts'),
      ...flag('hideHands'),
      ...(pieces.length ? { pieces } : {}),
      ...camera,
      ...focus,
    },
  ];
}

/** Where a file's decks went once added: each deck's new id, and its cards' new ids, by their ids in the file. */
export type DeckIdMap = Map<string, { id: string; cards: Map<string, string> }>;

/**
 * A table from a file pointed at its decks as they were added (see `DeckIdMap`), with fresh ids for its stacks,
 * cards and pieces from `ids`. Cards whose deck or card didn't come through are left out. Its pieces' pictures
 * become saved ones through `picture` (given a key into the file's pictures, it saves it and gives its path), or
 * are left off without it.
 */
export function remapTable(t: FileTable, map: DeckIdMap, ids: () => string, picture?: (key: string) => string | undefined): FileTable {
  const card = (c: SandboxCard): SandboxCard[] => {
    const deck = map.get(c.deckId);
    const cardId = deck?.cards.get(c.cardId);
    return deck && cardId ? [{ ...c, iid: ids(), deckId: deck.id, cardId }] : [];
  };
  // Each stack's new id, for the custom art lying over it.
  const stackIds = new Map<string, string>();
  const stacks = t.stacks.flatMap((s) => {
    const cards = s.cards.flatMap(card);
    if (!cards.length) return [];
    const id = ids();
    if (s.id) stackIds.set(s.id, id);
    return [{ ...s, id, cards }];
  });
  const item = (i: BagItem): BagItem[] => (i.card ? card(i.card).map((c) => ({ card: c })) : [{ piece: piece(i.piece!) }]);
  const piece = (p: TablePiece): TablePiece => {
    const { image, over, items, supply, faces, faceColors, ...rest } = p;
    const path = image && picture ? picture(image) : undefined;
    const faceArt = faces && picture ? faces.map((f) => (f ? (picture(f) ?? null) : null)) : undefined;
    const under = over ? stackIds.get(over) : undefined;
    const inside = items?.flatMap(item);
    const [kept] = supply ? item(supply) : [];
    return {
      ...rest,
      id: ids(),
      ...(path ? { image: path } : {}),
      ...(faceArt?.some(Boolean) ? { faces: faceArt, ...(faceColors ? { faceColors: faceArt.map((f, i) => (f ? (faceColors[i] ?? null) : null)) } : {}) } : {}),
      ...(under ? { over: under } : {}),
      ...(inside?.length ? { items: inside } : {}),
      ...(kept ? { supply: kept } : {}),
    };
  };
  return {
    ...t,
    stacks,
    hands: t.hands.map((h) => h.flatMap(card)),
    ...(t.trash ? { trash: t.trash.flatMap(card) } : {}),
    ...(t.pieces ? { pieces: t.pieces.map(piece) } : {}),
  };
}

/** A file name for a deck file: the deck's name (or "Shufflevale decks" for several), made safe for any disk. */
export function deckFileName(decks: Pick<Deck, 'name'>[]): string {
  return fileNameFor(decks.length === 1 ? decks[0].name : 'Shufflevale decks');
}

/** A Shufflevale file's own extension (files from before it are `.shufflevale.json`, and still open). */
export const FILE_EXT = 'shufflevale';

/** A file name for a Shufflevale file called `name`, made safe for any disk. */
export function fileNameFor(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Shufflevale';
  return `${safe}.${FILE_EXT}`;
}
