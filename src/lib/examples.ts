// The app's own examples: a Playing Cards deck and a Solitaire table dealt from it, and the Playground (every
// component laid out as a little game, to show what a table can do), made once on first opening to show what Free Play can do, and put back as new from Help
// whenever they're wanted again (deleted or changed).
import { Alert } from 'react-native';

import { useDecks } from './DecksContext';
import * as haptics from './haptics';
import { newId } from './id';
import { chessArt } from './chessArt';
import { playingCards } from './playingCards';
import { newSandbox, playground, PLAYGROUND_VERSION, solitaire } from './sandbox';
import type { ChessArt, SandboxTable } from './sandbox';
import { createSandboxWith, sandboxes, updateSandbox } from './sandboxStore';
import type { Deck } from './types';
import { loadSettings, saveSettings } from './storage';

const PLAYING_CARDS = 'Playing Cards';
const SOLITAIRE = 'Solitaire';
const PLAYGROUND = 'Playground';

/**
 * The Playground, as new: laid out again in place (keeping its spot, and its name if it's been renamed), or made
 * again (and noted as the Playground), with the Playing Cards deck and the chess set's pictures. Whether it was made.
 */
function restorePlayground(deck: Deck | undefined, chess: ChessArt): boolean {
  const id = loadSettings().playgroundTableId;
  const table = id ? sandboxes().find((t) => t.id === id) : undefined;
  // Laid out as it is now: it has every component.
  if (table) {
    updateSandbox(playground(newSandbox(table.id, table.name, table.createdAt), deck, newId, Math.random, chess));
    saveSettings({ ...loadSettings(), playgroundVersion: PLAYGROUND_VERSION });
    return false;
  }
  const made: SandboxTable = createSandboxWith(PLAYGROUND, (empty) => playground(empty, deck, newId, Math.random, chess));
  saveSettings({ ...loadSettings(), playgroundTableId: made.id, playgroundMade: true, playgroundVersion: PLAYGROUND_VERSION });
  return true;
}

/** The Solitaire example table, if it's still here (found by its name, if it was made before it was noted). */
function solitaireTable(): SandboxTable | undefined {
  const id = loadSettings().solitaireTableId;
  return id ? sandboxes().find((t) => t.id === id) : sandboxes().find((t) => t.name === SOLITAIRE);
}

/** Whether a table is one of the app's examples, which can be reset to how it first was. */
export const isExampleTable = (id: string) => loadSettings().playgroundTableId === id || solitaireTable()?.id === id;

/** What an example table's reset is called in its menu: Reset Playground, or Reset Solitaire. */
export const resetExampleLabel = (id: string) => (loadSettings().playgroundTableId === id ? 'Reset Playground' : 'Reset Solitaire');

/** Whether a deck is the Playing Cards deck the app made (found by name, if made before it was noted). */
export const isExampleDeck = (deck: Deck) => {
  const id = loadSettings().playingCardsDeckId;
  return id ? deck.id === id : deck.name === PLAYING_CARDS;
};

export function useExamples() {
  const { decks, createReadyDeck, refillDeck, getDeck } = useDecks();

  /** The Playing Cards deck the app made, if it's still here (found by name, if made before it was noted). */
  const playingDeck = () => {
    const id = loadSettings().playingCardsDeckId;
    return id ? getDeck(id) : decks.find((d) => d.name === PLAYING_CARDS);
  };

  /**
   * Puts both examples back as they were first made: the Playing Cards deck (made again if it's gone, or its
   * cards, back, name and settings put back if it's been changed) and the Solitaire table, dealt afresh from it
   * (made again if it's gone). Says what it brought back, and what it reset.
   */
  const restore = async (): Promise<{ added: string[]; reset: string[] }> => {
    const added: string[] = [];
    const reset: string[] = [];
    const { cards, back } = await playingCards();
    const found = playingDeck();
    const deck = found ? refillDeck(found.id, PLAYING_CARDS, cards, back) : createReadyDeck(PLAYING_CARDS, cards, back);
    if (!deck) throw new Error('The Playing Cards deck couldn’t be found.');
    saveSettings({ ...loadSettings(), playingCardsDeckId: deck.id });
    (found ? reset : added).push(PLAYING_CARDS);

    // The Solitaire table: dealt again in place (keeping its spot on the home screen), or made again.
    const table = solitaireTable();
    if (table) {
      updateSandbox(solitaire(newSandbox(table.id, SOLITAIRE, table.createdAt), deck, newId));
      reset.push(SOLITAIRE);
    } else {
      const made = createSandboxWith(SOLITAIRE, (empty) => solitaire(empty, deck, newId));
      saveSettings({ ...loadSettings(), solitaireTableId: made.id });
      added.push(SOLITAIRE);
    }
    (restorePlayground(deck, await chessArt()) ? added : reset).push(PLAYGROUND);
    return { added, reset };
  };

  /**
   * An example table as it first was (Solitaire dealt afresh, the Playground laid out again), keeping its id, name
   * and place; or null if it isn't one. Solitaire needs the Playing Cards deck: without it, null too.
   */
  const freshExample = (table: SandboxTable, chess: ChessArt): SandboxTable | null => {
    const deck = playingDeck();
    const empty = newSandbox(table.id, table.name, table.createdAt);
    if (loadSettings().playgroundTableId === table.id) return playground(empty, deck, newId, Math.random, chess);
    if (solitaireTable()?.id === table.id && deck) return solitaire(empty, deck, newId);
    return null;
  };

  /** Asks first, then puts an example table back as it first was (see freshExample), through `put`. */
  const confirmResetTable = async (table: SandboxTable, put: (fresh: SandboxTable) => void = updateSandbox) => {
    const fresh = freshExample(table, await chessArt());
    if (!fresh) {
      Alert.alert('Couldn’t reset it', 'The Playing Cards deck is gone. Restore the examples from Help.');
      return;
    }
    Alert.alert(`Reset “${table.name}”?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          put(fresh);
          haptics.success();
        },
      },
    ]);
  };

  /**
   * Just the Playground, if it's never been made (for those who had the other examples before it came); or, made
   * with an older layout (see PLAYGROUND_VERSION), laid out again as new, once (if it's still there).
   */
  const addPlayground = async () => {
    const s = loadSettings();
    if (s.playgroundMade) {
      if ((s.playgroundVersion ?? 1) >= PLAYGROUND_VERSION) return;
      const there = !!s.playgroundTableId && sandboxes().some((t) => t.id === s.playgroundTableId);
      if (there) restorePlayground(playingDeck(), await chessArt());
      saveSettings({ ...loadSettings(), playgroundVersion: PLAYGROUND_VERSION });
      return;
    }
    restorePlayground(playingDeck(), await chessArt());
  };

  /** Asks first (changes to the examples are lost), then restores them and says so. */
  const confirmRestore = () =>
    Alert.alert(
      'Restore the examples?',
      'The Playing Cards deck and the Solitaire and Playground tables go back to how they first were. Any changes made to them are lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: () =>
            void restore().then(
              () => {
                haptics.success();
                Alert.alert('Examples restored', 'The Playing Cards deck and the Solitaire and Playground tables are on the home screen, as new.');
              },
              (e) => Alert.alert('Couldn’t restore the examples', e instanceof Error ? e.message : String(e)),
            ),
        },
      ],
    );

  return { restore, confirmRestore, addPlayground, confirmResetTable };
}
