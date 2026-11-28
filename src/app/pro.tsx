import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../components/AppIcon';
import { Button } from '../components/Button';
import { Text } from '../components/Text';
import { FREE_CARD_LIMIT } from '../lib/limits';
import { buyPro, isPro, restorePro, useProState } from '../lib/pro';
import { colors } from '../theme';

/** Why the screen was opened: the card limit reached, a deck file wanted, or something made with your own pictures. */
type Reason = 'cards' | 'files' | 'components';

const REASONS: Record<Reason, string> = {
  cards: `The free version holds ${FREE_CARD_LIMIT} cards. Pro removes the limit.`,
  files: 'Sharing and backing up decks and tables are part of Pro. Opening a file someone sends you is free.',
  components: 'Adding custom art, custom tokens and your own faces on dice and coins is part of Pro. Every other component is free, and so is playing with ones a friend shares.',
};

const PERKS: [string, string][] = [
  ['Unlimited cards', `No ${FREE_CARD_LIMIT}-card limit: every deck for every game, and every prototype.`],
  ['Custom pieces', 'Add custom art to the table: game boards, player dashboards, score tracks, and more. Plus custom tokens and your own faces on dice and coins.'],
  ['Share decks and tables', 'Send a deck, a group or a whole table to a friend as one file. Opening it is free for them.'],
  ['Back up', 'Keep everything safe in Files, and bring it to a new device.'],
  ['Support Shufflevale', 'Made by one person. Every Pro keeps it growing.'],
];

/** Shufflevale Pro: what it adds, its price, and buying or restoring it. Closes itself once Pro is on. */
export default function ProScreen() {
  const { reason } = useLocalSearchParams<{ reason?: Reason }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const pro = useProState();
  const on = isPro(pro);

  // Bought (or restored) while it's open: done, back to what they were doing.
  const wasOn = useRef(on);
  useEffect(() => {
    if (on && !wasOn.current && router.canGoBack()) router.back();
    wasOn.current = on;
  }, [on]);

  const body = (
    <>
      <AppIcon size={96} />
      <Text style={styles.title}>Shufflevale Pro</Text>
      {reason && REASONS[reason] && !on ? <Text style={styles.reason}>{REASONS[reason]}</Text> : null}

      <View style={styles.perks}>
        {PERKS.map(([title, body]) => (
          <View key={title} style={styles.perk}>
            <Text style={styles.check}>✓</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.perkTitle}>{title}</Text>
              <Text style={styles.perkBody}>{body}</Text>
            </View>
          </View>
        ))}
      </View>

      {on ? (
        <Text style={styles.owned}>You have Shufflevale Pro. Thank you!</Text>
      ) : (
        <>
          <Button
            label={pro.price ? `Unlock Pro · ${pro.price}` : 'Unlock Pro'}
            variant="primary"
            disabled={pro.busy}
            onPress={buyPro}
            style={styles.buy}
          />
          <Text style={styles.small}>One-time purchase. No subscription.</Text>
        </>
      )}
      {pro.busy ? <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} /> : null}

      {/* Apple asks for this: Pro bought before (or on another device) can always be brought back. */}
      <Pressable onPress={restorePro} disabled={pro.busy} hitSlop={10} accessibilityRole="button" style={({ pressed }) => [styles.restore, pressed && { opacity: 0.6 }]}>
        <Text style={styles.restoreText}>Restore Purchases</Text>
      </Pressable>
    </>
  );

  // On iPad: a card in the middle of the screen, as tall as it needs, up to nearly the whole height (portrait or
  // landscape, with room above and below). A tap outside it closes it. It scrolls if it's still too tall, so Restore
  // Purchases at the bottom is always reachable.
  if (IS_PAD) {
    return (
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.card, { width: Math.min(CARD_WIDTH, width - 48), maxHeight: height - insets.top - insets.bottom - CARD_ROOM * 2 }]}>
          <ScrollView style={styles.cardScroll} contentContainerStyle={styles.content}>
            {body}
          </ScrollView>
          <CloseButton style={styles.cardClose} />
        </View>
      </View>
    );
  }

  // On iPhone the whole screen, with Close in its top bar; it scrolls, so Restore Purchases at the bottom is always reachable.
  return (
    <>
      <Stack.Screen options={{ headerRight: () => <CloseButton /> }} />
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {body}
      </ScrollView>
    </>
  );
}

/** Closes the Pro screen: always in sight, so it's plain that Pro can be passed on. */
function CloseButton({ style }: { style?: object }) {
  return (
    <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => [style, pressed && { opacity: 0.6 }]}>
      <Text style={styles.closeText}>Close</Text>
    </Pressable>
  );
}

const IS_PAD = Platform.OS === 'ios' && Platform.isPad;
/** The iPad card's width at most, and the room kept above and below it. */
const CARD_WIDTH = 600;
const CARD_ROOM = 24;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // iPad: the screen dimmed behind the card, which sits in the middle.
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  card: {
    backgroundColor: colors.bg,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  // Only as tall as what's in it (up to the card's most).
  cardScroll: { flexGrow: 0 },
  content: { alignItems: 'center', padding: 24, paddingTop: 32 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700', marginTop: 14 },
  reason: { color: colors.accent, fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 21 },
  perks: { alignSelf: 'stretch', backgroundColor: colors.surface, borderRadius: 14, padding: 16, gap: 14, marginTop: 22 },
  perk: { flexDirection: 'row', gap: 12 },
  check: { color: colors.accent, fontSize: 17, fontWeight: '800', marginTop: 1 },
  perkTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  perkBody: { color: colors.textMuted, fontSize: 14, marginTop: 2, lineHeight: 19 },
  buy: { alignSelf: 'stretch', marginTop: 24 },
  small: { color: colors.textMuted, fontSize: 13, marginTop: 8 },
  owned: { color: colors.accent, fontSize: 16, fontWeight: '600', marginTop: 24 },
  restore: { marginTop: 20, padding: 6 },
  restoreText: { color: colors.textMuted, fontSize: 14, textDecorationLine: 'underline' },
  cardClose: { position: 'absolute', top: 16, right: 18 },
  closeText: { color: colors.accent, fontSize: 17, fontWeight: '600' },
});
