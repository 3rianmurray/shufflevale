import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { SymbolView } from 'expo-symbols';
import type { SymbolViewProps } from 'expo-symbols';
import { Animated, Easing, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { previousTourStep, useTourStep } from '../lib/tour';
import { inTileRows } from '../lib/tileRows';
import { placeWindow } from '../lib/windowSpot';
import type { Point, Rect } from '../lib/windowSpot';
import { colors } from '../theme';
import { Text } from './Text';
import { TourTip } from './TourOverlay';
import { ALL_ORIENTATIONS } from '../lib/orientations';

export interface SheetAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  /** Set when the action opens another modal; iOS can only present it once this sheet has dismissed. */
  opensModal?: boolean;
  /** The sheet stays open, e.g. for an action that shows something over it (see `overlay`). */
  keepsOpen?: boolean;
  /** Starts a new group of actions: a little space above it. */
  groupStart?: boolean;
  /** Part of Shufflevale Pro, not yet unlocked: a gold PRO tag on the right (a tile's, in its corner). It still works: it opens Pro. */
  pro?: boolean;
}

/** An action shown as a small labeled icon tile, in a grid above the other actions. */
export interface SheetTile extends SheetAction {
  /** SF Symbol on iOS, Material Symbol on Android and web. */
  icon: SymbolViewProps['name'];
  /** Shown dimmed and can't be pressed, e.g. a card's current place. */
  disabled?: boolean;
}

interface Props {
  visible: boolean;
  title?: string;
  /** Optional content shown above the actions, e.g. a large card preview. */
  header?: ReactNode;
  /** Optional content under the title, above the actions: e.g. a featured choice drawn its own way. */
  banner?: ReactNode;
  /** Shown over the sheet, filling the screen, e.g. a card full size; the sheet stays open underneath. */
  overlay?: ReactNode;
  /** Actions shown as a grid of icon tiles, three to a row, above `actions`. */
  tiles?: SheetTile[];
  actions: SheetAction[];
  onClose: () => void;
  /**
   * The bottom button's label, which just closes the sheet: Cancel, unless what's changed in the sheet (e.g. a
   * card's copies) is kept as it's made, when it's Done.
   */
  closeLabel?: string;
  /**
   * Where it shows, instead of a sheet at the bottom (on iPad, over a table): a window floating by `at` (a point
   * on screen, e.g. where the finger was), dragged by its title or the grip in its corner, nothing darkened; or a
   * panel dropped from the top, in the middle, that stays put. Either closes with a tap anywhere else, so has no
   * Cancel (only a `closeLabel` of its own, e.g. Done).
   */
  place?: { kind: 'window'; at?: Point; from?: Rect; avoid?: Rect } | { kind: 'drop' };
  /** A window says where it is (its corner and size) as it opens and wherever it's let go, for a follow-up to open there. */
  onPlace?: (rect: Rect) => void;
}

/** How long the sheet takes to come up, and to go. */
const IN_MS = 260;
const OUT_MS = 200;
/** A window's width (as the table's other windows are: see CardFocus); the dropped panel's width. */
const WINDOW_W = 372;
const DROP_W = 440;

/**
 * A bottom sheet of actions. Each action closes the sheet when pressed. The dimmed backdrop fades in and out
 * over the screen while the sheet itself slides up from the bottom (and back down).
 */
export function ActionSheet(props: Props) {
  const { visible, onClose } = props;
  const insets = useSafeAreaInsets();
  const pending = useRef<(() => void) | null>(null);
  // 0 is closed, 1 open: the backdrop's opacity, and how far up the sheet has slid.
  const [progress] = useState(() => new Animated.Value(0));
  // Starts below the screen, until the sheet has been measured (it slides in only once it has).
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const [sheetHeight, setSheetHeight] = useState(screenHeight);
  const [measured, setMeasured] = useState(false);
  // A window, dragged by its title or its grip: it stays where it's let go (back to its place, each time it opens).
  const [pan] = useState(() => new Animated.ValueXY());
  // Where it is, kept outside React state (its drag is made once): its place before it's dragged, how far it has
  // been dragged (counted here from the finger, not read back from the animation, which runs natively and reports
  // late), and who to tell where it ends up.
  const [spotBox] = useState(() => {
    const box = { x: 0, y: 0, w: 0, h: 0, offX: 0, offY: 0, startX: 0, startY: 0, onPlace: undefined as ((r: Rect) => void) | undefined };
    return { set: (next: Partial<typeof box>) => Object.assign(box, next), get: () => box };
  });
  const [windowTouches] = useState(() => {
    const told = () => {
      const b = spotBox.get();
      b.onPlace?.({ x: b.x + b.offX, y: b.y + b.offY, w: b.w, h: b.h });
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const b = spotBox.get();
        spotBox.set({ startX: b.offX, startY: b.offY });
      },
      onPanResponderMove: (_, g) => {
        const b = spotBox.get();
        spotBox.set({ offX: b.startX + g.dx, offY: b.startY + g.dy });
        pan.setValue({ x: b.startX + g.dx, y: b.startY + g.dy });
      },
      onPanResponderRelease: told,
      onPanResponderTerminate: told,
    });
  });
  // What the sheet shows, kept from when it was last open: while it slides away, whatever it was showing may
  // already be gone (the card just moved, the group just deleted), and it should leave as it was.
  const shown = useMemo(() => {
    const box: { last: Props | null } = { last: null };
    return { keep: (p: Props) => Object.assign(box, { last: p }), get: () => box.last };
  }, []);
  if (visible) shown.keep(props);
  const showing = visible ? props : (shown.get() ?? props);
  const { title, header, banner, tiles, actions, overlay, place, onPlace } = showing;
  // A window or a dropped panel closes with a tap elsewhere: no Cancel, only a close button of its own (Done).
  const closeLabel = showing.closeLabel ?? (place ? null : 'Cancel');
  // The modal stays up after `visible` goes false until the sheet has slid away.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  // The walkthrough, when its step is about one of this menu's choices: the tip shows here, by that choice.
  const tour = useTourStep();
  const guided = visible && tour?.step.tile && [...(tiles ?? []), ...actions].some((a) => a.label === tour.step.tile) ? tour : null;
  const guide = useMemo(() => {
    const box = { chosen: false, was: false };
    return { box };
  }, []);
  // Closed without making that choice: back to the step that opens the menu, so the player isn't left stranded.
  useEffect(() => {
    if (guided) {
      Object.assign(guide.box, { was: true, chosen: false });
      return;
    }
    if (!visible && guide.box.was) {
      if (!guide.box.chosen) previousTourStep();
      Object.assign(guide.box, { was: false, chosen: false });
    }
  }, [guided, visible, guide]);
  const isGuided = (a: SheetAction) => guided?.step.tile === a.label;
  // Everything else is grayed out and can't be pressed meanwhile (Cancel still closes the menu).
  const isOff = (a: SheetAction) => !!guided && !isGuided(a);

  // A window opens in its own place (not dragged), wherever the last one was dragged to.
  useEffect(() => {
    if (!visible) return;
    spotBox.set({ offX: 0, offY: 0, startX: 0, startY: 0 });
    pan.setOffset({ x: 0, y: 0 });
    pan.setValue({ x: 0, y: 0 });
  }, [visible, pan, spotBox]);

  // Where a window goes: directly above the finger that opened it, or (a follow-up) where the last window was, off
  // what it's for. Told to whoever's asked, whenever it settles (and, by its drag, wherever it's let go).
  const winW = Math.min(WINDOW_W, screenWidth - 24);
  const winH = measured ? sheetHeight : 0;
  const winSpot =
    place?.kind === 'window'
      ? placeWindow({ screen: { w: screenWidth, h: screenHeight }, insets, size: { w: winW, h: winH }, at: place.at, from: place.from, avoid: place.avoid })
      : null;
  const winX = winSpot?.x;
  const winY = winSpot?.y;
  useEffect(() => {
    if (!visible || !measured || winX === undefined || winY === undefined) return;
    // (Wherever it's been dragged since it opened, too.)
    const { offX, offY } = spotBox.get();
    onPlace?.({ x: winX + offX, y: winY + offY, w: winW, h: winH });
    // Only when it settles somewhere, not whenever the caller's function is new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, measured, winX, winY, winW, winH]);

  useEffect(() => {
    if (visible && !measured) return;
    if (visible) {
      Animated.timing(progress, { toValue: 1, duration: IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
        ({ finished }) => finished && setMounted(false),
      );
    }
  }, [visible, measured, progress]);

  const run = (a: SheetAction) => {
    if (isGuided(a)) Object.assign(guide.box, { chosen: true });
    if (a.keepsOpen) return a.onPress();
    if (a.opensModal && Platform.OS === 'ios') {
      pending.current = a.onPress;
      onClose();
    } else {
      onClose();
      a.onPress();
    }
  };

  // Measured as it comes (not while it goes: its size changing then would make it jump).
  const measure = (h: number) => {
    if (!visible) return;
    setSheetHeight(h);
    setMeasured(true);
  };
  // What it holds, whichever way it shows: the title (but in a window, it's in the window's top), what's above
  // the choices, the choices, and its close button.
  const body = (
    <>
      {guided ? <TourTip index={guided.index} step={guided.step} /> : null}
      {header}
      {title && place?.kind !== 'window' ? <Text style={styles.title}>{title}</Text> : null}
      {banner}
      {tiles?.length ? (
        // In even rows of up to four, each centered (see tileRows), every tile as wide as the fullest row's.
        <View style={styles.tiles}>
          {inTileRows(tiles).map((row, r, rows) => (
            <View key={r} style={styles.tileRow}>
              {row.map((t) => (
                <View key={t.label} style={[styles.tileCell, { width: `${100 / Math.max(...rows.map((x) => x.length))}%` }]}>
                  <Pressable
                    onPress={() => run(t)}
                    disabled={t.disabled || isOff(t)}
                    accessibilityRole="button"
                    accessibilityLabel={t.label}
                    accessibilityState={{ disabled: t.disabled || isOff(t) }}
                    style={({ pressed }) => [
                      styles.tile,
                      isGuided(t) && styles.guided,
                      pressed && styles.pressed,
                      (t.disabled || isOff(t)) && styles.tileDisabled,
                    ]}>
                    <SymbolView name={t.icon} size={22} tintColor={t.destructive ? colors.danger : colors.text} />
                    <Text style={[styles.tileText, t.destructive && { color: colors.danger }]} numberOfLines={1}>
                      {t.label}
                    </Text>
                    {t.pro ? (
                      <View style={[styles.proTag, styles.tileProTag]}>
                        <Text style={styles.proTagText}>PRO</Text>
                      </View>
                    ) : null}
                  </Pressable>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}
      {actions.map((a) => (
        <Pressable
          key={a.label}
          onPress={() => run(a)}
          disabled={isOff(a)}
          accessibilityRole="button"
          accessibilityState={{ disabled: isOff(a) }}
          style={({ pressed }) => [styles.action, a.groupStart && styles.groupStart, isGuided(a) && styles.guided, pressed && styles.pressed, isOff(a) && styles.tileDisabled]}>
          <Text style={[styles.actionText, a.destructive && { color: colors.danger }]}>{a.label}</Text>
          {a.pro ? (
            <View style={styles.proTagSpot}>
              <View style={styles.proTag}>
                <Text style={styles.proTagText}>PRO</Text>
              </View>
            </View>
          ) : null}
        </Pressable>
      ))}
      {closeLabel ? (
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          style={({ pressed }) => [styles.action, styles.cancel, pressed && styles.pressed]}>
          <Text style={[styles.actionText, { fontWeight: '600' }]}>{closeLabel}</Text>
        </Pressable>
      ) : null}
    </>
  );

  const modal = (children: ReactNode) => (
    <Modal
      visible={mounted}
      transparent
      // Animated here instead: the system's slide would carry the backdrop up with the sheet.
      animationType="none"
      supportedOrientations={ALL_ORIENTATIONS}
      onRequestClose={onClose}
      // After the slide away has finished and the modal has gone: iOS can now show another one.
      onDismiss={() => {
        const next = pending.current;
        pending.current = null;
        next?.();
      }}>
      {children}
      {overlay}
    </Modal>
  );
  const room = screenHeight - insets.top - insets.bottom - 16;

  if (place?.kind === 'window' && winSpot) {
    const { x, y } = winSpot;
    const w = winW;
    spotBox.set({ x, y, w, h: winH, onPlace });
    return modal(
      <>
        {/* Nothing darkened: a tap anywhere else closes it. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <Animated.View
          onLayout={(e) => measure(e.nativeEvent.layout.height)}
          style={[
            styles.window,
            { left: x, top: y, width: w, maxHeight: room },
            {
              opacity: measured ? progress : 0,
              transform: [...pan.getTranslateTransform(), { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
            },
          ]}>
          <View {...windowTouches.panHandlers} style={styles.windowHead}>
            <Text style={styles.windowTitle} numberOfLines={1}>
              {title ?? ''}
            </Text>
          </View>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" style={styles.windowScroll} contentContainerStyle={styles.windowContent}>
            {body}
          </ScrollView>
          {/* The grip: it can be moved (as a window's corner, or a zone's). */}
          <View {...windowTouches.panHandlers} style={styles.gripSpot} hitSlop={10}>
            <View style={styles.grip} />
          </View>
        </Animated.View>
      </>,
    );
  }

  if (place?.kind === 'drop') {
    // From the top, in the middle, staying where it is.
    const w = Math.min(DROP_W, screenWidth - 32);
    return modal(
      <>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdropLight, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          onLayout={(e) => measure(e.nativeEvent.layout.height)}
          style={[
            styles.drop,
            { top: insets.top + 8, left: (screenWidth - w) / 2, width: w, maxHeight: room },
            { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-(sheetHeight + insets.top + 16), 0] }) }] },
          ]}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {body}
          </ScrollView>
        </Animated.View>
      </>,
    );
  }

  return modal(
    // Lifts the sheet above the keyboard when the header contains a text field.
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        onLayout={(e) => measure(e.nativeEvent.layout.height)}
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 8 },
          { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] }) }] },
        ]}>
        <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {body}
        </ScrollView>
      </Animated.View>
    </KeyboardAvoidingView>,
  );
}

const styles = StyleSheet.create({
  // The sheet sits at the bottom, over a backdrop that covers the whole screen.
  screen: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)' },
  backdropLight: { backgroundColor: 'rgba(0,0,0,0.25)' },
  // A window (as the table's other options are, on iPad: see CardFocus's compact panel).
  window: {
    position: 'absolute',
    borderRadius: 18,
    backgroundColor: 'rgba(8,18,26,0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  windowHead: { alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  windowTitle: { color: colors.text, fontSize: 15, fontWeight: '600', minHeight: 18 },
  windowScroll: { flexShrink: 1 },
  windowContent: { paddingHorizontal: 12, paddingBottom: 22, gap: 6 },
  gripSpot: { position: 'absolute', right: 0, bottom: 0, width: 30, height: 30 },
  grip: { position: 'absolute', right: 7, bottom: 7, width: 14, height: 14, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 6, borderColor: 'rgba(255,255,255,0.85)' },
  // The table's settings, dropped from the top.
  drop: {
    position: 'absolute',
    backgroundColor: colors.surface,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
  },
  content: { padding: 12, gap: 6 },
  title: { color: colors.textMuted, textAlign: 'center', fontSize: 13, marginVertical: 6 },
  action: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancel: { marginTop: 6 },
  groupStart: { marginTop: 10 },
  // Part of Pro, not yet unlocked: a gold tag at the right end of the action.
  proTagSpot: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  proTag: { backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  proTagText: { color: colors.accentText, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  // Each tile sits in a cell with a little padding all round, so the gaps between them stay even.
  tiles: { margin: -3 },
  tileRow: { flexDirection: 'row', justifyContent: 'center' },
  tileCell: { padding: 3 },
  tile: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    gap: 5,
  },
  tileDisabled: { opacity: 0.35 },
  // On a tile: in its top right corner.
  tileProTag: { position: 'absolute', top: 4, right: 4, paddingHorizontal: 5, paddingVertical: 1 },
  tileText: { color: colors.text, fontSize: 12, fontWeight: '500' },
  pressed: { opacity: 0.7 },
  // The walkthrough's choice, ringed in gold.
  guided: { borderWidth: 2, borderColor: colors.accent },
  actionText: { color: colors.text, fontSize: 16 },
});
