import { useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';

import * as haptics from '../lib/haptics';
import { normalizeAngle } from '../lib/sandbox';
import { colors } from '../theme';
import { NumberKeys, typeKey } from './NumberKeys';
import { MAX_TEXT_SCALE, Text } from './Text';

/** Within this many degrees of a 45° step, the slider settles on it, with a tick. */
const SNAP = 4;
const STEP = 45;
const THUMB = 28;

/** Where an angle (−180 to 180) sits along the slider, and back: 0° in the middle. */
const toSpot = (deg: number) => (normalizeAngle(deg) + 180) / 360;
const fromSpot = (s: number) => {
  const deg = Math.round(Math.min(1, Math.max(0, s)) * 360 - 180);
  const near = Math.round(deg / STEP) * STEP;
  return Math.abs(deg - near) <= SNAP ? near : deg;
};
/** The 45° steps, marked along it. */
const MARKS = Array.from({ length: 360 / STEP + 1 }, (_, i) => i * STEP - 180);

/**
 * A turn to choose, as it's wanted (what's turned changes as it moves), as the scale is (see ScaleControl): a
 * slider from −180° to 180° with 0° in the middle, settling on each 45° step; the degrees to type (tapped, with the
 * app's own keys under it); and back to 0°.
 */
export function RotationControl({ value, onChange }: { value: number; onChange: (deg: number) => void }) {
  const [track, setTrack] = useState({ left: 0, width: 1 });
  // The degrees being typed (keys showing), and whether they're still all selected (the first key replaces them).
  const [typed, setTyped] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);
  // Kept outside React state: the slider's drag is made once, and reads where the track is (and the track itself,
  // to measure it again) and what's showing.
  const [live] = useState(() => {
    const box = { track: { left: 0, width: 1 }, value: 0, onChange: (_: number) => {}, view: null as View | null };
    return { set: (next: Partial<typeof box>) => Object.assign(box, next), get: () => box };
  });
  live.set({ track, value, onChange });
  const [drag] = useState(() => {
    const at = (pageX: number) => {
      const { track: t, value: was, onChange: change } = live.get();
      const deg = fromSpot((pageX - t.left) / t.width);
      if (deg % STEP === 0 && deg !== was) haptics.tick();
      change(deg);
    };
    // Where the track lies now, as a finger comes down: it may have moved since it was laid out (its window
    // dragged elsewhere, or its sheet still sliding in).
    const start = (pageX: number) => {
      const { view } = live.get();
      if (!view) return at(pageX);
      view.measureInWindow((x, _y, width) => {
        const t = { left: x, width: Math.max(1, width) };
        live.set({ track: t });
        setTrack(t);
        at(pageX);
      });
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Sideways drags are the slider's, not the sheet's.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => start(e.nativeEvent.pageX),
      onPanResponderMove: (e) => at(e.nativeEvent.pageX),
    });
  });
  const shown = Math.round(normalizeAngle(value));
  /** Opens the keys (starting from the degrees, all selected); open and all selected, lets go of the selection; else closes them. */
  const toggleKeys = () => {
    if (typed !== null && fresh && typed) return setFresh(false);
    setTyped(typed === null ? String(shown) : null);
    setFresh(true);
  };
  /** A key pressed: what's turned follows as soon as what's typed is a turn (−180 to 180). */
  const typeIt = (key: string) => {
    const next = typeKey(typed ?? '', key, fresh, 4);
    setTyped(next);
    setFresh(false);
    const n = parseInt(next, 10);
    if (Number.isFinite(n) && Math.abs(n) <= 180) onChange(n);
  };
  const spot = toSpot(shown);
  const mid = toSpot(0);
  return (
    <View style={styles.box}>
      <View
        ref={(v) => {
          live.set({ view: v });
        }}
        style={styles.track}
        // Where it lies across the screen, to tell where along it a finger is.
        onLayout={() => live.get().view?.measureInWindow((x, _y, width) => setTrack({ left: x, width: Math.max(1, width) }))}
        {...drag.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Rotation"
        accessibilityValue={{ text: `${shown} degrees` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(normalizeAngle(shown + (e.nativeEvent.actionName === 'increment' ? STEP : -STEP)))}>
        <View style={styles.rail} />
        {/* Filled from 0° (the middle) to where it's turned. */}
        <View style={[styles.fill, { left: `${Math.min(spot, mid) * 100}%`, width: `${Math.abs(spot - mid) * 100}%` }]} />
        {MARKS.map((m) => (
          <View key={m} style={[styles.mark, m === 0 && styles.markMiddle, { left: `${((m + 180) / 360) * 100}%` }]} />
        ))}
        <View style={[styles.thumb, { left: `${spot * 100}%` }]} />
      </View>
      <View style={styles.row}>
        <Pressable
          onPress={toggleKeys}
          accessibilityRole="button"
          accessibilityLabel="Rotation, in degrees"
          accessibilityValue={{ text: typed ?? String(shown) }}
          style={[styles.inputBox, typed !== null && styles.inputBoxOn]}>
          <Text style={[styles.input, typed !== null && fresh && !!typed && styles.selected]} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
            {typed === null ? String(shown) : typed || ' '}
          </Text>
          <Text style={styles.unit}>°</Text>
        </Pressable>
        <Text style={styles.limits}>−180–180°</Text>
        <Pressable
          onPress={() => {
            onChange(0);
            haptics.tick();
          }}
          disabled={shown === 0}
          accessibilityRole="button"
          style={({ pressed }) => [styles.reset, shown === 0 && styles.resetOff, pressed && { opacity: 0.6 }]}>
          <Text style={styles.resetText}>Reset to 0°</Text>
        </Pressable>
      </View>
      {typed !== null ? <NumberKeys onKey={typeIt} extra="-" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingHorizontal: 18, paddingVertical: 10, gap: 14 },
  track: { height: 44, justifyContent: 'center' },
  rail: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)' },
  fill: { position: 'absolute', height: 6, borderRadius: 3, backgroundColor: colors.accent },
  mark: { position: 'absolute', width: 2, height: 10, marginLeft: -1, backgroundColor: 'rgba(255,255,255,0.3)' },
  markMiddle: { height: 16, backgroundColor: 'rgba(255,255,255,0.5)' },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    marginLeft: -THUMB / 2,
    borderRadius: THUMB / 2,
    backgroundColor: '#fff',
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.4)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 10 },
  inputBoxOn: { borderWidth: 1, borderColor: colors.accent },
  input: { color: colors.text, fontSize: 18, fontWeight: '600', minWidth: 52, paddingVertical: 8, textAlign: 'right' },
  // Still all selected: the first key replaces it.
  selected: { backgroundColor: 'rgba(224,179,84,0.45)', borderRadius: 4, overflow: 'hidden' },
  unit: { color: colors.textMuted, fontSize: 16, marginLeft: 2 },
  limits: { flex: 1, color: colors.textMuted, fontSize: 13 },
  reset: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)' },
  resetOff: { opacity: 0.4 },
  resetText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
});
