import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { newId } from './id';
import {
  deleteDeckFiles,
  deleteImage,
  imageUri,
  importImage,
  saveImageData,
  loadDecks,
  loadGroups,
  loadSessions,
  loadTables,
  saveDecks,
  saveGroups,
  saveSessions,
  saveTables,
} from './storage';
import { pictureData, pictureId } from './deckFile';
import type { FilePicture, UnpackedDeck, UnpackedGroup } from './deckFile';
import { cardPartners, fileLineage, lineage } from './deckMatch';
import type { SameAsFile } from './deckMatch';
import { withoutDeck } from './groups';
import { previousOf, setPrevious } from './previousVersions';
import { repointSandboxes } from './sandboxStore';
import type { DeckGroup } from './groups';
import { moveItems } from './order';
import { createTable, pruneTable, topUpTable } from './table';
import { copiesOf } from './types';
import type { Card, CardShape, Deck, PlayMode, Session, TableState } from './types';

interface DecksApi {
  decks: Deck[];
  getDeck: (id: string) => Deck | undefined;
  createDeck: (name: string) => Deck;
  /** Makes a deck from ready card-shaped pictures (each its own original) and a back, at the top of the list. */
  createReadyDeck: (name: string, cards: { uri: string; name: string }[], back: string) => Deck;
  /** Copies a deck, art and all, placing the copy right after it. Returns the copy. */
  duplicateDeck: (id: string) => Deck | undefined;
  /**
   * Adds decks read from a deck file (see deckFile.ts), pictures and all, at the top of the list: all filed in a new
   * group of `groupName`, if given, or otherwise in new groups as the file's `groups` (lying at the top of the list
   * too).
   */
  importDecks: (decks: UnpackedDeck[], options?: { groupName?: string; groups?: UnpackedGroup[] }) => Deck[];
  renameDeck: (id: string, name: string) => void;
  deleteDeck: (id: string) => void;
  /** Empties a deck to start it again: no cards, no back, default settings, no saved tables, under a new name. */
  resetDeck: (id: string, name: string) => void;
  /**
   * Puts a deck back as a ready-made one was first made (see `createReadyDeck`): these cards and back, default
   * settings, no saved tables, this name. It keeps its place, its group, and the ids of cards with the same names,
   * so tables holding them still do. Returns it as it now is.
   */
  refillDeck: (id: string, name: string, cards: { uri: string; name: string }[], back: string) => Deck | undefined;
  /**
   * Adds a card for each image, named by `names` where given (otherwise numbered). `originals` are the uncropped
   * pictures they were cut from, kept to cut them again if the card size changes. `backs` gives cards their own
   * backs (and what each was cut from), where given, all in the same step.
   */
  addCards: (
    deckId: string,
    imageUris: string[],
    names?: string[],
    originals?: string[],
    backs?: ({ uri: string; original: string } | undefined)[],
  ) => void;
  setCopies: (deckId: string, cardId: string, copies: number) => void;
  renameCard: (deckId: string, cardId: string, name: string) => void;
  removeCard: (deckId: string, cardId: string) => void;
  /** Removes several cards at once, art and all. */
  removeCards: (deckId: string, cardIds: string[]) => void;
  /** Moves cards (indexes, in the order picked) together as a block to start at index `to` in the deck's order. */
  reorderCards: (deckId: string, picked: number[], to: number) => void;
  /** Swaps a card's art for a new image (e.g. the old art rotated), deleting the old file if nothing else uses it. */
  replaceCardImage: (deckId: string, cardId: string, imageUri: string, original?: string) => void;
  /**
   * Sets the card back (null for the built-in one). `original` is the uncropped picture it was cut from, kept to
   * cut it again if the card size changes; leave it out when the back is just cut again from the one kept.
   */
  setCardBack: (deckId: string, imageUri: string | null, original?: string | null) => void;
  /**
   * Gives one card its own back (null to go back to the deck's), for a card with two different sides. `original`
   * is the uncropped picture, as for `setCardBack`.
   */
  setOwnBack: (deckId: string, cardId: string, imageUri: string | null, original?: string | null) => void;
  setPlayMode: (deckId: string, mode: PlayMode) => void;
  setHandFolded: (deckId: string, folded: boolean) => void;
  setCardShape: (deckId: string, shape: CardShape) => void;
  /** How round the deck's card corners are (see cardRadius). */
  setRoundness: (deckId: string, roundness: number) => void;
  /**
   * Returns the saved table for a deck, creating a freshly shuffled one if needed. Each session keeps its own
   * table for each of its decks, separate from playing the deck on its own (no `sessionId`).
   */
  getTable: (deckId: string, sessionId?: string) => TableState | undefined;
  setTable: (deckId: string, sessionId: string | undefined, table: TableState) => void;
  sessions: Session[];
  getSession: (id: string) => Session | undefined;
  createSession: (name: string, deckIds: string[]) => Session;
  updateSession: (id: string, changes: Pick<Session, 'name' | 'deckIds'>) => void;
  deleteSession: (id: string) => void;
  /** Moves a session to another place in the list: `to` is its index once moved. */
  moveSession: (id: string, to: number) => void;
  /** Home-screen groups, in display order (see lib/groups.ts). */
  groups: DeckGroup[];
  createGroup: (name: string) => DeckGroup;
  renameGroup: (id: string, name: string) => void;
  /** Removes the group; its decks are kept and become ungrouped. */
  deleteGroup: (id: string) => void;
  toggleGroup: (id: string) => void;
  setGroupOrder: (groups: DeckGroup[]) => void;
  /** Puts the decks in this order (any not listed keep their place at the end) and files each under a group. */
  arrangeDecks: (order: string[], groupOf: Record<string, string | undefined>) => void;
  /**
   * Updates a deck to a newer version of it from a file (its place, group and tables kept; cards that were here
   * keep their ids, and their pictures where they're the same), keeping the deck as it was to put back (see
   * previousVersions). Returns it as it now is, its cards in the file's order.
   */
  updateFromFile: (deckId: string, from: UnpackedDeck, same: SameAsFile) => Deck | undefined;
  /**
   * Puts back a deck's previous version: the two swap (so it can be put back again), or a deck merged into it
   * comes back, just after it.
   */
  restorePrevious: (deckId: string) => void;
  /** Undoes an update from a file just made: the previous version back, and the newer one gone. */
  undoUpdate: (deckId: string) => void;
  /**
   * Merges a deck into another: its sessions and tables use `keepId` instead, and it goes (kept to bring back, see
   * `restorePrevious`).
   */
  mergeDecks: (keepId: string, goneId: string) => void;
}

/** Every picture a deck uses. */
const filesOf = (d: Deck | undefined): Set<string> =>
  new Set(d ? [d.backImage, d.backOriginal, ...d.cards.flatMap((c) => [c.image, c.original, c.back, c.backOriginal])].filter((f): f is string => !!f) : []);

const DecksContext = createContext<DecksApi | null>(null);

/** A changed table is saved this long after its last change, so a run of quick moves is saved once. */
const TABLE_SAVE_DELAY_MS = 400;

/** Saved tables are keyed by deck id when played alone (as before sessions existed), or `sessionId:deckId`. */
function tableKey(deckId: string, sessionId?: string): string {
  return sessionId ? `${sessionId}:${deckId}` : deckId;
}

function withoutTables(all: Record<string, TableState>, drop: (key: string) => boolean): Record<string, TableState> {
  return Object.fromEntries(Object.entries(all).filter(([key]) => !drop(key)));
}

export function DecksProvider({ children }: { children: ReactNode }) {
  const [decks, setDecks] = useState<Deck[]>(() => loadDecks());
  // Saved tables are kept outside React state: a table changes with every move, and if they were state, every
  // screen using the decks (the deck editor's grid of cards, say, still open under the table) would redraw with
  // each one. Nothing but the table itself shows them, so they're just kept here and saved soon after changing.
  const tables = useMemo(() => {
    const box: { all: Record<string, TableState>; timer?: ReturnType<typeof setTimeout> } = { all: loadTables() };
    const saveSoon = () => {
      clearTimeout(box.timer);
      box.timer = setTimeout(() => {
        box.timer = undefined;
        saveTables(box.all);
      }, TABLE_SAVE_DELAY_MS);
    };
    return {
      get: (key: string) => box.all[key],
      set: (key: string, table: TableState) => {
        Object.assign(box, { all: { ...box.all, [key]: table } });
        saveSoon();
      },
      drop: (gone: (key: string) => boolean) => {
        Object.assign(box, { all: withoutTables(box.all, gone) });
        saveSoon();
      },
      /** Saves now, if a save is waiting. */
      flush: () => {
        if (box.timer === undefined) return;
        clearTimeout(box.timer);
        box.timer = undefined;
        saveTables(box.all);
      },
    };
  }, []);
  // Leaving the app saves straight away, in case it's closed before a waiting save would have happened.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => state !== 'active' && tables.flush());
    return () => sub.remove();
  }, [tables]);
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [groups, setGroups] = useState<DeckGroup[]>(() => loadGroups());
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) saveDecks(decks);
  }, [decks]);
  useEffect(() => {
    if (loaded.current) saveSessions(sessions);
  }, [sessions]);
  useEffect(() => {
    if (loaded.current) saveGroups(groups);
  }, [groups]);
  useEffect(() => {
    loaded.current = true;
  }, []);

  const updateDeck = useCallback((id: string, fn: (d: Deck) => Deck) => {
    setDecks((all) => all.map((d) => (d.id === id ? { ...fn(d), updatedAt: Date.now() } : d)));
  }, []);
  // The decks as they are now, for what's done a while after a screen last drew (an Undo a few seconds later).
  const latest = useRef(decks);
  useEffect(() => {
    latest.current = decks;
  }, [decks]);

  const api = useMemo<DecksApi>(() => {
    const getDeck = (id: string) => decks.find((d) => d.id === id);
    /** A picture of a deck's that's gone, deleted unless its previous version (kept to put back) still uses it. */
    const deleteImageOf = (deckId: string, path: string) => {
      if (!filesOf(previousOf(deckId)?.deck).has(path)) deleteImage(path);
    };
    /**
     * Lets a deck's previous version go, with the pictures only it used (and a deck merged in, with its folder and
     * games, unless it's back among the decks). Pictures `keeping` decks use stay.
     */
    const dropPrevious = (deckId: string, ...keeping: (Deck | undefined)[]) => {
      const prev = previousOf(deckId);
      if (!prev) return;
      setPrevious(deckId, undefined);
      const used = new Set(keeping.flatMap((d) => [...filesOf(d)]));
      for (const f of filesOf(prev.deck)) if (!used.has(f)) deleteImage(f);
      const merged = prev.merged;
      if (merged && !latest.current.some((d) => d.id === merged.id)) {
        deleteDeckFiles(merged.id);
        tables.drop((key) => key === merged.id || key.endsWith(`:${merged.id}`));
      }
    };

    return {
      decks,
      getDeck,
      createDeck(name) {
        const now = Date.now();
        // New decks' card size is worked out from their first art (see CardShape).
        const deck: Deck = { id: newId(), name, cardShape: { kind: 'auto' }, backImage: null, cards: [], createdAt: now, updatedAt: now };
        setDecks((all) => [deck, ...all]);
        return deck;
      },
      createReadyDeck(name, cards, back) {
        const now = Date.now();
        const id = newId();
        // Each picture is copied in twice, as the card and as its original, as `addCards` does.
        const deck: Deck = {
          id,
          name,
          backImage: importImage(id, back),
          backOriginal: importImage(id, back),
          cards: cards.map((c) => ({ id: newId(), name: c.name, image: importImage(id, c.uri), original: importImage(id, c.uri) })),
          createdAt: now,
          updatedAt: now,
        };
        setDecks((all) => [deck, ...all]);
        return deck;
      },
      importDecks(incoming, { groupName, groups: fileGroups } = {}) {
        const now = Date.now();
        // Above the first ungrouped deck (or, with none, first of the groups at the bottom): below the added
        // decks, above those already here.
        const firstLoose = decks.find((d) => !d.groupId || !groups.some((g) => g.id === d.groupId));
        const top = firstLoose ? { before: firstLoose.id } : {};
        const group: DeckGroup | undefined = groupName && incoming.length ? { id: newId(), name: groupName, ...top } : undefined;
        // Otherwise the file's own groups, each new (even if one here has its name), by their ids in the file.
        const made = new Map((group ? [] : (fileGroups ?? [])).map((g) => [g.fileId, { id: newId(), name: g.name, ...(g.collapsed ? { collapsed: true } : {}) }]));
        const added = incoming.map((u): Deck => {
          const id = newId();
          // A picture several cards share is saved once.
          const saved = new Map<string, string>();
          const save = (img: FilePicture) => {
            const same = pictureId(img);
            if (!saved.has(same)) saved.set(same, saveImageData(id, img.ext, pictureData(img)));
            return saved.get(same)!;
          };
          const groupId = group?.id ?? (u.fileGroup ? made.get(u.fileGroup)?.id : undefined);
          const from = fileLineage(u);
          return {
            id,
            ...(from ? { origin: from } : {}),
            name: u.name,
            ...(u.cardShape ? { cardShape: u.cardShape } : {}),
            ...(u.roundness !== undefined ? { roundness: u.roundness } : {}),
            ...(u.playMode ? { playMode: u.playMode } : {}),
            ...(groupId ? { groupId } : {}),
            backImage: u.back ? save(u.back) : null,
            cards: u.cards.map((c) => {
              const card = fileLineage(c);
              return {
                id: newId(),
                ...(card ? { origin: card } : {}),
                name: c.name,
                ...(c.copies ? { copies: c.copies } : {}),
                image: save(c.image),
                ...(c.back ? { back: save(c.back) } : {}),
              };
            }),
            createdAt: now,
            updatedAt: now,
          };
        });
        // Each of the file's groups lies above the added deck it lay above in the file, or with the rest at the top.
        const newIds = new Map(incoming.flatMap((u, i) => (u.fileId ? [[u.fileId, added[i].id] as const] : [])));
        const placed: DeckGroup[] = group
          ? [group]
          : (fileGroups ?? []).flatMap((g) => {
              const fresh = made.get(g.fileId);
              const before = g.before ? newIds.get(g.before) : undefined;
              return fresh ? [{ ...fresh, ...(before ? { before } : top) }] : [];
            });
        if (placed.length) setGroups((all) => [...placed, ...all]);
        setDecks((all) => [...added, ...all]);
        return added;
      },
      duplicateDeck(id) {
        const original = getDeck(id);
        if (!original) return undefined;
        const now = Date.now();
        const copyId = newId();
        // The copy gets its own image files, so deleting either deck leaves the other's art alone. Cards that
        // share one image (from older app versions) keep sharing one copy of it.
        const copied = new Map<string, string>();
        const copyImage = (path: string) => {
          if (!copied.has(path)) copied.set(path, importImage(copyId, imageUri(path)));
          return copied.get(path)!;
        };
        // A copy is a deck of its own: not the one it was copied from, as far as files go (see Deck.origin).
        const { origin: _from, ...source } = original;
        const deck: Deck = {
          ...source,
          id: copyId,
          name: `${original.name} copy`,
          cards: original.cards.map(({ origin: _card, ...c }) => ({
            ...c,
            id: newId(),
            image: copyImage(c.image),
            ...(c.original ? { original: copyImage(c.original) } : {}),
            ...(c.back ? { back: copyImage(c.back) } : {}),
            ...(c.backOriginal ? { backOriginal: copyImage(c.backOriginal) } : {}),
          })),
          backImage: original.backImage ? copyImage(original.backImage) : null,
          backOriginal: original.backOriginal ? copyImage(original.backOriginal) : null,
          createdAt: now,
          updatedAt: now,
        };
        // Right after the original, in the same group.
        setDecks((all) => {
          const at = all.findIndex((d) => d.id === id);
          return at === -1 ? [deck, ...all] : [...all.slice(0, at + 1), deck, ...all.slice(at + 1)];
        });
        return deck;
      },
      renameDeck(id, name) {
        updateDeck(id, (d) => ({ ...d, name }));
      },
      deleteDeck(id) {
        dropPrevious(id);
        // A group lying just above it stays where it was.
        setGroups((all) => withoutDeck(all, decks, id));
        setDecks((all) => all.filter((d) => d.id !== id));
        tables.drop((key) => key === id || key.endsWith(`:${id}`));
        setSessions((all) => all.map((s) => ({ ...s, deckIds: s.deckIds.filter((d) => d !== id) })));
        deleteDeckFiles(id);
      },
      resetDeck(id, name) {
        dropPrevious(id);
        tables.drop((key) => key === id || key.endsWith(`:${id}`));
        deleteDeckFiles(id);
        updateDeck(id, (d) => ({ id: d.id, name, backImage: null, cards: [], groupId: d.groupId, createdAt: d.createdAt, updatedAt: Date.now() }));
      },
      refillDeck(id, name, cards, back) {
        const old = getDeck(id);
        if (!old) return undefined;
        dropPrevious(id, old);
        // The new pictures in first, then the old ones out (so nothing is lost if copying fails part way).
        const ids = new Map(old.cards.map((c) => [c.name, c.id]));
        const deck: Deck = {
          id,
          name,
          backImage: importImage(id, back),
          backOriginal: importImage(id, back),
          cards: cards.map((c) => ({ id: ids.get(c.name) ?? newId(), name: c.name, image: importImage(id, c.uri), original: importImage(id, c.uri) })),
          ...(old.groupId ? { groupId: old.groupId } : {}),
          createdAt: old.createdAt,
          updatedAt: Date.now(),
        };
        for (const path of [old.backImage, old.backOriginal, ...old.cards.flatMap((c) => [c.image, c.original, c.back, c.backOriginal])]) {
          if (path) deleteImage(path);
        }
        tables.drop((key) => key === id || key.endsWith(`:${id}`));
        setDecks((all) => all.map((d) => (d.id === id ? deck : d)));
        return deck;
      },
      addCards(deckId, uris, names, originals, backs) {
        const deck = getDeck(deckId);
        if (!deck) return;
        const start = deck.cards.length;
        const cards: Card[] = uris.map((uri, i) => {
          const back = backs?.[i];
          return {
            id: newId(),
            name: names?.[i] ?? `Card ${start + i + 1}`,
            image: importImage(deckId, uri),
            ...(originals?.[i] ? { original: importImage(deckId, originals[i]) } : {}),
            ...(back ? { back: importImage(deckId, back.uri), backOriginal: importImage(deckId, back.original) } : {}),
          };
        });
        updateDeck(deckId, (d) => ({ ...d, cards: [...d.cards, ...cards] }));
      },
      setCopies(deckId, cardId, copies) {
        updateDeck(deckId, (d) => ({
          ...d,
          cards: d.cards.map((c) => (c.id === cardId ? { ...c, copies: copiesOf({ copies }) } : c)),
        }));
      },
      renameCard(deckId, cardId, name) {
        updateDeck(deckId, (d) => ({
          ...d,
          cards: d.cards.map((c) => (c.id === cardId ? { ...c, name } : c)),
        }));
      },
      removeCard(deckId, cardId) {
        const deck = getDeck(deckId);
        const card = deck?.cards.find((c) => c.id === cardId);
        if (!deck || !card) return;
        // Cards duplicated by older app versions share one image file, so only delete it once nothing uses it.
        const stillUsed =
          deck.backImage === card.image || deck.cards.some((c) => c.id !== cardId && c.image === card.image);
        if (!stillUsed) deleteImageOf(deckId, card.image);
        if (card.original) deleteImageOf(deckId, card.original);
        if (card.back) deleteImageOf(deckId, card.back);
        if (card.backOriginal) deleteImageOf(deckId, card.backOriginal);
        updateDeck(deckId, (d) => ({ ...d, cards: d.cards.filter((c) => c.id !== cardId) }));
      },
      removeCards(deckId, cardIds) {
        const deck = getDeck(deckId);
        if (!deck) return;
        const gone = deck.cards.filter((c) => cardIds.includes(c.id));
        const kept = deck.cards.filter((c) => !cardIds.includes(c.id));
        // A picture still used by a card that's kept (or the deck's back) stays, as in `removeCard`.
        const used = new Set([deck.backImage, deck.backOriginal, ...kept.flatMap((c) => [c.image, c.original, c.back, c.backOriginal])]);
        const files = new Set(gone.flatMap((c) => [c.image, c.original, c.back, c.backOriginal]));
        for (const f of files) if (f && !used.has(f)) deleteImageOf(deckId, f);
        updateDeck(deckId, (d) => ({ ...d, cards: d.cards.filter((c) => !cardIds.includes(c.id)) }));
      },
      reorderCards(deckId, picked, to) {
        updateDeck(deckId, (d) => ({ ...d, cards: moveItems(d.cards, picked, to) }));
      },
      replaceCardImage(deckId, cardId, uri, original) {
        const deck = getDeck(deckId);
        const card = deck?.cards.find((c) => c.id === cardId);
        if (!deck || !card) return;
        const image = importImage(deckId, uri);
        const stillUsed =
          deck.backImage === card.image || deck.cards.some((c) => c.id !== cardId && c.image === card.image);
        if (!stillUsed) deleteImageOf(deckId, card.image);
        // A new original replaces the old one; without one, the card is just cut again from the one it has.
        const kept = original === undefined ? card.original : importImage(deckId, original);
        if (original !== undefined && card.original) deleteImageOf(deckId, card.original);
        updateDeck(deckId, (d) => ({
          ...d,
          cards: d.cards.map((c) => (c.id === cardId ? { ...c, image, ...(kept ? { original: kept } : {}) } : c)),
        }));
      },
      setCardBack(deckId, uri, original) {
        const deck = getDeck(deckId);
        if (!deck) return;
        const inUse = (path: string) => deck.cards.some((c) => c.image === path);
        if (deck.backImage && !inUse(deck.backImage)) deleteImageOf(deckId, deck.backImage);
        const backImage = uri ? importImage(deckId, uri) : null;
        // The uncropped picture: replaced when a new one is given, kept when the same one is just cut again, and
        // gone with the back.
        const replacing = original !== undefined || !uri;
        if (replacing && deck.backOriginal && !inUse(deck.backOriginal)) deleteImageOf(deckId, deck.backOriginal);
        const backOriginal = replacing ? (uri && original ? importImage(deckId, original) : null) : (deck.backOriginal ?? null);
        updateDeck(deckId, (d) => ({ ...d, backImage, backOriginal }));
      },
      setOwnBack(deckId, cardId, uri, original) {
        const card = getDeck(deckId)?.cards.find((c) => c.id === cardId);
        if (!card) return;
        // Its own back's files are its alone, so the old ones simply go (the original only when it's replaced).
        if (card.back) deleteImageOf(deckId, card.back);
        const replacing = original !== undefined || !uri;
        if (replacing && card.backOriginal) deleteImageOf(deckId, card.backOriginal);
        const back = uri ? importImage(deckId, uri) : undefined;
        const backOriginal = replacing ? (uri && original ? importImage(deckId, original) : undefined) : card.backOriginal;
        updateDeck(deckId, (d) => ({
          ...d,
          cards: d.cards.map((c) => {
            if (c.id !== cardId) return c;
            const { back: _b, backOriginal: _o, ...rest } = c;
            return { ...rest, ...(back ? { back } : {}), ...(back && backOriginal ? { backOriginal } : {}) };
          }),
        }));
      },
      setPlayMode(deckId, playMode) {
        updateDeck(deckId, (d) => ({ ...d, playMode }));
      },
      setHandFolded(deckId, handFolded) {
        updateDeck(deckId, (d) => ({ ...d, handFolded }));
      },
      setCardShape(deckId, cardShape) {
        updateDeck(deckId, (d) => ({ ...d, cardShape }));
      },
      setRoundness(deckId, roundness) {
        updateDeck(deckId, (d) => ({ ...d, roundness }));
      },
      getTable(deckId, sessionId) {
        const deck = getDeck(deckId);
        if (!deck) return undefined;
        const saved = tables.get(tableKey(deckId, sessionId));
        // A saved table gets any copies raised since it was saved, so the deck shows every copy it has.
        return saved ? topUpTable(pruneTable(saved, deck), deck) : createTable(deck);
      },
      setTable(deckId, sessionId, table) {
        tables.set(tableKey(deckId, sessionId), table);
      },
      sessions,
      getSession: (id) => sessions.find((s) => s.id === id),
      createSession(name, deckIds) {
        const now = Date.now();
        const session: Session = { id: newId(), name, deckIds, createdAt: now, updatedAt: now };
        setSessions((all) => [session, ...all]);
        return session;
      },
      updateSession(id, changes) {
        setSessions((all) => all.map((s) => (s.id === id ? { ...s, ...changes, updatedAt: Date.now() } : s)));
        // A deck taken out of the session keeps its game there, so taking one out by mistake loses nothing:
        // adding it back picks up where it left off. (Reset table starts it fresh; deleting the session clears it.)
      },
      moveSession(id, to) {
        setSessions((all) => {
          const session = all.find((s) => s.id === id);
          if (!session) return all;
          const rest = all.filter((s) => s.id !== id);
          return [...rest.slice(0, to), session, ...rest.slice(to)];
        });
      },
      groups,
      createGroup(name) {
        const group: DeckGroup = { id: newId(), name };
        setGroups((all) => [...all, group]);
        return group;
      },
      renameGroup(id, name) {
        setGroups((all) => all.map((g) => (g.id === id ? { ...g, name } : g)));
      },
      deleteGroup(id) {
        setGroups((all) => all.filter((g) => g.id !== id));
        setDecks((all) => all.map((d) => (d.groupId === id ? { ...d, groupId: undefined } : d)));
      },
      toggleGroup(id) {
        setGroups((all) => all.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g)));
      },
      setGroupOrder(next) {
        setGroups(next);
      },
      arrangeDecks(order, groupOf) {
        setDecks((all) => {
          const byId = new Map(all.map((d) => [d.id, d]));
          const placed = order.flatMap((id) => {
            const d = byId.get(id);
            return d ? [{ ...d, groupId: groupOf[id] }] : [];
          });
          const listed = new Set(order);
          return [...placed, ...all.filter((d) => !listed.has(d.id))];
        });
      },
      updateFromFile(deckId, u, same) {
        const old = latest.current.find((d) => d.id === deckId);
        if (!old) return undefined;
        const now = Date.now();
        // A picture several cards share is saved once (as in `importDecks`).
        const saved = new Map<string, string>();
        const save = (img: FilePicture) => {
          const key = pictureId(img);
          if (!saved.has(key)) saved.set(key, saveImageData(deckId, img.ext, pictureData(img)));
          return saved.get(key)!;
        };
        const byLine = new Map(old.cards.map((c) => [lineage(c), c]));
        const taken = new Set<string>();
        const cards: Card[] = u.cards.map((c) => {
          const line = fileLineage(c);
          const found = line ? byLine.get(line) : undefined;
          const mine = found && !taken.has(found.id) ? found : undefined;
          if (mine) taken.add(mine.id);
          // The same picture as here: that one's kept (and what it was cut from); otherwise the file's.
          const keptImage = !!mine && same(mine.image, c.image);
          const keptBack = !!c.back && !!mine?.back && same(mine.back, c.back);
          return {
            id: mine?.id ?? newId(),
            ...(line ? { origin: line } : {}),
            name: c.name,
            ...(c.copies ? { copies: c.copies } : {}),
            image: keptImage ? mine!.image : save(c.image),
            ...(keptImage && mine!.original ? { original: mine!.original } : {}),
            ...(c.back ? { back: keptBack ? mine!.back! : save(c.back) } : {}),
            ...(keptBack && mine!.backOriginal ? { backOriginal: mine!.backOriginal } : {}),
          };
        });
        const sameBack = !!old.backImage && !!u.back && same(old.backImage, u.back);
        const from = fileLineage(u);
        // Its place, group, games and how it's played kept; the rest as the file has it.
        const deck: Deck = {
          ...old,
          ...(from ? { origin: from } : {}),
          name: u.name,
          cardShape: u.cardShape,
          roundness: u.roundness,
          ...(u.playMode ? { playMode: u.playMode } : {}),
          backImage: u.back ? (sameBack ? old.backImage : save(u.back)) : null,
          backOriginal: sameBack ? (old.backOriginal ?? null) : null,
          cards,
          updatedAt: now,
        };
        // The version before (if any) gives way to this one: one is kept.
        dropPrevious(deckId, old, deck);
        setPrevious(deckId, { at: now, deck: old });
        setDecks((all) => all.map((d) => (d.id === deckId ? deck : d)));
        latest.current = latest.current.map((d) => (d.id === deckId ? deck : d));
        return deck;
      },
      restorePrevious(deckId) {
        const cur = latest.current.find((d) => d.id === deckId);
        const prev = previousOf(deckId);
        if (!cur || !prev) return;
        const now = Date.now();
        const merged = prev.merged;
        if (merged) {
          // Back just after the deck it was merged into, in its group if that's still here (else that deck's).
          setPrevious(deckId, undefined);
          const back: Deck = { ...merged, groupId: merged.groupId && groups.some((g) => g.id === merged.groupId) ? merged.groupId : cur.groupId };
          setDecks((all) => {
            if (all.some((d) => d.id === back.id)) return all;
            const at = all.findIndex((d) => d.id === deckId);
            return [...all.slice(0, at + 1), back, ...all.slice(at + 1)];
          });
          return;
        }
        if (!prev.deck) return;
        // The two swap: the one now showing is kept in turn, to put back again.
        setPrevious(deckId, { at: now, deck: cur });
        const back: Deck = { ...prev.deck, id: deckId, groupId: cur.groupId, updatedAt: now };
        setDecks((all) => all.map((d) => (d.id === deckId ? back : d)));
      },
      undoUpdate(deckId) {
        const cur = latest.current.find((d) => d.id === deckId);
        const prev = previousOf(deckId)?.deck;
        if (!cur || !prev) return;
        const back: Deck = { ...prev, id: deckId, groupId: cur.groupId };
        setPrevious(deckId, undefined);
        const used = filesOf(back);
        for (const f of filesOf(cur)) if (!used.has(f)) deleteImage(f);
        setDecks((all) => all.map((d) => (d.id === deckId ? back : d)));
      },
      mergeDecks(keepId, goneId) {
        const all = latest.current;
        const keep = all.find((d) => d.id === keepId);
        const gone = all.find((d) => d.id === goneId);
        if (!keep || !gone || keepId === goneId) return;
        // Tables' cards from it are now the kept deck's (those with no partner there stay as they were, and come
        // back if it does).
        repointSandboxes(goneId, keepId, cardPartners(gone, keep));
        setSessions((list) =>
          list.map((s) => (s.deckIds.includes(goneId) ? { ...s, deckIds: [...new Set(s.deckIds.map((d) => (d === goneId ? keepId : d)))] } : s)),
        );
        // Each one's version from before goes; the merged deck is kept (pictures, games and all) to bring back.
        dropPrevious(keepId, keep);
        dropPrevious(goneId, gone);
        setPrevious(keepId, { at: Date.now(), merged: gone });
        setGroups((list) => withoutDeck(list, all, goneId));
        setDecks((list) => list.filter((d) => d.id !== goneId));
        latest.current = latest.current.filter((d) => d.id !== goneId);
      },
      deleteSession(id) {
        setSessions((all) => all.filter((s) => s.id !== id));
        tables.drop((key) => key.startsWith(`${id}:`));
      },
    };
  }, [decks, tables, sessions, groups, updateDeck]);

  return <DecksContext.Provider value={api}>{children}</DecksContext.Provider>;
}

export function useDecks(): DecksApi {
  const ctx = useContext(DecksContext);
  if (!ctx) throw new Error('useDecks must be used inside DecksProvider');
  return ctx;
}
