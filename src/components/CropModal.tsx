import { Canvas, FillType, Path, Skia } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import type { NativeTouchEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { keepOriginal, loadUpright, rotateImage, saveCrop } from '../lib/images';
import { cardRadius } from '../lib/types';
import { colors } from '../theme';
import { Button } from './Button';
import { RoundnessSlider } from './RoundnessSlider';
import { Text } from './Text';
import { ALL_ORIENTATIONS } from '../lib/orientations';

/** Furthest the user can zoom in, relative to the image just covering the frame. */
const MAX_ZOOM = 6;
const FRAME_MARGIN = 24;

interface Source {
  index: number;
  uri: string;
  w: number;
  h: number;
}
interface Size {
  w: number;
  h: number;
}
/** `zoom` is relative to the scale where the image just covers the frame; x/y offset the image center from the frame center. */
interface Transform {
  zoom: number;
  x: number;
  y: number;
}

const INITIAL: Transform = { zoom: 1, x: 0, y: 0 };

/** The largest card-shaped frame (`ratio` is width / height) that fits the crop area. */
function frameFor(area: Size, ratio: number): Size {
  const w = Math.min(area.w - FRAME_MARGIN * 2, (area.h - FRAME_MARGIN * 2) * ratio);
  return { w, h: w / ratio };
}

function coverScale(img: Size, frame: Size): number {
  return Math.max(frame.w / img.w, frame.h / img.h);
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Keeps the frame fully covered by the image. */
function clampTransform(t: Transform, img: Size, frame: Size): Transform {
  const zoom = clamp(t.zoom, 1, MAX_ZOOM);
  const s = coverScale(img, frame) * zoom;
  const maxX = (img.w * s - frame.w) / 2;
  const maxY = (img.h * s - frame.h) / 2;
  return { zoom, x: clamp(t.x, -maxX, maxX), y: clamp(t.y, -maxY, maxY) };
}

const distance = (a: NativeTouchEvent, b: NativeTouchEvent) => Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
const midpoint = (ts: NativeTouchEvent[]) => ({
  x: ts.reduce((n, t) => n + t.pageX, 0) / ts.length,
  y: ts.reduce((n, t) => n + t.pageY, 0) / ts.length,
});

interface Props {
  /** Images waiting to be cropped, in order. The modal is shown while this is non-empty. */
  uris: string[];
  /** The card's width divided by its height; the crop frame has this shape. */
  ratio: number;
  /** How round the cards' corners are (the deck's roundness), for the frame. */
  roundness?: number;
  /** The corners changed here (with the slider under the picture): the deck's roundness, saved. */
  onRoundness?: (roundness: number) => void;
  /**
   * Called with one cropped image uri per input, in the same order, and for each the picture it was cut from as
   * cropped (turned, if it was turned here; shrunk to keep), to cut it again from if the card size changes.
   */
  onDone: (cropped: string[], originals: string[]) => void;
  onCancel: () => void;
  /**
   * A shape other than a card's for what shows (a die's face, a coin's side): its outline, 0–1 across and down the
   * frame, with everything outside it dimmed. What's kept is still the frame's whole box.
   */
  outline?: [number, number][] | null;
  /** Its own title, instead of "Crop card". */
  title?: string;
  /**
   * Shapes to choose from for it (a token's), each a button under the picture drawn as its outline; the one
   * chosen (`shape`) is the one given as `outline`.
   */
  shapes?: { key: string; name: string; outline: [number, number][] }[];
  shape?: string;
  onShape?: (key: string) => void;
}

/** Full-screen cropper that cuts every image to the card's aspect ratio. Drag to move, pinch to zoom. */
export function CropModal({ uris, ratio, roundness, onRoundness, onDone, onCancel, outline, title, shapes, shape, onShape }: Props) {
  /** The corners as the slider's being moved, shown on the frame before they're saved. */
  const [cornerDraft, setCornerDraft] = useState<number | null>(null);
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [cropped, setCropped] = useState<string[]>([]);
  const [originals, setOriginals] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<Source | null>(null);
  const [area, setArea] = useState<Size | null>(null);
  const [t, setT] = useState<Transform>(INITIAL);
  const [saving, setSaving] = useState(false);

  const visible = uris.length > 0;
  const source = loaded && loaded.index === index ? loaded : null;

  useEffect(() => {
    if (!visible || index >= uris.length) return;
    let canceled = false;
    (async () => {
      try {
        const img = await loadUpright(uris[index]);
        if (canceled) return;
        setT(INITIAL);
        setLoaded({ index, uri: img.uri, w: img.width, h: img.height });
      } catch (e) {
        if (!canceled) Alert.alert('Could not open image', String(e));
      }
    })();
    return () => {
      canceled = true;
    };
  }, [visible, uris, index]);

  const responder = useMemo(() => {
    if (!source || !area) return null;
    const img = { w: source.w, h: source.h };
    const frame = frameFor(area, ratio);
    // Each move is applied relative to the previous one, so the handlers never need to read the current transform.
    let last: NativeTouchEvent[] = [];
    const remember = (touches: NativeTouchEvent[]) => {
      last = touches.map((p) => ({ ...p }));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => remember(e.nativeEvent.touches),
      onPanResponderMove: (e) => {
        const touches = e.nativeEvent.touches;
        // A finger was added or lifted: start measuring from here so the image doesn't jump.
        if (touches.length !== last.length || touches.length === 0) return remember(touches);
        const m0 = midpoint(last);
        const m1 = midpoint(touches);
        const d0 = touches.length >= 2 ? distance(last[0], last[1]) : 0;
        const ratio = d0 > 0 ? distance(touches[0], touches[1]) / d0 : 1;
        remember(touches);
        setT((prev) => {
          const zoom = clamp(prev.zoom * ratio, 1, MAX_ZOOM);
          const k = zoom / prev.zoom;
          return clampTransform({ zoom, x: prev.x * k + (m1.x - m0.x), y: prev.y * k + (m1.y - m0.y) }, img, frame);
        });
      },
    });
  }, [source, area, ratio]);

  const finish = (all: string[], kept: string[]) => {
    setIndex(0);
    setCropped([]);
    setOriginals([]);
    setLoaded(null);
    onDone(all, kept);
  };

  const cancel = () => {
    setIndex(0);
    setCropped([]);
    setOriginals([]);
    setLoaded(null);
    onCancel();
  };

  const reset = () => setT(INITIAL);

  /** Turns the photo itself, so art drawn sideways (e.g. for cards played horizontally) fits the card frame. */
  const rotate = async (turn: -90 | 90) => {
    if (!source) return;
    setSaving(true);
    try {
      const img = await rotateImage(source.uri, turn);
      setT(INITIAL);
      setLoaded({ index: source.index, uri: img.uri, w: img.width, h: img.height });
    } catch (e) {
      Alert.alert('Could not rotate image', String(e));
    } finally {
      setSaving(false);
    }
  };

  const confirm = async () => {
    if (!source || !area) return;
    const frame = frameFor(area, ratio);
    const s = coverScale(source, frame) * t.zoom;
    const width = Math.min(source.w, Math.round(frame.w / s));
    const height = Math.min(source.h, Math.round(frame.h / s));
    const originX = clamp(Math.round(source.w / 2 - (frame.w / 2 + t.x) / s), 0, source.w - width);
    const originY = clamp(Math.round(source.h / 2 - (frame.h / 2 + t.y) / s), 0, source.h - height);

    setSaving(true);
    try {
      const all = [...cropped, await saveCrop(source.uri, { originX, originY, width, height })];
      const kept = [...originals, await keepOriginal(source.uri)];
      if (index + 1 < uris.length) {
        setCropped(all);
        setOriginals(kept);
        setIndex(index + 1);
      } else {
        finish(all, kept);
      }
    } catch (e) {
      Alert.alert('Could not crop image', String(e));
    } finally {
      setSaving(false);
    }
  };

  const frame = area ? frameFor(area, ratio) : null;
  const scale = source && frame ? coverScale(source, frame) * t.zoom : 0;
  const isLast = index + 1 >= uris.length;

  return (
    <Modal visible={visible} animationType="slide" supportedOrientations={ALL_ORIENTATIONS} onRequestClose={cancel}>
      <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.title}>{title ?? (uris.length > 1 ? `Crop card ${index + 1} of ${uris.length}` : 'Crop card')}</Text>

        <View
          style={styles.area}
          onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          {...responder?.panHandlers}>
          {source && area && frame ? (
            <>
              <Image
                source={{ uri: source.uri }}
                style={{
                  position: 'absolute',
                  width: source.w * scale,
                  height: source.h * scale,
                  left: area.w / 2 - (source.w * scale) / 2 + t.x,
                  top: area.h / 2 - (source.h * scale) / 2 + t.y,
                }}
              />
              {outline ? <ShapeOverlay area={area} frame={frame} outline={outline} /> : <FrameOverlay area={area} frame={frame} roundness={cornerDraft ?? roundness} />}
            </>
          ) : (
            <ActivityIndicator color={colors.accent} size="large" style={StyleSheet.absoluteFill} />
          )}
        </View>

        {/* The corners, seen on the frame as they change. */}
        {onRoundness ? (
          <View style={styles.corners}>
            <Text style={styles.cornersLabel}>Corners</Text>
            <View style={{ flex: 1 }}>
              <RoundnessSlider value={roundness} onChange={onRoundness} onDraft={setCornerDraft} />
            </View>
          </View>
        ) : null}

        {/* The shapes it can be cut to, the one chosen ringed. */}
        {shapes?.length ? (
          <View style={styles.shapes}>
            {shapes.map((s) => (
              <Pressable
                key={s.key}
                onPress={() => onShape?.(s.key)}
                accessibilityRole="button"
                accessibilityLabel={s.name}
                accessibilityState={{ selected: s.key === shape }}
                style={({ pressed }) => [styles.shapeButton, s.key === shape && styles.shapeOn, pressed && { opacity: 0.6 }]}>
                <ShapeIcon outline={s.outline} on={s.key === shape} />
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={[styles.actions, { marginBottom: 10 }]}>
          <Button label="⟲  Rotate left" onPress={() => rotate(-90)} disabled={saving || !source} style={{ flex: 1 }} />
          <Button label="Rotate right  ⟳" onPress={() => rotate(90)} disabled={saving || !source} style={{ flex: 1 }} />
        </View>
        <View style={styles.actions}>
          <Button label="Cancel" onPress={cancel} disabled={saving} style={{ flex: 1 }} />
          <Button label="Reset" onPress={reset} disabled={saving || !source} style={{ flex: 1 }} />
          <Button
            label={saving ? 'Saving…' : isLast ? 'Done' : 'Next'}
            variant="primary"
            onPress={confirm}
            disabled={saving || !source}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </Modal>
  );
}

/** Dims everything outside a shape (`outline`, 0–1 across and down the frame), and rims it. */
function ShapeOverlay({ area, frame, outline }: { area: Size; frame: Size; outline: [number, number][] }) {
  const left = (area.w - frame.w) / 2;
  const top = (area.h - frame.h) / 2;
  const shape = Skia.Path.Make();
  outline.forEach(([x, y], i) => (i ? shape.lineTo(left + x * frame.w, top + y * frame.h) : shape.moveTo(left + x * frame.w, top + y * frame.h)));
  shape.close();
  // The whole area, with the shape cut out of it.
  const around = Skia.Path.Make();
  around.addRect(Skia.XYWHRect(0, 0, area.w, area.h));
  around.addPath(shape);
  around.setFillType(FillType.EvenOdd);
  return (
    <Canvas style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <Path path={around} color="rgba(0,0,0,0.6)" />
      <Path path={shape} color={colors.accent} style="stroke" strokeWidth={2} />
    </Canvas>
  );
}

const SHAPE_ICON = 26;

/** A shape to choose, drawn small as its outline (filled in gold, once it's chosen). */
function ShapeIcon({ outline, on }: { outline: [number, number][]; on: boolean }) {
  const path = Skia.Path.Make();
  outline.forEach(([x, y], i) => (i ? path.lineTo(1 + x * (SHAPE_ICON - 2), 1 + y * (SHAPE_ICON - 2)) : path.moveTo(1 + x * (SHAPE_ICON - 2), 1 + y * (SHAPE_ICON - 2))));
  path.close();
  return (
    <Canvas style={{ width: SHAPE_ICON, height: SHAPE_ICON, pointerEvents: 'none' }}>
      <Path path={path} color={on ? colors.accent : colors.text} style={on ? 'fill' : 'stroke'} strokeWidth={2} strokeJoin="round" />
    </Canvas>
  );
}

/** Dims everything outside the card-shaped frame. */
function FrameOverlay({ area, frame, roundness }: { area: Size; frame: Size; roundness?: number }) {
  const left = (area.w - frame.w) / 2;
  const top = (area.h - frame.h) / 2;
  const radius = cardRadius({ roundness }, frame.w);
  // Everything outside the card darkened, its rounded corners too: one view round the frame with a border as wide
  // as the screen, rounded on the inside to the card's corners.
  const reach = Math.max(area.w, area.h);
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', overflow: 'hidden' }]}>
      <View
        style={{
          position: 'absolute',
          left: left - reach,
          top: top - reach,
          width: frame.w + reach * 2,
          height: frame.h + reach * 2,
          borderWidth: reach,
          borderRadius: radius + reach,
          borderColor: 'rgba(0,0,0,0.6)',
        }}
      />
      <View style={[styles.frame, { left, top, width: frame.w, height: frame.h, borderRadius: radius }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  hint: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 2 },
  area: { flex: 1, overflow: 'hidden', marginVertical: 8 },
  frame: { position: 'absolute', borderWidth: 2, borderColor: colors.accent },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  corners: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, marginBottom: 10 },
  shapes: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  shapeButton: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  shapeOn: { borderWidth: 2, borderColor: colors.accent },
  cornersLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 18 },
});
