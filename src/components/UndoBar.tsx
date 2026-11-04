import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDecks } from '../lib/DecksContext';
import * as haptics from '../lib/haptics';
import { deleteSandbox, undoReplaceSandbox } from '../lib/sandboxStore';
import { hideUndo, useUndoChange } from '../lib/undoBar';
import { colors } from '../theme';
import { Text } from './Text';

/** How long the bar stays before it goes by itself. */
const SHOW_MS = 10_000;

/**
 * Over every screen, for a moment after an import updated or replaced something, or decks were merged: what changed,
 * and Undo, putting it all back as it was (see lib/undoBar).
 */
export function UndoBar() {
  const change = useUndoChange();
  const insets = useSafeAreaInsets();
  const { decks, deleteDeck, deleteGroup, undoUpdate, restorePrevious } = useDecks();

  useEffect(() => {
    if (!change) return;
    const timer = setTimeout(hideUndo, SHOW_MS);
    return () => clearTimeout(timer);
  }, [change]);

  const undo = () => {
    if (!change) return;
    hideUndo();
    const added = new Set(change.addedDecks ?? []);
    // The groups made for the decks added go with them, once they're empty.
    const groupsMade = new Set(decks.filter((d) => added.has(d.id) && d.groupId).map((d) => d.groupId!));
    for (const id of added) deleteDeck(id);
    for (const g of groupsMade) if (!decks.some((d) => !added.has(d.id) && d.groupId === g)) deleteGroup(g);
    for (const id of change.addedTables ?? []) deleteSandbox(id);
    for (const id of change.updatedDecks ?? []) undoUpdate(id);
    for (const id of change.replacedTables ?? []) undoReplaceSandbox(id);
    if (change.mergedInto) restorePrevious(change.mergedInto);
    haptics.success();
  };

  if (!change) return null;
  return (
    <Animated.View
      key={change.key}
      entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(180)}
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + 12 }]}>
      <Pressable onPress={hideUndo} accessibilityRole="button" accessibilityHint="Puts this away." style={styles.bar}>
        <Text style={styles.text} numberOfLines={2}>
          {change.label}
        </Text>
        <Pressable onPress={undo} hitSlop={10} accessibilityRole="button" style={({ pressed }) => [styles.undo, pressed && { opacity: 0.6 }]}>
          <Text style={styles.undoText}>Undo</Text>
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  bar: {
    width: '100%',
    maxWidth: 440,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(16,22,30,0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(224,179,84,0.45)',
    boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.35)',
  },
  text: { flex: 1, color: colors.text, fontSize: 15 },
  undo: { paddingHorizontal: 4 },
  undoText: { color: colors.accent, fontSize: 15, fontWeight: '700' },
});
