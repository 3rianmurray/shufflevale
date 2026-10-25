// Shufflevale files (decks, and any tables laid out with them; the format is in deckFile.ts): shared through the
// share sheet (Messages, AirDrop, Mail…), backed up into a folder in Files, and opened to add what's in them. A
// backup too big for one file is saved in parts (see `planParts`), and opened by picking them all together.
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { DeckFileError, decksOnTable, FILE_EXT, fileNameFor, packDecks, partFromHead, planParts, unpackFile } from './deckFile';
import type { FilePart, FilePlan, UnpackedFile } from './deckFile';
import { newId } from './id';
import type { SandboxTable } from './sandbox';
import { readImageData } from './storage';
import type { Deck } from './types';

/** What goes in a file: decks, any tables (whose decks must be among them), and the file's name. */
export interface FileContents {
  name: string;
  decks: Deck[];
  tables?: SandboxTable[];
}

/** A file for one table: the table, and the decks its cards come from. */
export const tableFile = (table: SandboxTable, allDecks: Deck[]): FileContents => ({
  name: table.name,
  decks: decksOnTable(table, allDecks),
  tables: [table],
});

/** Everything: every deck and every table, named by today's date. */
export const everythingFile = (decks: Deck[], tables: SandboxTable[]): FileContents => ({
  name: `Shufflevale backup ${new Date().toISOString().slice(0, 10)}`,
  decks,
  tables,
});

/** A saved picture's size once it's in a file (as base64). */
const charsOf = (path: string) => {
  try {
    return Math.ceil(new File(Paths.document, path).size / 3) * 4;
  } catch {
    return 0;
  }
};

/** The parts a file's contents are saved in: one, unless it's too big to be a single file. */
const partsOf = ({ decks, tables }: FileContents) => planParts(decks, tables ?? [], charsOf);

/** A part's text, saying which part it is when there are several (first, so it's read without the rest). */
const textOf = (plan: FilePlan, part?: FilePart) => JSON.stringify({ ...(part ? { part } : {}), ...packDecks(plan.decks, readImageData, plan.tables) });

/**
 * The app's own file type (registered in app.json), so Files, Messages and the rest show its icon (not a preview of
 * its text) and offer to open it in Shufflevale.
 */
export const FILE_UTI = 'com.3rianmurray.shufflevale.file';
const FILE_MIME = 'application/x-shufflevale';

/**
 * Opens the share sheet with the file, to send (Messages, AirDrop, Mail…) or save. Resolves once the sheet has
 * closed. Throws, saying so, if it's too big to be one file (it can be backed up, in parts).
 */
export async function shareFile(contents: FileContents): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
  const parts = partsOf(contents);
  if (parts.length > 1) throw new Error('It’s too big to share as one file. Back it up instead: it’s saved in parts.');
  const file = new File(Paths.cache, fileNameFor(contents.name));
  if (file.exists) file.delete();
  file.create();
  file.write(textOf(parts[0]));
  try {
    await Sharing.shareAsync(file.uri, { UTI: FILE_UTI, mimeType: FILE_MIME, dialogTitle: 'Share' });
  } finally {
    // It's been copied wherever it went; the one here was only for handing over.
    if (file.exists) file.delete();
  }
}

/**
 * Saves the file into a folder the player picks in Files (iCloud Drive, On My iPhone…), beside anything already
 * there (numbered if the name's taken): in parts, if it's too big to be one file ("… (part 1 of 3)" and so on).
 * Returns the folder's name and how many parts, or null if they didn't pick a folder.
 */
export async function backUpFile(contents: FileContents): Promise<{ folder: string; parts: number } | null> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    // Closed without picking a folder.
    return null;
  }
  const parts = partsOf(contents);
  const base = fileNameFor(contents.name).slice(0, -(FILE_EXT.length + 1));
  const named = (b: string) => parts.map((_, i) => new File(folder, `${b}${parts.length > 1 ? ` (part ${i + 1} of ${parts.length})` : ''}.${FILE_EXT}`));
  let files = named(base);
  for (let n = 2; files.some((f) => f.exists); n++) files = named(`${base} (${n})`);
  const set = newId();
  // One part at a time, so only one is ever in memory.
  parts.forEach((plan, i) => {
    files[i].create();
    files[i].write(textOf(plan, parts.length > 1 ? { n: i + 1, of: parts.length, set } : undefined));
  });
  return { folder: folder.name, parts: parts.length };
}

/** The biggest file that's opened: far more than any real deck needs. */
const MAX_FILE_BYTES = 250 * 1024 * 1024;

/**
 * Asks for Shufflevale files (from Files, iCloud Drive…): one, or every part of one saved in parts. Gives where
 * the copies of them are (to be read with `readDeckFile`, or `checkParts` for several), or null if none was chosen.
 */
export async function pickDeckFiles(): Promise<string[] | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [FILE_UTI, 'application/json', 'public.json', '*/*'],
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

/** Reads a Shufflevale file (or a part of one), leaving it where it is. See `unpackFile` for `earlier`. */
export async function readFileAt(uri: string, earlier?: Map<string, Set<string>>): Promise<UnpackedFile> {
  const file = new File(uri);
  if (!file.exists) throw new DeckFileError('That file couldn’t be found.');
  // Read all at once, so a file this big could run the phone out of memory.
  if (file.size > MAX_FILE_BYTES) throw new DeckFileError('This file is too big to open (over 250 MB).');
  return unpackFile(await file.text(), earlier);
}

/** What to do with a part opened by itself. */
const partAlone = (part: FilePart) => `This is part ${part.n} of ${part.of}. Open all the parts together from Import decks or tables.`;

/**
 * Reads a Shufflevale file's decks and tables from where it is (a copy of it, which goes once it's read: one
 * picked, or one opened in the app from elsewhere). Throws a DeckFileError, with a message for the player, if it
 * isn't one, or is only a part of one.
 */
export async function readDeckFile(uri: string): Promise<UnpackedFile> {
  try {
    const found = await readFileAt(uri);
    if (found.part && found.part.of > 1) throw new DeckFileError(partAlone(found.part));
    return found;
  } finally {
    dropCopies([uri]);
  }
}

/** The start of a file, enough to say which part it is. */
function headOf(uri: string): string {
  const handle = new File(uri).open();
  try {
    return String.fromCharCode(...handle.readBytes(Math.min(256, handle.size ?? 256)));
  } finally {
    handle.close();
  }
}

/**
 * Picked files that should be every part of one file saved in parts, in order (each read only as far as which
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
