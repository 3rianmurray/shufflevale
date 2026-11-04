import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { CardView } from '../components/CardView';
import { Text } from '../components/Text';
import { useDecks } from '../lib/DecksContext';
import { findDuplicates, pairKey } from '../lib/deckMatch';
import type { DuplicatePair } from '../lib/deckMatch';
import * as haptics from '../lib/haptics';
import { pictureComparer } from '../lib/pictureCompare';
import { loadSettings, saveSettings } from '../lib/storage';
import { deckSize } from '../lib/types';
import type { Deck } from '../lib/types';
import { showUndo } from '../lib/undoBar';
import { dayText, whenText } from '../lib/when';
import { colors } from '../theme';

/**
 * The player's duplicate decks, in pairs (the same in every way, or two versions of one from the same place: see
 * deckMatch), each with when it was added, to merge into one (its tables and sessions then use the one kept; Undo
 * and Restore previous version bring the other back) or keep both of (not offered again).
 */
export default function DuplicatesScreen() {
  const { decks, mergeDecks } = useDecks();
  const insets = useSafeAreaInsets();
  const [kept, setKept] = useState(() => new Set(loadSettings().keptDuplicates ?? []));
  const pairs = useMemo(() => findDuplicates(decks, pictureComparer().saved, kept), [decks, kept]);

  const keepBoth = (p: DuplicatePair) => {
    const next = new Set(kept).add(pairKey(p.a.id, p.b.id));
    setKept(next);
    saveSettings({ ...loadSettings(), keptDuplicates: [...next] });
    if (pairs.length === 1) router.back();
  };
  const merge = (keep: Deck, gone: Deck) => {
    mergeDecks(keep.id, gone.id);
    haptics.success();
    showUndo({ label: `Merged “${keep.name}”`, mergedInto: keep.id });
    if (pairs.length === 1) router.back();
  };
  /** Identical: the older is kept. Two versions: which to keep, by when each was last changed. */
  const askMerge = (p: DuplicatePair) => {
    if (p.identical) return merge(p.a, p.b);
    const label = (d: Deck) => `Keep “${d.name}” · ${whenText(d.updatedAt)}`;
    Alert.alert('Keep which version?', undefined, [
      { text: label(p.a), onPress: () => merge(p.a, p.b) },
      { text: label(p.b), onPress: () => merge(p.b, p.a) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const deckLine = (d: Deck) => (
    <View style={styles.deck}>
      <CardView deck={d} card={d.cards[0]} faceUp={!d.backImage && !!d.cards[0]} width={40} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {d.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          Added {dayText(d.createdAt)} · {deckSize(d)} {deckSize(d) === 1 ? 'card' : 'cards'}
        </Text>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}>
      {pairs.length ? null : <Text style={styles.empty}>No duplicates</Text>}
      {pairs.map((p) => (
        <View key={pairKey(p.a.id, p.b.id)} style={styles.pair}>
          <Text style={styles.kind}>{p.identical ? 'Identical' : 'Different versions'}</Text>
          {deckLine(p.a)}
          {deckLine(p.b)}
          <View style={styles.buttons}>
            <Button label="Merge" variant="primary" onPress={() => askMerge(p)} style={{ flex: 1 }} />
            <Button label="Keep both" onPress={() => keepBoth(p)} style={{ flex: 1 }} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  empty: { color: colors.textMuted, fontSize: 15, textAlign: 'center', marginTop: 40 },
  pair: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, gap: 10 },
  kind: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  deck: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 2 },
});
