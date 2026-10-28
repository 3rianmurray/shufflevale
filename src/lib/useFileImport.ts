// Adding what's in a Shufflevale file: from the home screen's menu, or a file opened in the app from elsewhere
// (Files, Messages, Mail, AirDrop: see app/open.tsx). Its decks go at the top of the list (a table's in a group
// named for it), and its tables with the rest, pointed at the decks as added, their pieces' pictures saved. A
// backup saved in parts is added from all its parts together. Opening a file is free (sharing and backing up are
// Pro's); its cards need room in the free version, as any new cards do.
import { Alert } from 'react-native';

import { useDecks } from './DecksContext';
import { cardsByDeck, DeckFileError, deckIdsOn, pictureData, remapTable } from './deckFile';
import type { DeckIdMap, UnpackedDeck, UnpackedFile } from './deckFile';
import { checkParts, dropCopies, readFileAt } from './deckExport';
import * as haptics from './haptics';
import { newId } from './id';
import { cardRoom } from './limits';
import { exampleAllowances, usePro } from './pro';
import { createSandboxWith } from './sandboxStore';
import { saveImageData } from './storage';

/** Where the table's own pictures (tokens, custom art) are kept, as on the table (see SandboxTable). */
const TOKEN_PICTURES = 'tokens';

/** "3 decks", "1 table"… */
const count = (n: number, what: string) => `${n} ${what}${n === 1 ? '' : 's'}`;

/** What a file holds, in words: "“Monsters” and the table “Zombicide”", "3 decks", "the table “Dice”"… */
export function fileSummary(found: UnpackedFile): string {
  const decks = found.decks.length === 1 ? `“${found.decks[0].name}”` : found.decks.length ? `${found.decks.length} decks` : '';
  const tables = found.tables.length === 1 ? `the table “${found.tables[0].name}”` : found.tables.length ? `${found.tables.length} tables` : '';
  return [decks, tables].filter(Boolean).join(' and ');
}

/**
 * A table's file (one table, and only decks its cards come from, in no groups of their own): the group its decks
 * are kept together in, named for it (e.g. “Zombicide Decks”). None for anything else.
 */
function tableGroup(found: UnpackedFile): string | undefined {
  const [table, more] = found.tables;
  if (!table || more || !found.decks.length || found.groups.length) return undefined;
  const onTable = deckIdsOn(table);
  return found.decks.every((d) => !d.fileId || onTable.has(d.fileId)) ? `${table.name} Decks` : undefined;
}

/**
 * Adding a file's decks and tables, saying what was added: `addFile` for one file, read; `addParts` for every part
 * of a file saved in parts, picked together. (A function of the screen's decks, so a hook.)
 */
export function useFileImport() {
  const { decks: own, importDecks } = useDecks();
  const pro = usePro();

  /** How many cards a file would add (each once, as the free version's limit counts them). */
  const cardsIn = (found: UnpackedFile) => found.decks.reduce((n, d) => n + d.cards.length, 0);
  /** Whether a file's cards fit in the room the free version has left (always, with Pro). */
  const fits = (found: UnpackedFile) => cardsIn(found) <= cardRoom(own, exampleAllowances(), pro);

  /** Adds decks, noting in `map` where each of them (and its cards) went, for tables' cards to point at. */
  const addDecks = (decks: UnpackedDeck[], map: DeckIdMap, options?: Parameters<typeof importDecks>[1]) => {
    const added = importDecks(decks, options);
    decks.forEach((d, i) => {
      if (!d.fileId) return;
      const cards = new Map<string, string>();
      d.cards.forEach((c, j) => {
        if (c.fileId && added[i]?.cards[j]) cards.set(c.fileId, added[i].cards[j].id);
      });
      map.set(d.fileId, { id: added[i].id, cards });
    });
  };

  /** Adds a file's tables, pointed at their decks as added (see `addDecks`). */
  const addTables = (found: UnpackedFile, map: DeckIdMap) => {
    // Each of the tables' pictures saved once, however many pieces (or tables) use it.
    const saved = new Map<string, string>();
    const picture = (key: string) => {
      const image = found.images[key];
      if (!image) return undefined;
      if (!saved.has(key)) saved.set(key, saveImageData(TOKEN_PICTURES, image.ext, pictureData(image)));
      return saved.get(key);
    };
    for (const t of found.tables) createSandboxWith(t.name, (empty) => ({ ...empty, ...remapTable(t, map, newId, picture) }));
  };

  /** Adds one file (opening one is free; its cards need room in the free version, as any new cards do). */
  const addFile = (found: UnpackedFile) => {
    if (!fits(found)) throw new DeckFileError(`It has ${count(cardsIn(found), 'card')}, more than the free version has room for. Shufflevale Pro removes the limit.`);
    const groupName = tableGroup(found);
    const map: DeckIdMap = new Map();
    addDecks(found.decks, map, { groupName, groups: found.groups });
    addTables(found, map);
    haptics.success();
    Alert.alert(
      `Added ${fileSummary(found)}`,
      groupName ? `Its decks are in the group “${groupName}”, at the top of your decks.` : found.decks.length ? 'New decks are at the top of your decks.' : undefined,
    );
  };

  /**
   * Adds every part of a file saved in parts (copies of them, which go once they're read), one part at a time so
   * only one is ever in memory. Throws a DeckFileError, with a message for the player, if they aren't all the parts
   * of one, or one can't be read.
   */
  const addParts = async (uris: string[]) => {
    try {
      const parts = checkParts(uris);
      const map: DeckIdMap = new Map();
      const known = new Map<string, Set<string>>();
      const withTables: string[] = [];
      let decks = 0;
      let tables = 0;
      // Decks first, the last part's first: each part's go above those after, so they end up in order.
      for (const uri of [...parts].reverse()) {
        const found = await readFileAt(uri);
        addDecks(found.decks, map);
        for (const [id, cards] of cardsByDeck(found.decks)) known.set(id, cards);
        decks += found.decks.length;
        if (found.tables.length) withTables.unshift(uri);
      }
      // Then the tables, whose cards can come from any part's decks.
      for (const uri of withTables) {
        const found = await readFileAt(uri, known);
        addTables(found, map);
        tables += found.tables.length;
      }
      haptics.success();
      Alert.alert(
        `Added ${[decks ? count(decks, 'deck') : '', tables ? count(tables, 'table') : ''].filter(Boolean).join(' and ')}`,
        decks ? 'New decks are at the top of your decks.' : undefined,
      );
    } finally {
      dropCopies(uris);
    }
  };

  return { addFile, addParts, fits, cardsIn };
}
