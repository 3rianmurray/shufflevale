// Shufflevale files (decks, their groups, and any tables laid out with them; the format is in deckFile.ts): shared
// through the share sheet (Messages, AirDrop, Mail…), backed up into a folder in Files, and opened to add what's in
// them. Written and read a picture at a time (they're zips: see zip.ts), so a file of any size is never all in
// memory. Older files (JSON), and the parts big backups were briefly saved in, still open.
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { strFromU8, strToU8 } from 'fflate';

import { checkPicture, DeckFileError, decksOnTable, FILE_EXT, fileNameFor, MANIFEST, packManifest, partFromHead, PICTURE_HEAD, unpackFile, unpackManifest } from './deckFile';
import type { FilePart, UnpackedFile } from './deckFile';
import type { DeckGroup } from './groups';
import type { SandboxTable } from './sandbox';
import { readImageBytes } from './storage';
import type { Deck } from './types';
import { entryBytes, entryHead, isZip, ZipError, zipEntries, ZipWriter } from './zip';
import type { ReadAt } from './zip';

/** What goes in a file: decks, any tables (whose decks must be among them), the decks' groups, and its name. */
export interface FileContents {
  name: string;
  decks: Deck[];
  tables?: SandboxTable[];
  groups?: DeckGroup[];
}

/** A file for one table: the table, and the decks its cards come from. */
export const tableFile = (table: SandboxTable, allDecks: Deck[]): FileContents => ({
  name: table.name,
  decks: decksOnTable(table, allDecks),
  tables: [table],
});

/** Everything: every deck, group and table, named by today's date. */
export const everythingFile = (decks: Deck[], tables: SandboxTable[], groups: DeckGroup[]): FileContents => ({
  name: `Shufflevale backup ${new Date().toISOString().slice(0, 10)}`,
  decks,
  tables,
  groups,
});

/**
 * The app's own file type (registered in app.json), so Files, Messages and the rest show its icon (not a preview of
 * its contents) and offer to open it in Shufflevale.
 */
export const FILE_UTI = 'com.3rianmurray.shufflevale.file';
const FILE_MIME = 'application/x-shufflevale';

/** Writes the file at `target`: what's in it, then each picture, one at a time. */
function writeFile(target: File, { decks, tables, groups }: FileContents) {
  const { file, pictures } = packManifest(decks, tables ?? [], groups ?? []);
  if (target.exists) target.delete();
  target.create();
  const handle = target.open(FileMode.WriteOnly);
  try {
    const zip = new ZipWriter((bytes) => handle.writeBytes(bytes));
    zip.add(MANIFEST, strToU8(JSON.stringify(file)));
    for (const p of pictures) zip.add(p.name, readImageBytes(p.path));
    zip.finish();
  } catch (e) {
    handle.close();
    target.delete();
    throw e;
  }
  handle.close();
}

/** The file, written in the cache: only for handing over (to the share sheet, or a folder in Files). */
function fileInCache(contents: FileContents): File {
  const file = new File(Paths.cache, fileNameFor(contents.name));
  writeFile(file, contents);
  return file;
}

/**
 * Opens the share sheet with the file, to send (Messages, AirDrop, Mail…) or save. `busy` runs the writing (to show
 * that it's under way). Resolves once the sheet has closed.
 */
export async function shareFile(contents: FileContents, busy: <T>(work: () => T) => Promise<T>): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
  const file = await busy(() => fileInCache(contents));
  try {
    await Sharing.shareAsync(file.uri, { UTI: FILE_UTI, mimeType: FILE_MIME, dialogTitle: 'Share' });
  } finally {
    // It's been copied wherever it went; the one here was only for handing over.
    if (file.exists) file.delete();
  }
}

/**
 * Saves the file into a folder the player picks in Files (iCloud Drive, On My iPhone…), beside anything already
 * there (numbered if the name's taken). `busy` runs the writing (to show that it's under way). Returns the folder's
 * name, or null if they didn't pick one.
 */
export async function backUpFile(contents: FileContents, busy: <T>(work: () => T) => Promise<T>): Promise<string | null> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    // Closed without picking a folder.
    return null;
  }
  await busy(() => {
    const base = fileNameFor(contents.name).slice(0, -(FILE_EXT.length + 1));
    let target = new File(folder, `${base}.${FILE_EXT}`);
    for (let n = 2; target.exists; n++) target = new File(folder, `${base} (${n}).${FILE_EXT}`);
    // Written here first, then copied over whole: a folder in iCloud Drive (or elsewhere) gets a finished file.
    const file = fileInCache(contents);
    try {
      file.copySync(target);
    } finally {
      file.delete();
    }
  });
  return folder.name;
}

/** The biggest older (JSON) file that's opened: it's read all at once. */
const MAX_FILE_BYTES = 250 * 1024 * 1024;

/**
 * Asks for Shufflevale files (from Files, iCloud Drive…): one, or every part of a backup saved in parts. Gives where
 * the copies of them are (to be read with `readDeckFile`, or `checkParts` for several), or null if none was chosen.
 */
export async function pickDeckFiles(): Promise<string[] | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [FILE_UTI, 'application/json', 'public.json', 'public.zip-archive', '*/*'],
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (result.canceled || !result.assets.length) return null;
  return result.assets.map((a) => a.uri);
}

/** Removes the copies of picked or opened files, once they're read. */
export function dropCopies(uris: string[]) {
  for (const uri of uris) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // A copy that can't be removed is only taking a little room.
    }
  }
}

/** Reads an older (JSON) Shufflevale file, or a part of one, leaving it where it is. See `unpackFile` for `earlier`. */
export async function readFileAt(uri: string, earlier?: Map<string, Set<string>>): Promise<UnpackedFile> {
  const file = new File(uri);
  if (!file.exists) throw new DeckFileError('That file couldn’t be found.');
  // Read all at once, so a file this big could run the phone out of memory.
  if (file.size > MAX_FILE_BYTES) throw new DeckFileError('This file is too big to open (over 250 MB).');
  return unpackFile(await file.text(), earlier);
}

/** A file read, its pictures still to be read from it as they're saved: `done` once they have been. */
export type OpenedFile = UnpackedFile & { done: () => void };

const damaged = () => new DeckFileError('This deck file is damaged.');

/** Reads a zipped Shufflevale file: what's in it, its pictures checked (from their starts), to be read as they're saved. */
function readZip(readAt: ReadAt, size: number): UnpackedFile {
  try {
    const entries = new Map(zipEntries(size, readAt).map((e) => [e.name, e]));
    const manifest = entries.get(MANIFEST);
    if (!manifest) throw new DeckFileError("This file isn't a Shufflevale deck.");
    return unpackManifest(strFromU8(entryBytes(manifest, readAt)), (name, ext) => {
      const entry = entries.get(name);
      if (!entry) throw new DeckFileError('This deck file is damaged: some of its pictures are missing.');
      checkPicture(entryHead(entry, readAt, PICTURE_HEAD), entry.size);
      return {
        ext,
        name,
        bytes: () => {
          try {
            return entryBytes(entry, readAt);
          } catch (e) {
            throw e instanceof ZipError ? damaged() : e;
          }
        },
      };
    });
  } catch (e) {
    throw e instanceof ZipError ? damaged() : e;
  }
}

/** What to do with a part opened by itself. */
const partAlone = (part: FilePart) => `This is part ${part.n} of ${part.of}. Open all the parts together from Import decks or tables.`;

/**
 * Reads a Shufflevale file's decks, groups and tables from where it is (a copy of it, which goes once it's `done`
 * with: one picked, or one opened in the app from elsewhere). Throws a DeckFileError, with a message for the
 * player, if it isn't one, or is only a part of one.
 */
export async function readDeckFile(uri: string): Promise<OpenedFile> {
  const file = new File(uri);
  let handle: ReturnType<File['open']> | null = null;
  const done = () => {
    try {
      handle?.close();
    } catch {
      // Closed already.
    }
    handle = null;
    dropCopies([uri]);
  };
  try {
    if (!file.exists) throw new DeckFileError('That file couldn’t be found.');
    const opened = file.open(FileMode.ReadOnly);
    handle = opened;
    const size = opened.size ?? file.size;
    const readAt: ReadAt = (offset, length) => {
      opened.offset = offset;
      return opened.readBytes(Math.max(0, Math.min(length, size - offset)));
    };
    if (isZip(readAt(0, 4))) return { ...readZip(readAt, size), done };
    // An older file.
    opened.close();
    handle = null;
    const found = await readFileAt(uri);
    if (found.part && found.part.of > 1) throw new DeckFileError(partAlone(found.part));
    done();
    return { ...found, done: () => {} };
  } catch (e) {
    done();
    throw e;
  }
}

/** The start of a file, enough to say which part it is. */
function headOf(uri: string): string {
  const handle = new File(uri).open(FileMode.ReadOnly);
  try {
    return String.fromCharCode(...handle.readBytes(Math.min(256, handle.size ?? 256)));
  } finally {
    handle.close();
  }
}

/**
 * Picked files that should be every part of a backup saved in parts, in order (each read only as far as which
 * part it is). Throws a DeckFileError, with a message for the player, if they aren't.
 */
export function checkParts(uris: string[]): string[] {
  const parts = uris.map((uri) => {
    let part: FilePart | null = null;
    try {
      part = partFromHead(headOf(uri));
    } catch {
      // Unreadable: said below.
    }
    if (!part) throw new DeckFileError('Pick one file, or all the parts of a backup together.');
    return { uri, part };
  });
  const [{ part: first }] = parts;
  if (parts.some(({ part }) => part.set !== first.set || part.of !== first.of)) {
    throw new DeckFileError('These parts are from different backups. Pick all the parts of one backup together.');
  }
  const have = new Set(parts.map(({ part }) => part.n));
  const missing = Array.from({ length: first.of }, (_, i) => i + 1).filter((n) => !have.has(n));
  if (missing.length) {
    const several = missing.length > 1;
    throw new DeckFileError(
      `Part${several ? 's' : ''} ${missing.join(', ')} of ${first.of} ${several ? 'are' : 'is'} missing. Pick all the parts of the backup together.`,
    );
  }
  // One of each (a part picked twice, once).
  return [...new Map(parts.sort((a, b) => a.part.n - b.part.n).map(({ uri, part }) => [part.n, uri])).values()];
}
