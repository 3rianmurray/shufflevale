import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cardFromPhoto } from '../lib/cardCapture';
import type { CapturedCard, CardKind } from '../lib/cardCapture';
import * as haptics from '../lib/haptics';
import type { Pairing } from '../lib/importBatch';
import { loadSettings, saveSettings } from '../lib/storage';
import { zoomSettingFor } from '../lib/subjectLift';
import { colors } from '../theme';
import { Button } from './Button';
import type { ImportPicture } from './ImportReview';
import { Text } from './Text';
import { ALL_ORIENTATIONS } from '../lib/orientations';

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

/** One shot, kept by its own number (so one can be retaken or removed while others are still being made). */
interface Shot {
  id: number;
  /** Its picture, or `working` while it's being made. */
  card: CapturedCard | 'working';
}

/**
 * The app's own card camera: cards photographed one after another, each made into its picture as it's taken (a
 * plain card found and straightened, any other shape cut out: see cardFromPhoto), in true colors. With "Backs too",
 * it asks for each card's front and then its back, and they come paired. The small picture in the corner opens
 * everything taken so far, where any shot can be retaken or removed.
 */
export function CardCamera({ visible, single = false, ratioFor, onDone, onCancel, onClosed }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [camera, setCamera] = useState<CameraView | null>(null);
  const [ready, setReady] = useState(false);
  const [backs, setBacks] = useState(false);
  /** The flash fires with each shot: off to start with, every time (never automatic). */
  const [flashOn, setFlashOn] = useState(false);
  /**
   * The camera's own zoom to 2x: the setting for it (known once the camera's running, and only if this camera and
   * build can do it), and whether it's on (off to start with, every time).
   */
  const [twoXSetting, setTwoXSetting] = useState<number | null>(null);
  const [twoX, setTwoX] = useState(false);
  /** What the cards are: remembered from last time (a game's cards are all one or the other). Rectangles to start. */
  const [kind, setKind] = useState<CardKind>(() => (loadSettings().cameraKind === 'cutOut' ? 'cutOut' : 'card'));
  const chooseKind = (k: CardKind) => {
    setKind(k);
    saveSettings({ ...loadSettings(), cameraKind: k === 'cutOut' ? 'cutOut' : undefined });
    haptics.tick();
  };
  /** Every shot so far, in order. */
  const [shots, setShots] = useState<Shot[]>([]);
  const [taking, setTaking] = useState(false);
  /** The tray of shots is open, the shot picked in it, and the shot the next press of the shutter replaces. */
  const [trayOpen, setTrayOpen] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [retaking, setRetaking] = useState<number | null>(null);
  /** The shot taken last (shown in the corner). */
  const [latestId, setLatestId] = useState<number | null>(null);
  // One shot worked on at a time (each takes a moment, and pictures are big), in the order they were taken; and
  // the shots themselves, read once the last is ready. Kept outside React state, as the jobs outlive renders.
  const [queue] = useState(() => {
    const box = { last: Promise.resolve() as Promise<unknown>, list: [] as Shot[], nextId: 1 };
    return { get: () => box, set: (next: Partial<typeof box>) => Object.assign(box, next) };
  });
  /** The shots changed: kept for the jobs, and shown. */
  const setList = (list: Shot[]) => {
    queue.set({ list });
    setShots(list);
  };

  const working = shots.some((s) => s.card === 'working');
  const made = shots.flatMap((s) => (s.card === 'working' ? [] : [s.card]));
  // What to take next: the shot being retaken, or one more at the end. Its place decides front or back.
  const retakingAt = retaking === null ? -1 : shots.findIndex((s) => s.id === retaking);
  const n = retakingAt >= 0 ? retakingAt : shots.length;
  const card = backs ? Math.floor(n / 2) + 1 : n + 1;
  const prompt = `${retakingAt >= 0 ? 'Retake ' : ''}${backs ? `card ${card} · ${n % 2 === 0 ? 'front' : 'back'}` : single ? 'the card' : `card ${card}`}`;

  const reset = () => {
    setShots([]);
    setReady(false);
    setTaking(false);
    setTrayOpen(false);
    setPicked(null);
    setRetaking(null);
    setLatestId(null);
    setFlashOn(false);
    setTwoX(false);
    setTwoXSetting(null);
    queue.set({ list: [], last: Promise.resolve(), nextId: 1 });
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
      const { list, last, nextId } = queue.get();
      // A retake takes the place of its shot; any other is one more at the end.
      const replaced = retaking !== null && list.some((s) => s.id === retaking);
      const id = replaced ? retaking : nextId;
      setList(replaced ? list.map((s) => (s.id === id ? { id, card: 'working' } : s)) : [...list, { id, card: 'working' }]);
      queue.set({ nextId: replaced ? nextId : nextId + 1 });
      setRetaking(null);
      setLatestId(id);
      const job = last.then(async () => {
        let result: CapturedCard;
        try {
          result = await cardFromPhoto(photo.uri, ratioFor, kind);
        } catch {
          // The photo as it is (to fix on the checking screen), so the cards after it still pair up.
          result = { uri: photo.uri, original: photo.uri, how: 'trimmed' };
        }
        // (By its number: others may have been retaken or removed meanwhile.)
        setList(queue.get().list.map((s) => (s.id === id ? { id, card: result } : s)));
        if (single) finish([result]);
      });
      queue.set({ last: job });
    } finally {
      setTaking(false);
    }
  };

  /** The picked shot goes (with Backs too, only the last can: the others would shift every pair after them). */
  const remove = (id: number) => {
    const list = queue.get().list;
    if (backs && list[list.length - 1]?.id !== id) return;
    setList(list.filter((s) => s.id !== id));
    setPicked(null);
    if (retaking === id) setRetaking(null);
    if (list.length <= 1) setTrayOpen(false);
    haptics.drop();
  };
  /** The next press of the shutter replaces the picked shot. */
  const retake = (id: number) => {
    setRetaking(id);
    setPicked(null);
    setTrayOpen(false);
    haptics.tick();
  };

  const doneTaking = async () => {
    // The last shots still being worked on: once they're ready.
    await queue.get().last;
    finish(queue.get().list.flatMap((s) => (s.card === 'working' ? [] : [s.card])));
  };
  const cancel = () => {
    reset();
    onCancel();
  };

  // The corner shows the shot taken last (a retake counts), or the final one.
  const last = shots.find((s) => s.id === latestId) ?? shots[shots.length - 1];
  const pickedShot = shots.find((s) => s.id === picked);
  /** A shot's name in the tray: its card's number (and front or back, with Backs too). */
  const shotName = (i: number) => (backs ? `${Math.floor(i / 2) + 1}${i % 2 === 0 ? 'F' : 'B'}` : `${i + 1}`);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" supportedOrientations={ALL_ORIENTATIONS} onRequestClose={cancel} onDismiss={onClosed}>
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
            <CameraView
              ref={setCamera}
              style={StyleSheet.absoluteFill}
              facing="back"
              flash={flashOn ? 'on' : 'off'}
              // The camera's own zoom (preview and picture both), not a crop of it.
              zoom={twoX && twoXSetting !== null ? twoXSetting : 0}
              animateShutter
              onCameraReady={() => {
                setReady(true);
                // Read now that the camera has set itself up: its most it can zoom depends on how it's set.
                setTwoXSetting(zoomSettingFor(2));
              }}
            />
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
            <View style={styles.controls}>
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
              {/* Zoomed in to 2x by the camera itself (only where it can). */}
              {twoXSetting !== null ? (
                <Pressable
                  onPress={() => {
                    setTwoX(!twoX);
                    haptics.tick();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="2x zoom"
                  accessibilityState={{ selected: twoX }}
                  style={[styles.flash, twoX && styles.flashOn]}>
                  <Text style={[styles.zoomText, twoX && { color: colors.accentText }]}>2×</Text>
                </Pressable>
              ) : null}
              {/* The flash, with each shot: on or off, never automatic. */}
              <Pressable
                onPress={() => {
                  setFlashOn(!flashOn);
                  haptics.tick();
                }}
                accessibilityRole="button"
                accessibilityLabel="Flash"
                accessibilityState={{ selected: flashOn }}
                style={[styles.flash, flashOn && styles.flashOn]}>
                <SymbolView
                  name={flashOn ? { ios: 'bolt.fill', android: 'flash_on', web: 'flash_on' } : { ios: 'bolt.slash.fill', android: 'flash_off', web: 'flash_off' }}
                  size={18}
                  tintColor={flashOn ? colors.accentText : '#fff'}
                />
              </Pressable>
            </View>
            <View style={styles.promptBox} pointerEvents={retakingAt >= 0 ? 'box-none' : 'none'}>
              <Text style={styles.prompt}>{prompt.charAt(0).toUpperCase() + prompt.slice(1)}</Text>
              <Text style={styles.hint}>
                {retakingAt >= 0
                  ? 'The next picture replaces it.'
                  : backs && n % 2 === 1
                    ? 'Turn it over where it lies.'
                    : 'Lay it on a plain background, filling most of the screen.'}
              </Text>
              {retakingAt >= 0 ? <Button label="Don’t retake" onPress={() => setRetaking(null)} /> : null}
            </View>
            {/* Everything taken so far: tap one for its options. */}
            {trayOpen && shots.length ? (
              <View style={[styles.tray, { bottom: insets.bottom + 120 }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trayRow}>
                  {shots.map((s, i) => (
                    <Pressable
                      key={s.id}
                      onPress={() => {
                        setPicked(picked === s.id ? null : s.id);
                        haptics.tick();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Shot ${shotName(i)}`}
                      accessibilityState={{ selected: picked === s.id }}
                      style={[styles.trayShot, picked === s.id && styles.trayShotOn]}>
                      {s.card === 'working' ? (
                        <ActivityIndicator color={colors.accent} />
                      ) : (
                        <Image source={{ uri: s.card.uri }} style={styles.trayImage} contentFit="contain" />
                      )}
                      <Text style={styles.trayName}>{shotName(i)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {pickedShot ? (
                  <View style={styles.trayButtons}>
                    <Button label="Retake" variant="primary" onPress={() => retake(pickedShot.id)} disabled={pickedShot.card === 'working'} style={{ flex: 1 }} />
                    {/* With Backs too, only the last can go (the others would shift every pair after them). */}
                    {!backs || shots[shots.length - 1]?.id === pickedShot.id ? (
                      <Button label="Delete" variant="danger" onPress={() => remove(pickedShot.id)} disabled={pickedShot.card === 'working'} style={{ flex: 1 }} />
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.trayHint}>Tap a shot to retake or delete it.</Text>
                )}
              </View>
            ) : null}
            <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
              <Pressable
                onPress={() => {
                  setTrayOpen(!trayOpen);
                  setPicked(null);
                }}
                disabled={!shots.length || single}
                accessibilityRole="button"
                accessibilityLabel="Review the cards taken"
                style={styles.thumbBox}>
                {last?.card === 'working' ? (
                  <ActivityIndicator color={colors.accent} />
                ) : last ? (
                  <Image source={{ uri: last.card.uri }} style={[styles.thumb, trayOpen && styles.thumbOn]} contentFit="contain" />
                ) : null}
                {made.length ? <Text style={styles.count}>{made.length}</Text> : null}
              </Pressable>
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
  controls: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 10, marginTop: 12 },
  kinds: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, padding: 3 },
  flash: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  flashOn: { backgroundColor: colors.accent },
  zoomText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  kind: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 17 },
  kindOn: { backgroundColor: colors.accent },
  kindText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  promptBox: { position: 'absolute', left: 0, right: 0, top: '22%', alignItems: 'center', gap: 6 },
  prompt: { color: '#fff', fontSize: 20, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, overflow: 'hidden' },
  hint: { color: 'rgba(255,255,255,0.85)', fontSize: 14, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  tray: { position: 'absolute', left: 12, right: 12, backgroundColor: 'rgba(8,18,26,0.94)', borderRadius: 16, paddingVertical: 12, gap: 10 },
  trayRow: { paddingHorizontal: 12, gap: 10 },
  trayShot: { width: 64, alignItems: 'center', gap: 4, padding: 4, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  trayShotOn: { borderColor: colors.accent },
  trayImage: { width: 52, height: 72 },
  trayName: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  trayButtons: { flexDirection: 'row', gap: 10, paddingHorizontal: 12 },
  trayHint: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  thumbBox: { width: 64, height: 80, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 56, height: 76, borderRadius: 4 },
  thumbOn: { borderWidth: 2, borderColor: colors.accent },
  count: { position: 'absolute', top: -6, right: -6, backgroundColor: colors.accent, color: colors.accentText, fontSize: 12, fontWeight: '700', paddingHorizontal: 6, borderRadius: 8, overflow: 'hidden' },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  doneBox: { width: 88, alignItems: 'flex-end' },
});
