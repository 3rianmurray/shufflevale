// Adding what's in a Shufflevale file: from the home screen's menu, or a file opened in the app from elsewhere
// (Files, Messages, Mail, AirDrop: see app/open.tsx). Its decks go at the top of the list (a table's in a group
// named for it), and its tables with the rest, pointed at the decks as added, their pieces' pictures saved. A
// backup saved in parts is added from all its parts together. Opening a file is free (sharing and backing up are
// Pro's); its cards need room in the free version, as any new cards do.
//
// Decks and tables already here (the same one, by where it came from, or a deck the same in every way: see
// deckMatch) aren't added twice: each can use the one here, update it, or be kept as well (see `FilePlan`).
import { Alert } from 'react-native';

import { useDecks } from './DecksContext';
import { cardsByDeck, DeckFileError, deckIdsOn, pictureData, remapTable } from './deckFile';
import type { DeckIdMap, UnpackedDeck, UnpackedFile } from './deckFile';
import { matchDeck, matchTable } from './deckMatch';
import type { DeckMatch } from './deckMatch';
import { checkParts, dropCopies, readFileAt } from './deckExport';
import type { OpenedFile } from './deckExport';
import * as haptics from './haptics';
import { newId } from './id';
import { cardRoom } from './limits';
import { pictureComparer } from './pictureCompare';
import { exampleAllowances, usePro } from './pro';
import { createSandboxWith, replaceSandbox, sandboxes } from './sandboxStore';
import { saveImageData } from './storage';
import { showUndo } from './undoBar';

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

/** What's done with a file's deck that's here already: use the one here, update it to the file's, or add it too. */
export type DeckChoice = 'use' | 'update' | 'keep';
/** What's done with a file's table that's here already: replace the one here, or add it too. */
export type TableChoice = 'replace' | 'keep';

/** Which of a file's decks and tables are here already (each, in the file's order: the match, or null). */
export interface FilePlan {
  decks: (DeckMatch | null)[];
  tables: (string | null)[];
}
export interface FileChoices {
  decks: (DeckChoice | null)[];
  tables: (TableChoice | null)[];
}

/** Anything in the file is here already. */
export const anyMatches = (plan: FilePlan) => plan.decks.some(Boolean) || plan.tables.some(Boolean);

/** The choices to start with: a changed deck updates the one here; the same one is used; a table replaces its own. */
export function defaultChoices(plan: FilePlan): FileChoices {
  return {
    decks: plan.decks.map((m) => (!m ? null : m.how === 'id' && !m.identical ? 'update' : 'use')),
    tables: plan.tables.map((m) => (m ? 'replace' : null)),
  };
}

/**
 * A file read but held for its choices (see app/open.tsx): handed over from the home screen, which then leaves it
 * (and its `done`) to that screen.
 */
let held: { file: OpenedFile; plan: FilePlan } | null = null;
export const holdFile = (file: OpenedFile, plan: FilePlan) => {
  held?.file.done();
  held = { file, plan };
};
export const takeHeldFile = () => {
  const f = held;
  held = null;
  return f;
};

/**
 * Adding a file's decks and tables, saying what was added: `addFile` for one file, read; `addParts` for every part
 * of a file saved in parts, picked together. (A function of the screen's decks, so a hook.)
 */
export function useFileImport() {
  const { decks: own, importDecks, updateFromFile } = useDecks();
  const pro = usePro();

  /** Which of a file's decks and tables are here already. */
  const planFile = (found: UnpackedFile): FilePlan => {
    const same = pictureComparer().withFile;
    const takenDecks = new Set<string>();
    const decks = found.decks.map((u) => {
      const m = matchDeck(u, own, same, takenDecks);
      if (m) takenDecks.add(m.deckId);
      return m;
    });
    const takenTables = new Set<string>();
    const tables = found.tables.map((t) => {
      const m = matchTable(t, sandboxes(), takenTables);
      if (m) takenTables.add(m);
      return m;
    });
    return { decks, tables };
  };

  /** How many new cards a file would add, as chosen (each once, as the free version's limit counts them). */
  const cardsIn = (found: UnpackedFile, plan?: FilePlan, choices?: FileChoices) =>
    found.decks.reduce((n, d, i) => {
      const m = plan?.decks[i];
      const choice = choices?.decks[i];
      if (!m || choice === 'keep' || !choice) return n + d.cards.length;
      if (choice === 'use') return n;
      return n + Math.max(0, d.cards.length - (own.find((o) => o.id === m.deckId)?.cards.length ?? 0));
    }, 0);
  /** Whether a file's cards fit in the room the free version has left (always, with Pro). */
  const fits = (found: UnpackedFile, plan?: FilePlan, choices?: FileChoices) => cardsIn(found, plan, choices) <= cardRoom(own, exampleAllowances(), pro);

  /** Notes in `map` where a file's deck (and its cards) went: `deck`'s cards in the file's order. */
  const note = (map: DeckIdMap, u: UnpackedDeck, deck: { id: string; cards: { id: string }[] }) => {
    if (!u.fileId) return;
    const cards = new Map<string, string>();
    u.cards.forEach((c, j) => {
      if (c.fileId && deck.cards[j]) cards.set(c.fileId, deck.cards[j].id);
    });
    map.set(u.fileId, { id: deck.id, cards });
  };

  /** Adds decks, noting in `map` where each of them (and its cards) went, for tables' cards to point at. */
  const addDecks = (decks: UnpackedDeck[], map: DeckIdMap, options?: Parameters<typeof importDecks>[1]) => {
    const added = importDecks(decks, options);
    decks.forEach((d, i) => added[i] && note(map, d, added[i]));
    return added;
  };

  /** A file's table pointed at its decks as added (see `addDecks`), its pictures saved. */
  const tablesLaid = (found: UnpackedFile, map: DeckIdMap) => {
    // Each of the tables' pictures saved once, however many pieces (or tables) use it.
    const saved = new Map<string, string>();
    const picture = (key: string) => {
      const image = found.images[key];
      if (!image) return undefined;
      if (!saved.has(key)) saved.set(key, saveImageData(TOKEN_PICTURES, image.ext, pictureData(image)));
      return saved.get(key);
    };
    return found.tables.map((t) => remapTable(t, map, newId, picture));
  };

  /**
   * Adds one file (opening one is free; its new cards need room in the free version, as any new cards do). With a
   * plan (see `planFile`), decks and tables here already are used, updated or replaced as chosen; with anything
   * updated or replaced, Undo is offered for a moment (see undoBar).
   */
  const addFile = (found: UnpackedFile, plan?: FilePlan, choices?: FileChoices) => {
    if (!fits(found, plan, choices)) {
      throw new DeckFileError(`It has ${count(cardsIn(found, plan, choices), 'card')}, more than the free version has room for. Shufflevale Pro removes the limit.`);
    }
    const map: DeckIdMap = new Map();
    const fresh: UnpackedDeck[] = [];
    const updated: string[] = [];
    const updatedNames: string[] = [];
    found.decks.forEach((u, i) => {
      const m = plan?.decks[i];
      const choice = choices?.decks[i];
      if (!m || !choice || choice === 'keep') return fresh.push(u);
      if (choice === 'use') {
        if (u.fileId) map.set(u.fileId, { id: m.deckId, cards: m.cards });
        return;
      }
      const deck = updateFromFile(m.deckId, u, pictureComparer().withFile);
      if (!deck) return fresh.push(u);
      note(map, u, deck);
      updated.push(deck.id);
      updatedNames.push(deck.name);
    });
    // Only the decks added go in a table's group, or the file's groups (those they're in).
    const groupName = fresh.length ? tableGroup(found) : undefined;
    const groups = found.groups.filter((g) => fresh.some((d) => d.fileGroup === g.fileId));
    const added = addDecks(fresh, map, { groupName, groups });
    const laid = tablesLaid(found, map);
    const replaced: string[] = [];
    const addedTables: string[] = [];
    const tableNames: { replaced: string[]; added: string[] } = { replaced: [], added: [] };
    found.tables.forEach((t, i) => {
      const m = plan?.tables[i];
      if (m && choices?.tables[i] === 'replace') {
        replaceSandbox(m, laid[i]);
        replaced.push(m);
        tableNames.replaced.push(t.name);
      } else {
        addedTables.push(createSandboxWith(t.name, (empty) => ({ ...empty, ...laid[i] })).id);
        tableNames.added.push(t.name);
      }
    });
    haptics.success();
    if (updated.length || replaced.length) {
      // Something here changed: what changed, and a moment to undo all of it.
      const what = [
        updated.length === 1 ? `updated “${updatedNames[0]}”` : updated.length ? `updated ${count(updated.length, 'deck')}` : '',
        replaced.length === 1 ? `replaced “${tableNames.replaced[0]}”` : replaced.length ? `replaced ${count(replaced.length, 'table')}` : '',
        added.length || addedTables.length ? `added ${[added.length ? count(added.length, 'deck') : '', addedTables.length ? count(addedTables.length, 'table') : ''].filter(Boolean).join(' and ')}` : '',
      ].filter(Boolean);
      const label = what.join(', ');
      showUndo({ label: label[0].toUpperCase() + label.slice(1), addedDecks: added.map((d) => d.id), addedTables, updatedDecks: updated, replacedTables: replaced });
      return;
    }
    const summary = [
      added.length === 1 ? `“${added[0].name}”` : added.length ? count(added.length, 'deck') : '',
      addedTables.length === 1 ? `the table “${tableNames.added[0]}”` : addedTables.length ? count(addedTables.length, 'table') : '',
    ]
      .filter(Boolean)
      .join(' and ');
    Alert.alert(
      summary ? `Added ${summary}` : 'Nothing new to add',
      groupName && added.length ? `Its decks are in the group “${groupName}”, at the top of your decks.` : added.length ? 'New decks are at the top of your decks.' : undefined,
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
        for (const [i, laid] of tablesLaid(found, map).entries()) createSandboxWith(found.tables[i].name, (empty) => ({ ...empty, ...laid }));
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

  return { addFile, addParts, fits, cardsIn, planFile };
}
