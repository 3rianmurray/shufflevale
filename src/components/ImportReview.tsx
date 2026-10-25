import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as haptics from '../lib/haptics';
import { rotateImage } from '../lib/images';
import { pairingNote, pairUp, swapSides } from '../lib/importBatch';
import type { Pairing } from '../lib/importBatch';
import { cardRadius } from '../lib/types';
import { colors } from '../theme';
import { Button } from './Button';
import { CropModal } from './CropModal';
import { TipToast } from './TipToast';
import { Text } from './Text';

/** A picture coming in, fitted to the card, and what it was cut from (to cut it again later). */
export interface ImportPicture {
  uri: string;
  original: string;
}

interface Props {
  /** The pictures coming in, in the order they came. The screen is shown while this is set. */
  pictures: ImportPicture[] | null;
  cardRatio: number;
  roundness?: number;
  /** How many more cards the free version has room for (Infinity with Pro). */
  room: number;
  onRoundness: (r: number) => void;
  /** The cards to add, in order, each with its own back if it has one. */
  onAdd: (cards: { front: ImportPicture; back?: ImportPicture }[]) => void;
  onCancel: () => void;
}

const PADDING = 16;
const GAP = 12;

const PAIRINGS: [Pairing, string][] = [
  ['none', 'Same back'],
  ['inTurn', 'Front, back…'],
  ['halves', 'Fronts, then backs'],
];

/**
 * Every card coming in, to check over before it's added: what it looks like, and its own back if the pictures
 * include backs (scanned in turn, or all the fronts and then the backs). A picture tapped can be turned, cut
 * again or taken out (the cards after it pair up again), and a card's two sides swapped.
 */
export function ImportReview({ pictures, cardRatio, roundness, room, onRoundness, onAdd, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const [list, setList] = useState<ImportPicture[]>([]);
  const [pairing, setPairing] = useState<Pairing>('none');
  /** The picture tapped (where it is in the list), whose options show at the bottom. */
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  /** The picture being cut again, in the cropper. */
  const [cropping, setCropping] = useState<number | null>(null);

  // New pictures: start afresh, every picture a card. Set during render, React's way for state that follows a prop.
  const [source, setSource] = useState<ImportPicture[] | null>(null);
  if (pictures && pictures !== source) {
    setSource(pictures);
    setList(pictures);
    setPairing('none');
    setPicked(null);
  }

  const cards = pairUp(list, pairing);
  const paired = pairing !== 'none';
  const adding = Math.min(cards.length, room);
  const note = pairingNote(list.length, pairing);

  // Fronts on their own, three to a row (five on a wide screen); a front and its back side by side, a pair to a
  // row (two on a wide screen).
  const perRow = paired ? (screenW > 600 ? 2 : 1) : screenW > 600 ? 5 : 3;
  const cell = (screenW - PADDING * 2 - GAP * (perRow - 1)) / perRow;
  const cardW = paired ? Math.min(150, (cell - GAP) / 2) : cell;
  const cardH = cardW / cardRatio;

  const replace = (at: number, next: ImportPicture) => setList((l) => l.map((p, i) => (i === at ? next : p)));
  const turn = async (at: number) => {
    const p = list[at];
    setBusy(true);
    try {
      const uri = (await rotateImage(p.uri, 180)).uri;
      const original = p.original === p.uri ? uri : (await rotateImage(p.original, 180)).uri;
      replace(at, { uri, original });
      haptics.tick();
    } catch (e) {
      Alert.alert('Couldn’t turn it', String(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = (at: number) => {
    setList((l) => l.filter((_, i) => i !== at));
    setPicked(null);
    haptics.drop();
  };
  const swap = (cardIndex: number) => {
    setList((l) => swapSides(l, pairing, cardIndex));
    setPicked(null);
    haptics.tick();
  };

  const cancel = () =>
    Alert.alert(`Discard ${list.length === 1 ? 'this picture' : `these ${list.length} pictures`}?`, 'Nothing has been added to the deck yet.', [
      { text: 'Keep checking', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onCancel },
    ]);
  const add = () => {
    onAdd(cards.map((c) => ({ front: c.front, ...(c.back ? { back: c.back } : {}) })));
    haptics.success();
  };

  /** One picture: a card, as it will look, tapped to pick it out. */
  const picture = (at: number, label: string) => {
    const p = list[at];
    const on = picked === at;
    const cutOut = /\.png$/i.test(p.uri);
    return (
      <Pressable
        key={at}
        onPress={() => {
          setPicked(on ? null : at);
          haptics.tick();
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${label}${cutOut ? ', cut out' : ''}`}
        style={[
          styles.picture,
          { width: cardW, height: cardH, borderRadius: cardRadius({ roundness }, cardW) },
          // A cut-out: its frame outlined, so its see-through parts show as see-through.
          cutOut ? styles.cutOut : styles.solid,
          on && styles.pictureOn,
        ]}>
        <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
      </Pressable>
    );
  };

  const pickedCard = picked === null ? null : cards.findIndex((c) => c.frontAt === picked || c.backAt === picked);
  const pickedHasPair = pickedCard !== null && pickedCard !== -1 && cards[pickedCard].backAt !== undefined;

  return (
    <Modal visible={pictures !== null} animationType="slide" presentationStyle="fullScreen" onRequestClose={cancel}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24, paddingHorizontal: PADDING, gap: 14 }}>
          <Text style={styles.title}>Check your cards</Text>
          <View>
            <Text style={styles.label}>Backs</Text>
            <View style={styles.segment}>
              {PAIRINGS.map(([value, text]) => (
                <Pressable
                  key={value}
                  onPress={() => {
                    setPairing(value);
                    setPicked(null);
                    haptics.tick();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: pairing === value }}
                  style={[styles.segmentItem, pairing === value && styles.segmentSelected]}>
                  <Text style={[styles.segmentText, pairing === value && { color: colors.accentText }]} numberOfLines={1}>
                    {text}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.help}>
              {pairing === 'none'
                ? 'Every card gets the deck’s back. Scanned each card’s back too? Choose how, and they pair up.'
                : pairing === 'inTurn'
                  ? 'Each front, then its own back. Tap a picture to turn it, cut it again or take it out.'
                  : 'All the fronts, then all their backs in the same order. Tap a picture to turn it, cut it again or take it out.'}
            </Text>
            {note ? <Text style={styles.note}>{note}</Text> : null}
            {adding < cards.length ? (
              <Text style={styles.note}>
                {adding
                  ? `The free version has room for ${adding} more ${adding === 1 ? 'card' : 'cards'}: the first ${adding} will be added.`
                  : 'The free version has no room for more cards.'}
              </Text>
            ) : null}
          </View>

          <View style={styles.grid}>
            {cards.map((c, i) =>
              paired ? (
                <View key={i} style={[styles.pair, { width: cell }]}>
                  <Text style={styles.number}>{i + 1}</Text>
                  {picture(c.frontAt, `Card ${i + 1}, front`)}
                  {c.backAt !== undefined ? (
                    picture(c.backAt, `Card ${i + 1}, back`)
                  ) : (
                    <View style={[styles.noBack, { width: cardW, height: cardH, borderRadius: cardRadius({ roundness }, cardW) }]}>
                      <Text style={styles.noBackText}>Deck’s back</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View key={i} style={{ width: cell, gap: 4 }}>
                  {picture(c.frontAt, `Card ${i + 1}`)}
                  <Text style={styles.numberUnder}>{i + 1}</Text>
                </View>
              ),
            )}
          </View>
        </ScrollView>

        <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
          {picked !== null && picked < list.length ? (
            // What can be done to the picture tapped.
            <View style={styles.pickedRow}>
              <Button label="Turn 180°" onPress={() => turn(picked)} disabled={busy} style={{ flex: 1 }} />
              <Button label="Crop" onPress={() => setCropping(picked)} disabled={busy} style={{ flex: 1 }} />
              {pickedHasPair ? <Button label="Swap sides" onPress={() => swap(pickedCard!)} disabled={busy} style={{ flex: 1 }} /> : null}
              <Button label="Take out" variant="danger" onPress={() => remove(picked)} disabled={busy} style={{ flex: 1 }} />
            </View>
          ) : null}
          <View style={styles.pickedRow}>
            <Button label="Cancel" onPress={cancel} disabled={busy} style={{ flex: 1 }} />
            <Button
              label={`Add ${adding} ${adding === 1 ? 'card' : 'cards'}`}
              variant="primary"
              onPress={add}
              disabled={busy || adding === 0}
              style={{ flex: 2 }}
            />
          </View>
        </View>
        {busy ? (
          <View style={styles.busy} pointerEvents="none">
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : null}
      </View>
      {/* Cutting a picture again, from what it was cut from: over this screen, which stays as it was. */}
      <CropModal
        uris={cropping !== null && list[cropping] ? [list[cropping].original] : []}
        ratio={cardRatio}
        roundness={roundness}
        onRoundness={onRoundness}
        onDone={(cropped, originals) => {
          if (cropping !== null) replace(cropping, { uri: cropped[0], original: originals[0] });
          setCropping(null);
        }}
        onCancel={() => setCropping(null)}
      />
      {/* This screen is its own window, over the app's: tips show here too. */}
      <TipToast />
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 10, padding: 3, marginTop: 6 },
  segmentItem: { flex: 1, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center' },
  segmentSelected: { backgroundColor: colors.accent },
  segmentText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  help: { color: colors.textMuted, fontSize: 13, marginTop: 8 },
  note: { color: colors.accent, fontSize: 14, fontWeight: '500', marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  pair: { flexDirection: 'row', alignItems: 'center', gap: GAP / 2 },
  number: { color: colors.textMuted, fontSize: 13, fontWeight: '600', width: 22, textAlign: 'right' },
  numberUnder: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  picture: { overflow: 'hidden' },
  solid: { backgroundColor: colors.surface },
  cutOut: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  pictureOn: { borderWidth: 3, borderStyle: 'solid', borderColor: colors.accent },
  noBack: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  noBackText: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  actions: { gap: 10, paddingHorizontal: PADDING, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pickedRow: { flexDirection: 'row', gap: 10 },
  busy: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
});
