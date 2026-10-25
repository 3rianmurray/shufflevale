// Adding what's in a Shufflevale file: from the home screen's menu, or a file opened in the app from elsewhere
// (Files, Messages, Mail, AirDrop: see app/open.tsx). Its decks go at the top of the list (a table's in a group
// named for it), and its tables with the rest, pointed at the decks as added, their pieces' pictures saved.
import { Alert } from 'react-native';

import { useDecks } from './DecksContext';
import { remapTable } from './deckFile';
import type { DeckIdMap, UnpackedFile } from './deckFile';
import * as haptics from './haptics';
import { newId } from './id';
import { createSandboxWith } from './sandboxStore';
import { saveImageData } from './storage';

/** Where the table's own pictures (tokens, custom art) are kept, as on the table (see SandboxTable). */
const TOKEN_PICTURES = 'tokens';

/** What a file holds, in words: "“Monsters” and the table “Zombicide”", "3 decks", "the table “Dice”"… */
export function fileSummary(found: UnpackedFile): string {
  const decks = found.decks.length === 1 ? `“${found.decks[0].name}”` : found.decks.length ? `${found.decks.length} decks` : '';
  const tables = found.tables.length === 1 ? `the table “${found.tables[0].name}”` : found.tables.length ? `${found.tables.length} tables` : '';
  return [decks, tables].filter(Boolean).join(' and ');
}

/** Adds a file's decks and tables, and says what was added (a function of the screen's decks, so a hook). */
export function useFileImport() {
  const { importDecks } = useDecks();
  return (found: UnpackedFile) => {
    // A table's file: its decks kept together, in a group named for it (e.g. “Zombicide Decks”).
    const groupName = found.tables.length === 1 && found.decks.length ? `${found.tables[0].name} Decks` : undefined;
    const added = importDecks(found.decks, groupName);
    // Where each of the file's decks (and its cards) went, for its tables' cards to point at.
    const map: DeckIdMap = new Map();
    found.decks.forEach((d, i) => {
      if (!d.fileId) return;
      const cards = new Map<string, string>();
      d.cards.forEach((c, j) => {
        if (c.fileId && added[i]?.cards[j]) cards.set(c.fileId, added[i].cards[j].id);
      });
      map.set(d.fileId, { id: added[i].id, cards });
    });
    // Each of the tables' pictures saved once, however many pieces (or tables) use it.
    const saved = new Map<string, string>();
    const picture = (key: string) => {
      const image = found.images[key];
      if (!image) return undefined;
      if (!saved.has(key)) saved.set(key, saveImageData(TOKEN_PICTURES, image.ext, image.data));
      return saved.get(key);
    };
    for (const t of found.tables) createSandboxWith(t.name, (empty) => ({ ...empty, ...remapTable(t, map, newId, picture) }));
    haptics.success();
    Alert.alert(
      `Added ${fileSummary(found)}`,
      groupName ? `Its decks are in the group “${groupName}”, at the top of your decks.` : found.decks.length ? 'New decks are at the top of your decks.' : undefined,
    );
  };
}
