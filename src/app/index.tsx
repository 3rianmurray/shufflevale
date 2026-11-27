import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import type { AccessibilityActionEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '../components/ActionSheet';
import { Button } from '../components/Button';
import { CardView } from '../components/CardView';
import { LIFT_HOLD_MS, ReorderableList } from '../components/ReorderableList';
import { SwipeRow } from '../components/SwipeRow';
import type { SwipeSide } from '../components/SwipeRow';
import { useDecks } from '../lib/DecksContext';
import { askName } from '../lib/names';
import { DeckFileError, deckIdsOn } from '../lib/deckFile';
import { everythingFile, pickDeckFiles, readDeckFile, tableFile } from '../lib/deckExport';
import type { FileContents } from '../lib/deckExport';
import { whileBusy } from '../lib/busy';
import { backUpWithNotice, shareWithNotice } from '../lib/fileActions';
import { anyMatches, holdFile, useFileImport } from '../lib/useFileImport';
import { findDuplicates } from '../lib/deckMatch';
import { pictureComparer } from '../lib/pictureCompare';
import { previousOf, tableSlot, versionDate } from '../lib/previousVersions';
import { whenText } from '../lib/when';
import { countTablesByDeck, deleteDeckWarning } from '../lib/deckInUse';
import { cardRoom, cardsUsed, FREE_CARD_LIMIT } from '../lib/limits';
import { exampleAllowances, isPlayground, usePro } from '../lib/pro';
import * as haptics from '../lib/haptics';
import { buildRows, dropDeck, dropGroup } from '../lib/groups';
import type { DeckGroup, Row } from '../lib/groups';
import { isExampleDeck, isExampleTable, resetExampleLabel, useExamples } from '../lib/examples';
import {
  arrangeTables,
  createTableGroup,
  deleteSandbox,
  deleteTableGroup,
  duplicateSandbox,
  placedTables,
  renameTableGroup,
  restoreSandbox,
  toggleTableGroup,
  updateSandbox,
  useSandboxes,
  useTableGroups,
} from '../lib/sandboxStore';
import { loadSettings, saveSettings } from '../lib/storage';
import { offerTipAfterUses, resetTips, setTipsOn, tipsOn } from '../lib/tips';
import { startTour, tourEvent, useTourStep } from '../lib/tour';
import { deckSize } from '../lib/types';
import { colors } from '../theme';
import { Text } from '../components/Text';
import { TourSpot } from '../components/TourSpot';

/** What the walkthrough's deck is called. */
const SAMPLE_DECK = 'Sample Deck';

/** A press this far from a row's right edge is on its Play or ••• button, so it doesn't pick the row up. */
const BUTTON_ZONE = 100;

export default function HomeScreen() {
  const {
    decks,
    createDeck,
    deleteDeck,
    resetDeck,
    duplicateDeck,
    sessions,
    createSession,
    deleteSession,
    moveSession,
    getDeck,
    groups,
    createGroup,
    renameGroup,
    deleteGroup,
    toggleGroup,
    setGroupOrder,
    arrangeDecks,
  } = useDecks();
  const insets = useSafeAreaInsets();
  const sandboxes = useSandboxes();
  const tablesPerDeck = useMemo(() => countTablesByDeck(sandboxes), [sandboxes]);
  const tableGrouping = useTableGroups();
  const { addFile, addParts, fits, planFile } = useFileImport();

  // The walkthrough starts by itself the first time the app opens; after that, from the help button.
  useEffect(() => {
    const settings = loadSettings();
    if (settings.welcomed) return;
    saveSettings({ ...settings, welcomed: true });
    startTour();
  }, []);

  // Once: the app's examples (a deck of playing cards and a Solitaire table dealt from it), to show what Free
  // Play can do. Help can bring them back later.
  const examples = useExamples();
  useEffect(() => {
    const settings = loadSettings();
    // Made after the others came out: for those who had them already, just it.
    if (settings.solitaireMade) {
      examples.addPlayground().catch(() => {});
      return;
    }
    saveSettings({ ...settings, solitaireMade: true, playgroundMade: true });
    examples
      .restore()
      // Tried again next time.
      .catch(() => saveSettings({ ...loadSettings(), solitaireMade: false, playgroundMade: false }));
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A copy of a table, just after it (the Playground's too: a copy is an ordinary table). */
  const duplicateTable = (id: string) => duplicateSandbox(id);
  /** Duplicating or deleting from a menu: after a couple of times, the tip that swiping a row does it quicker. */
  const swipeTipSoon = () => offerTipAfterUses('home-swipe', 2, 1200);

  const [groupMenu, setGroupMenu] = useState<string | null>(null);
  const [tableGroupMenu, setTableGroupMenu] = useState<string | null>(null);
  /** The Table (Free Play, sandbox in the code) whose options are showing. */
  const [tableMenu, setTableMenu] = useState<string | null>(null);
  /** The app's menu (••• at the top): files and the examples. */
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  /** The menu is closing (at once) for Pro, or on iPad About, to come up over the screen. */
  const [leavingFor, setLeavingFor] = useState<'pro' | 'about' | null>(null);
  /**
   * The row swiped open (`deck:…`, `group:…` or `session:…`) and which of its buttons is showing: Delete on
   * the right, or a deck's Duplicate on the left. One at a time.
   */
  const [openRow, setOpenRow] = useState<{ key: string; side: SwipeSide } | null>(null);

  /** Props that let a row be swiped open, keyed so opening one closes the others. */
  const swipe = (key: string, onDelete: () => void, onDuplicate?: () => void) => ({
    open: openRow?.key === key ? openRow.side : null,
    onOpenChange: (side: SwipeSide | null) => setOpenRow((cur) => (side ? { key, side } : cur?.key === key ? null : cur)),
    onDelete,
    onDuplicate,
  });
  const closeRows = () => setOpenRow(null);

  // Shufflevale Pro: the free version's card limit, and deck files (see lib/pro, lib/limits).
  const pro = usePro();
  const allowances = exampleAllowances();
  const used = cardsUsed(decks, allowances);
  const openPro = (reason?: 'cards' | 'files') => router.push({ pathname: '/pro', params: reason ? { reason } : {} });

  const copyDeck = (id: string) => {
    closeRows();
    // A copy's cards are new cards, so they need room in the free version (an example's copy too).
    const copying = getDeck(id)?.cards.length ?? 0;
    if (copying > cardRoom(decks, allowances, pro)) {
      openPro('cards');
      return;
    }
    if (duplicateDeck(id)) haptics.success();
  };

  // Decks and sessions take things with them, so ask first. A group asks what's to become of its decks.
  const confirmDeleteGroup = (id: string) => {
    const group = groups.find((g) => g.id === id);
    const inIt = decks.filter((d) => d.groupId === id);
    if (!group) return;
    // Empty: nothing to lose.
    if (!inIt.length) {
      deleteGroup(id);
      swipeTipSoon();
      return;
    }
    haptics.warn();
    // The buttons say it all.
    Alert.alert(
      `Delete the group “${group.name}”?`,
      undefined,
      [
        {
          text: inIt.length === 1 ? 'Keep the deck' : 'Keep the decks',
          onPress: () => {
            deleteGroup(id);
            swipeTipSoon();
          },
        },
        {
          text: inIt.length === 1 ? 'Delete the deck too' : `Delete all ${inIt.length} decks too`,
          style: 'destructive',
          onPress: () => {
            for (const d of inIt) deleteDeck(d.id);
            deleteGroup(id);
          },
        },
        { text: 'Cancel', style: 'cancel', onPress: closeRows },
      ],
    );
  };
  const confirmDeleteDeck = (id: string, name: string) => {
    haptics.warn();
    Alert.alert(`Delete "${name}"?`, deleteDeckWarning(id, sessions, sandboxes), [
      { text: 'Cancel', style: 'cancel', onPress: closeRows },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDeck(id) },
    ]);
  };
  const confirmDeleteSession = (id: string, name: string) => {
    haptics.warn();
    Alert.alert(`Delete "${name}"?`, 'The decks themselves are kept.', [
      { text: 'Cancel', style: 'cancel', onPress: closeRows },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSession(id) },
    ]);
  };

  const rows = buildRows(decks, groups);
  const menuGroup = groups.find((g) => g.id === groupMenu);
  const menuTable = sandboxes.find((t) => t.id === tableMenu);

  const tour = useTourStep();
  const newDeck = () => {
    // In the walkthrough, it's the Sample Deck: the one from last time, started again, if it's still here.
    if (tour?.step.until === 'deck-created') {
      const settings = loadSettings();
      const old = settings.sampleDeckId ? getDeck(settings.sampleDeckId) : undefined;
      const id = old ? old.id : createDeck(SAMPLE_DECK).id;
      if (old) resetDeck(old.id, SAMPLE_DECK);
      else saveSettings({ ...settings, sampleDeckId: id });
      router.push({ pathname: '/deck/[id]', params: { id } });
      tourEvent('deck-created');
      return;
    }
    const deck = createDeck(`Deck ${decks.length + 1}`);
    router.push({ pathname: '/deck/[id]', params: { id: deck.id } });
    tourEvent('deck-created');
  };


  // Shufflevale files: sharing or backing up a deck, a group, a table or everything (part of Pro: without it, these
  // open the Pro screen instead), and opening one (free). (The share sheet and the Files pickers are system screens,
  // which iOS can only show once a menu has gone: hence `opensModal`.)
  /** A Share and a Back up action for a file of `what`, each marked PRO (opening Pro) until Pro is unlocked. */
  const fileActions = (label: string, what: () => FileContents, first?: boolean) => [
    { label: `Share ${label}`, pro: !pro, opensModal: pro, groupStart: first, onPress: pro ? () => shareWithNotice(what()) : () => openPro('files') },
    { label: `Back up ${label}`, pro: !pro, opensModal: pro, onPress: pro ? () => backUpWithNotice(what()) : () => openPro('files') },
  ];
  const groupFile = (groupId: string): FileContents => ({
    name: groups.find((g) => g.id === groupId)?.name ?? 'Group',
    decks: decks.filter((d) => d.groupId === groupId),
    groups: groups.filter((g) => g.id === groupId),
  });
  /**
   * Everything but the app's examples (Playing Cards, Solitaire, the Playground: Help brings them back as new). The
   * Playing Cards deck still goes if a table of the player's uses it.
   */
  const backupContents = (): FileContents => {
    const own = sandboxes.filter((t) => !isExampleTable(t.id));
    const used = new Set(own.flatMap((t) => [...deckIdsOn(t)]));
    return everythingFile(
      decks.filter((d) => !isExampleDeck(d) || used.has(d.id)),
      own,
      groups,
      tableGrouping,
    );
  };
  /**
   * Opens a Shufflevale file (or all the parts of one saved in parts): its decks go at the top of the list, and its
   * tables (pointed at them) with the rest. Free, as long as its cards fit in the free version; a backup saved in
   * parts (made with Pro, to be brought back) needs Pro.
   */
  const importFromFile = async () => {
    try {
      const picked = await pickDeckFiles();
      if (!picked) return;
      if (picked.length > 1 && !pro) return openPro('files');
      let tooBig = false;
      let choose = false;
      await whileBusy('Opening')(async () => {
        if (picked.length > 1) return addParts(picked);
        const found = await readDeckFile(picked[0]);
        let handed = false;
        try {
          // Some of it is here already: its choices first (the Open File screen takes the file from here).
          const plan = planFile(found);
          if (anyMatches(plan)) {
            holdFile(found, plan);
            handed = choose = true;
          } else if (fits(found)) addFile(found);
          else tooBig = true;
        } finally {
          if (!handed) found.done();
        }
      });
      if (choose) router.push({ pathname: '/open', params: { held: '1' } });
      // Its cards don't fit in the free version: Pro removes the limit.
      if (tooBig) openPro('cards');
    } catch (e) {
      haptics.warn();
      Alert.alert('Couldn’t open that file', e instanceof DeckFileError ? e.message : 'Something went wrong reading it.');
    }
  };

  /** Duplicate decks to merge (or keep both of): their screen, or word that there are none. */
  const findDuplicateDecks = () => {
    const kept = new Set(loadSettings().keptDuplicates ?? []);
    if (findDuplicates(decks, pictureComparer().saved, kept).length) router.push('/duplicates');
    else Alert.alert('No duplicates');
  };
  /** A table's version from before it was replaced from a file, back (asked first, with when it's from). */
  const confirmRestoreTable = (id: string) => {
    const prev = previousOf(tableSlot(id));
    if (!prev) return;
    Alert.alert(`Restore version from ${whenText(versionDate(prev))}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        onPress: () => {
          restoreSandbox(id);
          haptics.success();
        },
      },
    ]);
  };

  const newGroup = () => askName('New group', `Group ${groups.length + 1}`, (name) => createGroup(name));
  const newTableGroup = () => askName('New group', `Group ${tableGrouping.groups.length + 1}`, (name) => createTableGroup(name));
  const menuTableGroup = tableGrouping.groups.find((g) => g.id === tableGroupMenu);
  /** As a deck group's: what's to become of its tables, asked (empty, it just goes). */
  const confirmDeleteTableGroup = (id: string) => {
    const group = tableGrouping.groups.find((g) => g.id === id);
    if (!group) return;
    const inIt = sandboxes.filter((t) => tableGrouping.groupOf[t.id] === id);
    if (!inIt.length) {
      deleteTableGroup(id);
      swipeTipSoon();
      return;
    }
    haptics.warn();
    Alert.alert(`Delete the group “${group.name}”?`, undefined, [
      {
        text: inIt.length === 1 ? 'Keep the table' : 'Keep the tables',
        onPress: () => {
          deleteTableGroup(id);
          swipeTipSoon();
        },
      },
      {
        text: inIt.length === 1 ? 'Delete the table too' : `Delete all ${inIt.length} tables too`,
        style: 'destructive',
        onPress: () => deleteTableGroup(id, true),
      },
      { text: 'Cancel', style: 'cancel', onPress: closeRows },
    ]);
  };

  const drop = (row: Row, at: number) => {
    if (row.kind === 'end') return;
    // Either way, the decks' order and groups, and where each group lies among them.
    const next = row.kind === 'deck' ? dropDeck(decks, groups, row.id, at) : dropGroup(decks, groups, row.id, at);
    arrangeDecks(next.order, next.groupOf);
    setGroupOrder(next.groups);
  };

  /**
   * A row is one button to VoiceOver, so the buttons inside it (Play, •••) and its swipe buttons can't be reached
   * one by one. They're offered as the row's actions instead: swipe up or down on it to pick one.
   */
  const rowActions = (actions: { name: string; label: string; run: () => void }[]) => ({
    accessibilityActions: actions.map(({ name, label }) => ({ name, label })),
    onAccessibilityAction: (e: AccessibilityActionEvent) => actions.find((a) => a.name === e.nativeEvent.actionName)?.run(),
  });

  /** A group's header row (of decks or of tables): tap to open or close it, ••• for its options, swipe to delete. */
  const groupHeader = (
    group: DeckGroup,
    count: number,
    unit: 'deck' | 'table',
    lifted: boolean,
    on: { toggle: () => void; menu: () => void; remove: () => void },
  ) => {
    const groupRow = (
      <Pressable
        onPress={() => {
          on.toggle();
          haptics.tick();
        }}
        // Matches the list's hold-to-lift, so letting go after lifting doesn't also toggle the group.
        onLongPress={() => {}}
        delayLongPress={LIFT_HOLD_MS}
        accessibilityRole="button"
        accessibilityLabel={`${group.name}, group of ${count} ${count === 1 ? unit : `${unit}s`}, ${group.collapsed ? 'collapsed' : 'expanded'}`}
        {...rowActions([
          { name: 'options', label: 'Options', run: on.menu },
          { name: 'delete', label: 'Delete group', run: on.remove },
        ])}
        style={[styles.groupRow, lifted && styles.liftedRow]}>
        <Text style={styles.chevron}>{group.collapsed ? '▸' : '▾'}</Text>
        <Text style={styles.groupName} numberOfLines={1}>
          {group.name}
        </Text>
        <Text style={styles.groupCount}>{count}</Text>
        <Pressable onPress={on.menu} hitSlop={12} accessibilityRole="button" accessibilityLabel={`${group.name} options`}>
          <Text style={styles.groupMenu}>•••</Text>
        </Pressable>
      </Pressable>
    );
    return lifted ? (
      <View style={styles.groupGap}>{groupRow}</View>
    ) : (
      <SwipeRow style={styles.groupGap} radius={10} {...swipe(`${unit === 'deck' ? 'group' : 'tableGroup'}:${group.id}`, on.remove)}>
        {groupRow}
      </SwipeRow>
    );
  };

  const renderRow = (row: Row, lifted = false) => {
    // A group's end: a line under its decks. A deck dropped above it goes in the group; below it, out of it.
    if (row.kind === 'end') return <View style={styles.groupEnd} />;
    if (row.kind === 'group') {
      const group = groups.find((g) => g.id === row.id);
      if (!group) return null;
      return groupHeader(group, decks.filter((d) => d.groupId === group.id).length, 'deck', lifted, {
        toggle: () => toggleGroup(group.id),
        menu: () => setGroupMenu(group.id),
        remove: () => confirmDeleteGroup(group.id),
      });
    }
    const deck = getDeck(row.id);
    if (!deck) return null;
    const deckRow = (
      <Pressable
        style={({ pressed }) => [styles.row, lifted && styles.liftedRow, pressed && styles.rowPressed]}
        onPress={() => router.push({ pathname: '/deck/[id]', params: { id: deck.id } })}
        // Matches the list's hold-to-lift, so letting go after lifting doesn't also open the deck.
        onLongPress={() => {}}
        delayLongPress={LIFT_HOLD_MS}
        accessibilityRole="button"
        accessibilityLabel={`${deck.name}, ${deckSize(deck)} ${deckSize(deck) === 1 ? 'card' : 'cards'}`}
        accessibilityHint="Opens the deck to edit it."
        {...rowActions([
          ...(deck.cards.length
            ? [{ name: 'play', label: 'Play', run: () => router.push({ pathname: '/play/[id]', params: { id: deck.id } }) }]
            : []),
          { name: 'duplicate', label: 'Duplicate', run: () => copyDeck(deck.id) },
          { name: 'delete', label: 'Delete', run: () => confirmDeleteDeck(deck.id, deck.name) },
        ])}>
        <CardView deck={deck} card={deck.cards[0]} faceUp={!deck.backImage && !!deck.cards[0]} width={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {deck.name}
          </Text>
          <Text style={styles.meta}>
            {deckSize(deck)} {deckSize(deck) === 1 ? 'card' : 'cards'}
            {tablesPerDeck.get(deck.id) ? ` · on ${tablesPerDeck.get(deck.id)} ${tablesPerDeck.get(deck.id) === 1 ? 'table' : 'tables'}` : ''}
          </Text>
        </View>
        <Button
          label="Play"
          variant="primary"
          disabled={deck.cards.length === 0}
          onPress={() => router.push({ pathname: '/play/[id]', params: { id: deck.id } })}
        />
      </Pressable>
    );
    const indent = deck.groupId ? styles.inGroup : undefined;
    return lifted ? (
      <View style={indent}>{deckRow}</View>
    ) : (
      <SwipeRow
        style={indent}
        {...swipe(`deck:${deck.id}`, () => confirmDeleteDeck(deck.id, deck.name), () => copyDeck(deck.id))}>
        {deckRow}
      </SwipeRow>
    );
  };

  // Tables (sandboxes in the code, once called Free Play): big open tables to bring decks onto, Tabletop Simulator style.
  const confirmDeleteSandbox = (id: string, name: string) => {
    haptics.warn();
    Alert.alert(`Delete "${name}"?`, 'Its decks are kept; just this table goes.', [
      { text: 'Cancel', style: 'cancel', onPress: closeRows },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSandbox(id) },
    ]);
  };
  const tourTableId = (sandboxes.find((t) => t.name === 'Solitaire') ?? sandboxes[0])?.id;
  // The walkthrough opens a table: if there are none (the examples deleted), they're brought back for it.
  const wantsTable = tour?.step.until === 'tables-opened' && !sandboxes.length;
  useEffect(() => {
    if (wantsTable) examples.restore().catch(() => {});
    // Only as the step comes up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsTable]);
  const renderTable = (id: string, lifted: boolean) => {
    const t = sandboxes.find((s) => s.id === id);
    if (!t) return null;
    const open = () => router.push({ pathname: '/sandbox/[id]', params: { id: t.id } });
    const tableRow = (
            <Pressable
              style={({ pressed }) => [styles.row, lifted && styles.liftedRow, pressed && styles.rowPressed]}
              // As every row: tapping it shows its options (a table has no settings screen); Play goes straight in.
              onPress={() => setTableMenu(t.id)}
              // Matches the list's hold-to-lift, so letting go after lifting doesn't also show the options.
              onLongPress={() => {}}
              delayLongPress={LIFT_HOLD_MS}
              accessibilityRole="button"
              accessibilityLabel={`${t.name}, table`}
              accessibilityHint="Shows the table's options."
              {...rowActions([
                { name: 'play', label: 'Play', run: open },
                { name: 'duplicate', label: 'Duplicate', run: () => duplicateTable(t.id) },
                { name: 'delete', label: 'Delete', run: () => confirmDeleteSandbox(t.id, t.name) },
              ])}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {t.name}
                </Text>
                {isPlayground(t.id) ? (
                  <Text style={styles.meta} numberOfLines={1}>
                    Every component, ready to try.
                  </Text>
                ) : null}
              </View>
              {/* The walkthrough's table: the Solitaire one (or the first, without it). */}
              {t.id === tourTableId ? (
                <TourSpot id="home.table">
                  <Button label="Play" variant="primary" onPress={open} />
                </TourSpot>
              ) : (
                <Button label="Play" variant="primary" onPress={open} />
              )}
            </Pressable>
    );
    const indent = tableGrouping.groupOf[t.id] && tableGrouping.groups.some((g) => g.id === tableGrouping.groupOf[t.id]) ? styles.inGroup : undefined;
    return lifted ? (
      <View style={indent}>{tableRow}</View>
    ) : (
      <SwipeRow
        style={indent}
        {...swipe(`table:${t.id}`, () => confirmDeleteSandbox(t.id, t.name), () => {
          closeRows();
          if (duplicateTable(t.id)) haptics.success();
        })}>
        {tableRow}
      </SwipeRow>
    );
  };

  const renderSession = (id: string, lifted: boolean) => {
    const s = sessions.find((x) => x.id === id);
    if (!s) return null;
    const names = s.deckIds.flatMap((d) => getDeck(d)?.name ?? []);
    const sessionRow = (
            <Pressable
              style={({ pressed }) => [styles.row, lifted && styles.liftedRow, pressed && styles.rowPressed]}
              onPress={() => router.push({ pathname: '/session/edit', params: { id: s.id } })}
              // Matches the list's hold-to-lift, so letting go after lifting doesn't also open the session.
              onLongPress={() => {}}
              delayLongPress={LIFT_HOLD_MS}
              accessibilityRole="button"
              accessibilityLabel={`${s.name}, session: ${names.length ? names.join(', ') : 'no decks'}`}
              accessibilityHint="Opens the session to choose its decks."
              {...rowActions([
                ...(names.length
                  ? [{ name: 'play', label: 'Play', run: () => router.push({ pathname: '/session/[id]', params: { id: s.id } }) }]
                  : []),
                { name: 'duplicate', label: 'Duplicate', run: () => createSession(`${s.name} Copy`, s.deckIds) },
                { name: 'delete', label: 'Delete', run: () => confirmDeleteSession(s.id, s.name) },
              ])}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {names.length ? names.join(' · ') : 'No decks'}
                </Text>
              </View>
              <Button
                label="Play"
                variant="primary"
                disabled={names.length === 0}
                onPress={() => router.push({ pathname: '/session/[id]', params: { id: s.id } })}
              />
            </Pressable>
    );
    return lifted ? (
      sessionRow
    ) : (
      <SwipeRow
        {...swipe(`session:${s.id}`, () => confirmDeleteSession(s.id, s.name), () => {
          closeRows();
          createSession(`${s.name} Copy`, s.deckIds);
          haptics.success();
        })}>
        {sessionRow}
      </SwipeRow>
    );
  };

  /**
   * Everything on the home screen is one list, so tables and sessions can be held and dragged too: each section's
   * heading, then its rows. A row stays in its own section (see `dropRange`).
   */
  type HomeRow =
    | Row
    | { kind: 'heading'; id: 'tables' | 'sessions' | 'decks' }
    | { kind: 'table'; id: string }
    | { kind: 'tableGroup'; id: string }
    | { kind: 'tableEnd'; id: string }
    | { kind: 'session'; id: string };
  // Tables are grouped as decks are (the same rows: see lib/groups), each kind of row named for tables.
  const placed = placedTables(sandboxes, tableGrouping);
  const tableRows: HomeRow[] = buildRows(placed, tableGrouping.groups).map((r) =>
    r.kind === 'deck' ? { kind: 'table', id: r.id } : r.kind === 'group' ? { kind: 'tableGroup', id: r.id } : { kind: 'tableEnd', id: r.id },
  );
  const showTables = sandboxes.length > 0 || tableGrouping.groups.length > 0;
  const tablesStart = showTables ? 1 : 0;
  const sessionsStart = tablesStart + tableRows.length + (sessions.length ? 1 : 0);
  const decksStart = sessionsStart + sessions.length + 1;
  const homeRows: HomeRow[] = [
    ...(showTables ? [{ kind: 'heading' as const, id: 'tables' as const }] : []),
    ...tableRows,
    ...(sessions.length ? [{ kind: 'heading' as const, id: 'sessions' as const }] : []),
    ...sessions.map((s) => ({ kind: 'session' as const, id: s.id })),
    { kind: 'heading', id: 'decks' },
    ...rows,
  ];
  const dropRange = (r: HomeRow): [number, number] =>
    r.kind === 'table' || r.kind === 'tableGroup'
      ? [tablesStart, tablesStart + tableRows.length]
      : r.kind === 'session'
        ? [sessionsStart, sessionsStart + sessions.length]
        : [decksStart, homeRows.length];
  /** The group a deck or table dropped at `at` goes into (between its header and its end): its header's and end's rows. */
  const groupAt = (r: HomeRow, at: number): [number, number] | null => {
    if (r.kind !== 'deck' && r.kind !== 'table') return null;
    for (let i = at - 1; i >= 0; i--) {
      const k = homeRows[i].kind;
      if (k === 'end' || k === 'tableEnd' || k === 'heading') return null;
      if (k === 'group' || k === 'tableGroup') {
        const end = homeRows.findIndex((x, j) => j > i && (x.kind === 'end' || x.kind === 'tableEnd') && x.id === homeRows[i].id);
        return end === -1 ? null : [i, end];
      }
    }
    return null;
  };
  const dropHome = (r: HomeRow, at: number) => {
    if (r.kind === 'table' || r.kind === 'tableGroup') {
      const to = at - tablesStart;
      arrangeTables(r.kind === 'table' ? dropDeck(placed, tableGrouping.groups, r.id, to) : dropGroup(placed, tableGrouping.groups, r.id, to));
    } else if (r.kind === 'session') {
      const from = sessions.findIndex((s) => s.id === r.id);
      const to = at - sessionsStart;
      moveSession(r.id, to > from ? to - 1 : to);
    } else if (r.kind === 'deck' || r.kind === 'group') {
      drop(r, at - decksStart);
    }
  };

  const renderHeading = (id: 'tables' | 'sessions' | 'decks') =>
    id === 'decks' ? (
      <View style={[styles.sectionRow, decksStart > 1 && styles.laterSection]}>
        <Text style={styles.section}>Decks</Text>
        {/* A new group of decks (making decks is in the bar at the bottom). Tables have their own. */}
        <Pressable onPress={newGroup} hitSlop={10} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Text style={styles.sectionLink}>New Group</Text>
        </Pressable>
      </View>
    ) : id === 'tables' ? (
      <View style={styles.sectionRow}>
        <Text style={styles.section}>Tables</Text>
        <Pressable onPress={newTableGroup} hitSlop={10} accessibilityRole="button" accessibilityLabel="New table group" style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Text style={styles.sectionLink}>New Group</Text>
        </Pressable>
      </View>
    ) : (
      <View style={[styles.sectionRow, showTables && styles.laterSection]}>
        <Text style={styles.section}>Sessions</Text>
      </View>
    );

  const renderTableGroup = (id: string, lifted: boolean) => {
    const group = tableGrouping.groups.find((g) => g.id === id);
    if (!group) return null;
    const count = placed.filter((t) => t.groupId === id).length;
    return groupHeader(group, count, 'table', lifted, {
      toggle: () => toggleTableGroup(id),
      menu: () => setTableGroupMenu(id),
      remove: () => confirmDeleteTableGroup(id),
    });
  };

  const renderHome = (r: HomeRow, lifted = false) =>
    r.kind === 'heading'
      ? renderHeading(r.id)
      : r.kind === 'table'
        ? renderTable(r.id, lifted)
        : r.kind === 'tableGroup'
          ? renderTableGroup(r.id, lifted)
          : r.kind === 'tableEnd'
            ? <View style={styles.groupEnd} />
            : r.kind === 'session'
              ? renderSession(r.id, lifted)
              : renderRow(r, lifted);

  return (
    <View style={styles.screen}>
      {/* The app's menu (help, its files, the examples): just its three lines, without iOS's glass bubble behind. */}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="line.3.horizontal"
          tintColor={colors.accent}
          hidesSharedBackground
          accessibilityLabel="Menu"
          onPress={() => setAppMenuOpen(true)}
        />
      </Stack.Toolbar>
      <ReorderableList
        rows={homeRows}
        keyOf={(r) => `${r.kind}:${r.id}`}
        renderRow={(r) => <View style={r.kind === 'heading' ? undefined : styles.rowWrap}>{renderHome(r)}</View>}
        renderLifted={(r) => <View style={styles.liftedWrap}>{renderHome(r, true)}</View>}
        // Headings stay put, and a row swiped open can't be picked up: a press on it closes it instead.
        canLift={(r, x, width) => r.kind !== 'heading' && r.kind !== 'end' && r.kind !== 'tableEnd' && openRow?.key !== `${r.kind}:${r.id}` && x < width - BUTTON_ZONE}
        dropRange={dropRange}
        groupAt={groupAt}
        onDrop={dropHome}
        bottomInset={insets.bottom + 92}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 120 }]}
        footer={
          decks.length || groups.length ? (
            <Text style={styles.hint}>Hold any row to drag it. Drop a deck or table under a group to file it there.</Text>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No decks yet</Text>
              <Text style={styles.emptyBody}>
                Create a deck and add your own card art. Then play it, turning its cards over one by one, or lay it out on a table.
              </Text>
            </View>
          )
        }
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + 4 }]}>
        {/* The three things to make: a deck (the cards), a session (decks to flip through), a table (to lay out). */}
        <View style={styles.footerButtons}>
          <TourSpot id="home.newDeck" style={{ flex: 1 }}>
            <Button label="+ Deck" variant="primary" onPress={newDeck} />
          </TourSpot>
          <Button label="+ Session" onPress={() => router.push('/session/edit')} disabled={decks.length === 0} style={{ flex: 1 }} />
          <Button label="+ Table" onPress={() => router.push('/sandbox/new')} style={{ flex: 1 }} />
        </View>
      </View>

      <ActionSheet
        visible={appMenuOpen}
        title="Shufflevale"
        // On iPad it drops from the top right corner, under the three lines; on iPhone, a sheet from the bottom.
        place={Platform.OS === 'ios' && Platform.isPad ? { kind: 'drop', corner: 'right' } : undefined}
        onClose={() => setAppMenuOpen(false)}
        // For Pro (and About, on iPad): the menu goes at once, and the window comes up once it has gone (iOS shows one
        // modal at a time).
        closeInstantly={!!leavingFor}
        afterClose={() => {
          if (!leavingFor) return;
          setLeavingFor(null);
          if (leavingFor === 'pro') openPro();
          else router.push('/about');
        }}
        // Shufflevale Pro, set apart at the top: gold-edged, with what's left of the free version's cards.
        banner={
          <Pressable
            onPress={() => {
              setLeavingFor('pro');
              setAppMenuOpen(false);
            }}
            accessibilityRole="button"
            accessibilityLabel={pro ? 'Shufflevale Pro, unlocked' : `Shufflevale Pro, ${used} of ${FREE_CARD_LIMIT} free cards used`}
            style={({ pressed }) => [styles.proBanner, pressed && { opacity: 0.8 }]}>
            <LinearGradient colors={['#3a2f17', colors.surfaceRaised]} start={{ x: 0, y: 0 }} end={{ x: 0.75, y: 0.75 }} style={StyleSheet.absoluteFill} />
            <View style={styles.proStar}>
              <Text style={styles.proStarText}>✦</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.proTitle}>Shufflevale Pro</Text>
              <Text style={styles.proSub} numberOfLines={1}>
                {pro ? 'Unlocked · thank you!' : `Unlimited cards · ${Math.min(used, FREE_CARD_LIMIT)} of ${FREE_CARD_LIMIT} used`}
              </Text>
            </View>
            <Text style={styles.proChevron}>›</Text>
          </Pressable>
        }
        actions={[
          // Learning the app (and its examples); files (part of Pro, tagged until it's unlocked); about the app.
          { label: 'Help', onPress: () => router.push('/help') },
          // Tips (now and then, the first times things are used): all of them again, or off (or on).
          { label: 'Show tips again', onPress: () => {
            resetTips();
            haptics.success();
          } },
          tipsOn()
            ? { label: 'Turn tips off', onPress: () => setTipsOn(false) }
            : { label: 'Turn tips on', onPress: () => setTipsOn(true) },
          {
            label: 'Restore examples',
            opensModal: true,
            onPress: examples.confirmRestore,
          },
          // (Free: opening a file someone's shared.)
          { label: 'Import decks or tables', opensModal: true, groupStart: true, onPress: importFromFile },
          ...(decks.length > 1 ? [{ label: 'Find duplicate decks', opensModal: true, onPress: findDuplicateDecks }] : []),
          ...(decks.length
            ? [
                {
                  label: 'Back up everything',
                  pro: !pro,
                  opensModal: pro,
                  onPress: pro ? () => backUpWithNotice(backupContents()) : () => openPro('files'),
                },
              ]
            : []),
          // The version running (down to the update), and where to get help.
          // (On iPad it's a window over the screen, so the menu goes at once first, as for Pro.)
          Platform.OS === 'ios' && Platform.isPad
            ? { label: 'About Shufflevale', groupStart: true, keepsOpen: true, onPress: () => {
                setLeavingFor('about');
                setAppMenuOpen(false);
              } }
            : { label: 'About Shufflevale', groupStart: true, onPress: () => router.push('/about') },
        ]}
      />

      <ActionSheet
        visible={!!menuGroup}
        title={menuGroup?.name}
        onClose={() => setGroupMenu(null)}
        actions={
          menuGroup
            ? [
                ...(Platform.OS === 'ios'
                  ? [
                      {
                        label: 'Rename group',
                        opensModal: true,
                        onPress: () => askName('Rename group', menuGroup.name, (name) => renameGroup(menuGroup.id, name)),
                      },
                    ]
                  : []),
                // The group's decks in one file, to give to a friend or keep somewhere safe.
                ...(decks.some((d) => d.groupId === menuGroup.id) ? fileActions('group', () => groupFile(menuGroup.id), true) : []),
                {
                  label: 'Delete group…',
                  destructive: true,
                  groupStart: true,
                  // It asks what's to become of the group's decks, once this menu has gone.
                  opensModal: true,
                  onPress: () => confirmDeleteGroup(menuGroup.id),
                },
              ]
            : []
        }
      />

      <ActionSheet
        visible={!!menuTableGroup}
        title={menuTableGroup?.name}
        onClose={() => setTableGroupMenu(null)}
        actions={
          menuTableGroup
            ? [
                ...(Platform.OS === 'ios'
                  ? [
                      {
                        label: 'Rename group',
                        opensModal: true,
                        onPress: () => askName('Rename group', menuTableGroup.name, (name) => renameTableGroup(menuTableGroup.id, name)),
                      },
                    ]
                  : []),
                {
                  label: 'Delete group…',
                  destructive: true,
                  groupStart: true,
                  opensModal: true,
                  onPress: () => confirmDeleteTableGroup(menuTableGroup.id),
                },
              ]
            : []
        }
      />

      <ActionSheet
        visible={!!menuTable}
        title={menuTable?.name}
        onClose={() => setTableMenu(null)}
        actions={
          menuTable
            ? [
                { label: 'Play', onPress: () => router.push({ pathname: '/sandbox/[id]', params: { id: menuTable.id } }) },
                ...(Platform.OS === 'ios'
                  ? [
                      {
                        label: 'Rename',
                        opensModal: true,
                        onPress: () => askName('Rename table', menuTable.name, (name) => updateSandbox({ ...menuTable, name })),
                      },
                    ]
                  : []),
                {
                  label: 'Duplicate',
                  onPress: () => {
                    duplicateTable(menuTable.id);
                    swipeTipSoon();
                  },
                },
                // Solitaire and the Playground: back as they first were.
                ...(isExampleTable(menuTable.id)
                  ? [{ label: resetExampleLabel(menuTable.id), opensModal: true, onPress: () => examples.confirmResetTable(menuTable) }]
                  : []),
                // Replaced from a file: the table as it was before, back.
                ...(previousOf(tableSlot(menuTable.id)) ? [{ label: 'Restore previous version', opensModal: true, onPress: () => confirmRestoreTable(menuTable.id) }] : []),
                // The table as it lies, with the decks its cards come from.
                ...fileActions('table', () => tableFile(menuTable, decks), true),
                {
                  label: 'Delete',
                  destructive: true,
                  opensModal: true,
                  groupStart: true,
                  onPress: () => {
                    confirmDeleteSandbox(menuTable.id, menuTable.name);
                    swipeTipSoon();
                  },
                },
              ]
            : []
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLink: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  // Shufflevale Pro's banner at the top of the app's menu (see the menu).
  proBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  proStar: { width: 36, height: 36, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  proStarText: { color: colors.accentText, fontSize: 18, fontWeight: '900' },
  proTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  proSub: { color: '#c9b68a', fontSize: 13, marginTop: 2 },
  proChevron: { color: colors.accent, fontSize: 24, fontWeight: '600' },
  // A section after another: a little more room above it than between rows.
  laterSection: { marginTop: 6 },
  rowWrap: { paddingBottom: 10 },
  liftedWrap: { paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
  },
  // Decks in a group sit slightly indented under its header.
  inGroup: { marginLeft: 14 },
  // Keeps the group's end row (drops and the drag outline use it) without drawing a line or taking up space.
  groupEnd: { marginLeft: 14, height: 0 },
  liftedRow: { backgroundColor: colors.surfaceRaised },
  // Pressed: a lighter tint, not a fade (a faded row lets the swipe buttons behind it show through).
  rowPressed: { backgroundColor: colors.surfaceRaised },
  // Outside the row itself, so a swiped-open group's Delete button is only as tall as the group row.
  groupGap: { marginTop: 6 },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    // A touch of gold over the page, made solid so the swipe's Delete button doesn't show through.
    backgroundColor: '#282620',
    borderWidth: 1,
    borderColor: '#695732',
  },
  chevron: { color: colors.accent, fontSize: 16, width: 14 },
  groupName: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
  groupCount: { color: colors.textMuted, fontSize: 14 },
  groupMenu: { color: colors.accent, fontSize: 16, fontWeight: '700', paddingLeft: 8 },
  name: { color: colors.text, fontSize: 17, fontWeight: '600' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  hint: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 8 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 16, gap: 10 },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  emptyBody: { color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  section: { color: colors.textMuted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  footerButtons: { flexDirection: 'row', gap: 10 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
