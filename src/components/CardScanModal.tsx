import { Canvas, Circle, Group, Image as SkiaImage, Line, Path, Skia, useImage, vec } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, PanResponder, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { homography, turnCorners, uprightCorners } from '../lib/cardScan';
import type { Point, Quad } from '../lib/cardScan';
import { startScan, straighten } from '../lib/cardWarp';
import type { ScanStart } from '../lib/cardWarp';
import * as haptics from '../lib/haptics';
import { colors } from '../theme';
import { Button } from './Button';
import { Text } from './Text';
import { ALL_ORIENTATIONS } from '../lib/orientations';

/** How near a finger must land to a corner to pick it up. */
const GRAB_RADIUS = 48;
/** The handles' size, the magnifier's, and how much it magnifies. */
const HANDLE = 26;
const LOUPE = 120;
const LOUPE_ZOOM = 2.5;
/** Room round the photo, so a corner on its very edge is still easy to grab. */
const EDGE_ROOM = HANDLE;
/** The live preview of the straightened card: its height. */
const PREVIEW_H = 96;
/** How far in a pinch can zoom, from the photo fitted to the screen. */
const MAX_ZOOM = 8;

/** How the photo is drawn: its pixels scaled by `s`, its top-left corner at (tx, ty) in the touch area. */
interface PhotoView {
  /** The photo and space it's for (a new photo, or the screen turned, starts fitted again). */
  key: string;
  s: number;
  tx: number;
  ty: number;
}
/** The photo's size (its pixels), the space it's shown in, and its scale fitted to that space. */
interface Frame {
  w: number;
  h: number;
  area: { w: number; h: number };
  fit: number;
}

/** Kept from being moved off screen: centered along a side it doesn't fill, otherwise covering the space. */
function keepInView(v: PhotoView, f: Frame): PhotoView {
  const axis = (t: number, size: number, room: number) =>
    size + EDGE_ROOM * 2 <= room ? (room - size) / 2 : Math.min(EDGE_ROOM, Math.max(room - size - EDGE_ROOM, t));
  return { ...v, tx: axis(v.tx, f.w * v.s, f.area.w), ty: axis(v.ty, f.h * v.s, f.area.h) };
}

interface Props {
  /** The photo to find a card in. The screen shows while this is set. */
  uri: string | null;
  /** The deck's card shape (width over height): the card comes out exactly this shape. */
  cardRatio: number;
  /**
   * Where to start from, instead of looking for the card here: the photo (upright, as `uri`) and its corners as
   * already found (e.g. by the card camera).
   */
  start?: ScanStart;
  /** The straightened card, card shaped; and the corners it was cut from (as placed: before any turn). */
  onDone: (card: string, corners: Quad) => void;
  /** Crop it the usual way instead (from the photo as taken): offered when given. */
  onCropByHand?: (uri: string) => void;
  onCancel: () => void;
  /** Once it has slid away (iOS can only show another full-screen view, like the cropper, after that). */
  onClosed?: () => void;
}

/**
 * Finds the card in a photo and straightens it: the card's corners are found (an educated guess, shown as four
 * handles to drag into place if they're off), and the photo is stretched so they become the corners of a flat
 * card of the deck's shape, taking out any tilt or perspective.
 */
export function CardScanModal({ uri, cardRatio, start, onDone, onCropByHand, onCancel, onClosed }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const [scan, setScan] = useState<(ScanStart & { source: string }) | null>(null);
  /** The corners as placed (the photo's pixels), and how many quarter turns the card is given. */
  const [corners, setCorners] = useState<Quad | null>(null);
  const [turns, setTurns] = useState(0);
  /** The corner being dragged, if any. */
  const [dragging, setDragging] = useState<number | null>(null);
  /** Zoomed or moved by pinching (for the photo and space it was set for): see `PhotoView`. */
  const [view, setView] = useState<PhotoView | null>(null);
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const shown = scan && scan.source === uri ? scan : null;
  const image = useImage(shown?.uri ?? null);

  useEffect(() => {
    if (!uri) return;
    let canceled = false;
    (start ? Promise.resolve(start) : startScan(uri))
      .then((s) => {
        if (canceled) return;
        setScan({ ...s, source: uri });
        setCorners(s.corners);
        setView(null);
        // A card photographed sideways is turned to stand the deck's way.
        setTurns(uprightCorners(s.corners, cardRatio) === s.corners ? 0 : 1);
      })
      .catch((e) => !canceled && Alert.alert('Could not open the photo', String(e)));
    return () => {
      canceled = true;
    };
    // (Its start is read as it opens, for that photo.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri, cardRatio]);

  // The photo fitted into the space it has (with room round it, so a corner on its very edge is easy to grab),
  // unless it's been zoomed or moved: `at` takes its pixels to the screen's.
  const fit = shown && area ? Math.min((area.w - EDGE_ROOM * 2) / shown.width, (area.h - EDGE_ROOM * 2) / shown.height) : 0;
  const viewKey = shown && area ? `${shown.uri}|${area.w}|${area.h}` : '';
  const frame = shown && area ? { w: shown.width, h: shown.height, area, fit } : null;
  const at: PhotoView | null =
    view && view.key === viewKey ? view : frame ? { key: viewKey, s: fit, tx: (area!.w - frame.w * fit) / 2, ty: (area!.h - frame.h * fit) / 2 } : null;
  /** Where a point on the photo is drawn, from the photo's top-left corner as drawn. */
  const onScreen = (p: Point) => ({ x: p.x * (at?.s ?? 0), y: p.y * (at?.s ?? 0) });

  // One finger on a corner drags it (kept on the photo); one elsewhere moves the photo, once zoomed in; two pinch
  // to zoom and move it. The handlers are made once, reading the latest of what they need.
  const [latest] = useState(() => {
    const live = {
      corners: null as Quad | null,
      at: null as PhotoView | null,
      frame: null as Frame | null,
      mode: 'none' as 'none' | 'corner' | 'pan' | 'pinch',
      index: -1,
      from: { x: 0, y: 0 },
      /** Where the touch area is on the screen. */
      origin: { x: 0, y: 0 },
      startView: null as PhotoView | null,
      pinch: { d: 1, mid: { x: 0, y: 0 } },
    };
    return { set: (next: Partial<typeof live>) => Object.assign(live, next), get: () => live };
  });
  latest.set({ corners, at, frame });
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => {
        const { corners: q, at: v } = latest.get();
        if (!q || !v) return false;
        const { locationX: x, locationY: y, pageX, pageY } = e.nativeEvent;
        latest.set({ origin: { x: pageX - x, y: pageY - y }, startView: v });
        const dist = q.map((p) => Math.hypot(p.x * v.s + v.tx - x, p.y * v.s + v.ty - y));
        const index = dist.indexOf(Math.min(...dist));
        if (dist[index] <= GRAB_RADIUS) latest.set({ mode: 'corner', index, from: { ...q[index] } });
        else latest.set({ mode: 'pan', index: -1 });
        return true;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        if (latest.get().mode !== 'corner') return;
        setDragging(latest.get().index);
        haptics.lift();
      },
      onPanResponderMove: (e, g) => {
        const live = latest.get();
        const { corners: q, at: v, frame: f, origin } = live;
        if (!q || !v || !f) return;
        const touches = e.nativeEvent.touches;
        if (touches.length >= 2) {
          const a = { x: touches[0].pageX - origin.x, y: touches[0].pageY - origin.y };
          const b = { x: touches[1].pageX - origin.x, y: touches[1].pageY - origin.y };
          const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          // A second finger: the corner stays where it got to, and the pinch starts from here.
          if (live.mode !== 'pinch') {
            if (live.mode === 'corner') setDragging(null);
            latest.set({ mode: 'pinch', index: -1, startView: v, pinch: { d, mid } });
            return;
          }
          const start = live.startView!;
          const s = Math.min(f.fit * MAX_ZOOM, Math.max(f.fit, (start.s * d) / live.pinch.d));
          // The point of the photo that was between the fingers stays between them.
          const px = (live.pinch.mid.x - start.tx) / start.s;
          const py = (live.pinch.mid.y - start.ty) / start.s;
          setView(keepInView({ key: v.key, s, tx: mid.x - px * s, ty: mid.y - py * s }, f));
          return;
        }
        if (live.mode === 'corner') {
          const x = Math.min(f.w, Math.max(0, live.from.x + g.dx / v.s));
          const y = Math.min(f.h, Math.max(0, live.from.y + g.dy / v.s));
          setCorners(q.map((p, i) => (i === live.index ? { x, y } : p)) as Quad);
        } else if (live.mode === 'pan' && live.startView) {
          const start = live.startView;
          setView(keepInView({ ...start, key: v.key, tx: start.tx + g.dx, ty: start.ty + g.dy }, f));
        }
      },
      onPanResponderRelease: () => {
        if (latest.get().mode === 'corner') {
          setDragging(null);
          haptics.drop();
        }
        latest.set({ mode: 'none' });
      },
      onPanResponderTerminate: () => {
        setDragging(null);
        latest.set({ mode: 'none' });
      },
    }),
  );

  // The corners as they become the card's: turned as asked (so the right side ends up on top).
  let card = corners;
  for (let i = 0; card && i < turns % 4; i++) card = turnCorners(card);
  // The live preview: the deck's shape (sideways turns don't change that), the straightened photo in it.
  const preview = { w: PREVIEW_H * cardRatio, h: PREVIEW_H };
  const previewMatrix = card
    ? Skia.Matrix(
        homography(card, [
          { x: 0, y: 0 },
          { x: preview.w, y: 0 },
          { x: preview.w, y: preview.h },
          { x: 0, y: preview.h },
        ]),
      )
    : null;

  // The outline, and everything outside it shaded.
  const outlineBuilder = Skia.PathBuilder.Make();
  const shadeBuilder = Skia.PathBuilder.Make();
  // The photo as drawn, zoomed as it is.
  const box = shown && at ? { w: shown.width * at.s, h: shown.height * at.s } : null;
  if (corners && box) {
    const pts = corners.map(onScreen);
    outlineBuilder.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach((p) => outlineBuilder.lineTo(p.x, p.y));
    outlineBuilder.close();
  }
  const outline = outlineBuilder.build();
  if (corners && box) {
    shadeBuilder.addRect(Skia.XYWHRect(0, 0, box.w, box.h)).addPath(outline);
    shadeBuilder.setFillType(1); // even-odd: the card's outline is a hole in the shading
  }
  const shade = shadeBuilder.build();
  const held = dragging !== null && corners ? corners[dragging] : null;
  // The magnifier: over the side of the screen away from the corner being dragged, so the finger isn't over it.
  const loupeAt =
    held && at && area ? { x: onScreen(held).x + at.tx < area.w / 2 ? area.w - LOUPE - 8 : 8, y: 8 } : null;

  const use = async () => {
    if (!shown || !card) return;
    setSaving(true);
    try {
      onDone(await straighten(shown.uri, card, cardRatio), corners!);
    } catch (e) {
      Alert.alert('Could not straighten the card', String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={uri !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      supportedOrientations={ALL_ORIENTATIONS}
      onRequestClose={onCancel}
      onDismiss={onClosed}>
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Corner pin</Text>
        <Text style={styles.help}>
          {shown?.whole
            ? 'Drag the corners onto the card’s corners to straighten it. Pinch to zoom.'
            : shown && !shown.found
              ? 'Couldn’t spot the card. Drag the corners onto its corners. Pinch to zoom.'
              : 'Drag a corner if it isn’t on the card’s corner. Pinch to zoom.'}
        </Text>

        <View style={styles.photoArea} onLayout={(e: LayoutChangeEvent) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {shown && box && at && image && corners ? (
            // (Touches land on this, the whole space; nothing inside takes them. Zoomed in, the photo is cut off at
            // its edges.)
            <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} {...responder.panHandlers}>
              <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
                <Group transform={[{ translateX: at.tx }, { translateY: at.ty }]}>
                  <SkiaImage image={image} x={0} y={0} width={box.w} height={box.h} fit="fill" />
                  <Path path={shade} color="rgba(0,0,0,0.45)" />
                  <Path path={outline} color={colors.accent} style="stroke" strokeWidth={2} />
                  {corners.map((p, i) => {
                    const s = onScreen(p);
                    return (
                      <Group key={i}>
                        <Circle cx={s.x} cy={s.y} r={HANDLE / 2} color={i === dragging ? colors.accent : 'rgba(224,179,84,0.35)'} />
                        <Circle cx={s.x} cy={s.y} r={HANDLE / 2} color={colors.accent} style="stroke" strokeWidth={2} />
                      </Group>
                    );
                  })}
                </Group>
              </Canvas>
              {held && loupeAt ? (
                <View style={[styles.loupe, { left: loupeAt.x, top: loupeAt.y }]} pointerEvents="none">
                  <Canvas style={{ width: LOUPE, height: LOUPE }}>
                    <Group
                      transform={[
                        { translateX: LOUPE / 2 - held.x * at.s * LOUPE_ZOOM },
                        { translateY: LOUPE / 2 - held.y * at.s * LOUPE_ZOOM },
                        { scale: LOUPE_ZOOM },
                      ]}>
                      <SkiaImage image={image} x={0} y={0} width={box.w} height={box.h} fit="fill" />
                      <Path path={outline} color={colors.accent} style="stroke" strokeWidth={1.5 / LOUPE_ZOOM} />
                    </Group>
                    <Line p1={vec(LOUPE / 2 - 10, LOUPE / 2)} p2={vec(LOUPE / 2 + 10, LOUPE / 2)} color="#fff" strokeWidth={1} />
                    <Line p1={vec(LOUPE / 2, LOUPE / 2 - 10)} p2={vec(LOUPE / 2, LOUPE / 2 + 10)} color="#fff" strokeWidth={1} />
                  </Canvas>
                </View>
              ) : null}
            </View>
          ) : (
            <ActivityIndicator color={colors.accent} size="large" />
          )}
        </View>

        <View style={styles.previewRow}>
          <View style={[styles.preview, { width: preview.w, height: preview.h }]}>
            {image && previewMatrix && shown ? (
              <Canvas style={{ width: preview.w, height: preview.h }}>
                <Group matrix={previewMatrix}>
                  <SkiaImage image={image} x={0} y={0} width={shown.width} height={shown.height} fit="fill" />
                </Group>
              </Canvas>
            ) : null}
          </View>
          <Pressable
            onPress={() => {
              setTurns((t) => (t + 1) % 4);
              haptics.tick();
            }}
            disabled={!corners}
            accessibilityRole="button"
            accessibilityLabel="Turn the card a quarter turn"
            hitSlop={8}
            style={({ pressed }) => [styles.turn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.turnText}>⟳ Turn</Text>
          </Pressable>
        </View>

        <View style={[styles.actions, { paddingBottom: insets.bottom + 12, maxWidth: screenW }]}>
          <Button label="Cancel" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
          {onCropByHand ? <Button label="Crop by hand" onPress={() => uri && onCropByHand(uri)} disabled={saving} style={{ flex: 1.3 }} /> : null}
          <Button label={saving ? 'Saving…' : 'Use card'} variant="primary" onPress={use} disabled={saving || !corners} style={{ flex: 1.2 }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, gap: 10 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  help: { color: colors.textMuted, fontSize: 14 },
  photoArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loupe: {
    position: 'absolute',
    width: LOUPE,
    height: LOUPE,
    borderRadius: LOUPE / 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.bg,
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  preview: { borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surface },
  turn: { backgroundColor: colors.surfaceRaised, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  turnText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 6 },
});
