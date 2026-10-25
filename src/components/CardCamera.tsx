import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cardFromPhoto } from '../lib/cardCapture';
import type { CapturedCard, CardKind } from '../lib/cardCapture';
import * as haptics from '../lib/haptics';
import type { Pairing } from '../lib/importBatch';
import { loadSettings, saveSettings } from '../lib/storage';
import { colors } from '../theme';
import { Button } from './Button';
import type { ImportPicture } from './ImportReview';
import { Text } from './Text';

const KINDS: [CardKind, string][] = [
  ['card', 'Rectangle'],
  ['cutOut', 'Cut out'],
];

interface Props {
  visible: boolean;
  /** Just one card (a card back): done as soon as it's taken. */
  single?: boolean;
  /** The deck's card shape (width over height), given the shape of the card found (see cardFromPhoto). */
  ratioFor: (measured: number) => number;
  /** The cards taken, in order, and how they pair (each front then its back, when backs were taken too). */
  onDone: (pictures: ImportPicture[], pairing: Pairing) => void;
  onCancel: () => void;
  /** Once it has slid away (iOS can only show another full-screen view after that). */
  onClosed?: () => void;
}

/**
 * The app's own card camera: cards photographed one after another, each made into its picture as it's taken (a
 * plain card found and straightened, any other shape cut out: see cardFromPhoto), in true colors. With "Backs too",
 * it asks for each card's front and then its back, and they come paired.
 */
export function CardCamera({ visible, single = false, ratioFor, onDone, onCancel, onClosed }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [camera, setCamera] = useState<CameraView | null>(null);
  const [ready, setReady] = useState(false);
  const [backs, setBacks] = useState(false);
  /** What the cards are: remembered from last time (a game's cards are all one or the other). Rectangles to start. */
  const [kind, setKind] = useState<CardKind>(() => (loadSettings().cameraKind === 'cutOut' ? 'cutOut' : 'card'));
  const chooseKind = (k: CardKind) => {
    setKind(k);
    saveSettings({ ...loadSettings(), cameraKind: k === 'cutOut' ? 'cutOut' : undefined });
    haptics.tick();
  };
  /** Each shot as it's worked on, then its picture (null if it couldn't be made). */
  const [shots, setShots] = useState<(CapturedCard | null | 'working')[]>([]);
  const [taking, setTaking] = useState(false);
  // One shot worked on at a time (each takes a moment, and pictures are big), in the order they were taken; and
  // the pictures made, read once the last is ready. Kept outside React state, as the jobs outlive renders.
  const [queue] = useState(() => {
    const box = { last: Promise.resolve() as Promise<unknown>, made: [] as (CapturedCard | null)[] };
    return { get: () => box, set: (next: Partial<typeof box>) => Object.assign(box, next) };
  });

  const working = shots.some((s) => s === 'working');
  const done = shots.filter((s): s is CapturedCard => !!s && s !== 'working');
  // What to take next: card n's front, or its back.
  const n = shots.length;
  const card = backs ? Math.floor(n / 2) + 1 : n + 1;
  const prompt = backs ? `Card ${card} · ${n % 2 === 0 ? 'Front' : 'Now the back'}` : single ? 'The card' : `Card ${card}`;

  const reset = () => {
    setShots([]);
    setReady(false);
    setTaking(false);
    queue.set({ made: [], last: Promise.resolve() });
  };
  const finish = (cards: CapturedCard[]) => {
    reset();
    onDone(
      cards.map((c) => ({ uri: c.uri, original: c.original })),
      backs && !single ? 'inTurn' : 'none',
    );
  };

  const take = async () => {
    if (!camera || !ready || taking) return;
    setTaking(true);
    haptics.tick();
    try {
      const photo = await camera.takePictureAsync({ quality: 0.92, shutterSound: false });
      if (!photo) return;
      const { made: list, last } = queue.get();
      const at = list.length;
      queue.set({ made: [...list, null] });
      setShots((s) => [...s, 'working']);
      const job = last.then(async () => {
        let made: CapturedCard;
        try {
          made = await cardFromPhoto(photo.uri, ratioFor, kind);
        } catch {
          // The photo as it is (to fix on the checking screen), so the cards after it still pair up.
          made = { uri: photo.uri, original: photo.uri, how: 'trimmed' };
        }
        queue.set({ made: queue.get().made.map((x, i) => (i === at ? made : x)) });
        setShots((s) => s.map((x, i) => (i === at ? made : x)));
        if (single) finish([made]);
      });
      queue.set({ last: job });
    } finally {
      setTaking(false);
    }
  };

  const doneTaking = async () => {
    // The last shots still being worked on: once they're ready.
    await queue.get().last;
    finish(queue.get().made.filter((c): c is CapturedCard => !!c));
  };
  const cancel = () => {
    reset();
    onCancel();
  };

  const last = [...shots].reverse().find((s) => s !== null);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={cancel} onDismiss={onClosed}>
      <View style={styles.screen}>
        {!permission ? null : !permission.granted ? (
          <View style={[styles.ask, { paddingTop: insets.top + 40 }]}>
            <Text style={styles.askTitle}>Camera access</Text>
            <Text style={styles.askText}>Shufflevale uses the camera to photograph your cards.</Text>
            {permission.canAskAgain ? (
              <Button label="Allow the camera" variant="primary" onPress={() => void requestPermission()} />
            ) : (
              <Button label="Open Settings" variant="primary" onPress={() => void Linking.openSettings()} />
            )}
            <Button label="Cancel" onPress={cancel} />
          </View>
        ) : visible ? (
          <>
            <CameraView ref={setCamera} style={StyleSheet.absoluteFill} facing="back" animateShutter onCameraReady={() => setReady(true)} />
            <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
              <Button label="Cancel" onPress={cancel} />
              {single ? null : (
                <View style={styles.backsRow}>
                  <Text style={styles.backsLabel}>Backs too</Text>
                  <Switch
                    value={backs}
                    // Changed once cards are taken, they'd pair up wrongly: only before the first.
                    disabled={shots.length > 0}
                    onValueChange={setBacks}
                    trackColor={{ true: colors.accent }}
                  />
                </View>
              )}
            </View>
            {/* What the cards are: straightened as rectangles, or cut out as other shapes. */}
            <View style={styles.kinds}>
              {KINDS.map(([k, label]) => (
                <Pressable
                  key={k}
                  onPress={() => chooseKind(k)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: kind === k }}
                  style={[styles.kind, kind === k && styles.kindOn]}>
                  <Text style={[styles.kindText, kind === k && { color: colors.accentText }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.promptBox} pointerEvents="none">
              <Text style={styles.prompt}>{prompt}</Text>
              <Text style={styles.hint}>
                {backs && n % 2 === 1 ? 'Turn it over where it lies.' : 'Lay it on a plain background, filling most of the screen.'}
              </Text>
            </View>
            <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.thumbBox}>
                {last === 'working' ? (
                  <ActivityIndicator color={colors.accent} />
                ) : last ? (
                  <Image source={{ uri: last.uri }} style={styles.thumb} contentFit="contain" />
                ) : null}
                {done.length ? <Text style={styles.count}>{done.length}</Text> : null}
              </View>
              <Pressable
                onPress={take}
                disabled={!ready || taking}
                accessibilityRole="button"
                accessibilityLabel={`Take ${prompt}`}
                style={({ pressed }) => [styles.shutter, (pressed || !ready) && { opacity: 0.6 }]}>
                <View style={styles.shutterInner} />
              </Pressable>
              <View style={styles.doneBox}>
                {single ? null : (
                  <Button label={working ? 'Done…' : 'Done'} variant="primary" onPress={doneTaking} disabled={!shots.length} />
                )}
              </View>
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  ask: { flex: 1, paddingHorizontal: 24, gap: 14, backgroundColor: colors.bg },
  askTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  askText: { color: colors.textMuted, fontSize: 15 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  backsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, paddingLeft: 14, paddingRight: 6, paddingVertical: 4 },
  backsLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  kinds: { flexDirection: 'row', alignSelf: 'center', marginTop: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, padding: 3 },
  kind: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 17 },
  kindOn: { backgroundColor: colors.accent },
  kindText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  promptBox: { position: 'absolute', left: 0, right: 0, top: '22%', alignItems: 'center', gap: 6 },
  prompt: { color: '#fff', fontSize: 20, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, overflow: 'hidden' },
  hint: { color: 'rgba(255,255,255,0.85)', fontSize: 14, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  thumbBox: { width: 64, height: 80, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 56, height: 76 },
  count: { position: 'absolute', top: -6, right: -6, backgroundColor: colors.accent, color: colors.accentText, fontSize: 12, fontWeight: '700', paddingHorizontal: 6, borderRadius: 8, overflow: 'hidden' },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  doneBox: { width: 88, alignItems: 'flex-end' },
});
