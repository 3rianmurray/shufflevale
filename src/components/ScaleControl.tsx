import { useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';

import * as haptics from '../lib/haptics';
import { clampScale, SCALE_MAX, SCALE_MIN } from '../lib/sandbox';
import { colors } from '../theme';
import { NumberKeys, typeKey } from './NumberKeys';
import { MAX_TEXT_SCALE, Text } from './Text';

/** Within this much of 100% (on the slider's own terms), it settles on 100%, with a tick. */
const SNAP = 0.03;
const THUMB = 28;

// The slider goes by ratio: halving and doubling are the same distance either way (100% is marked along it).
const LOG_MIN = Math.log(SCALE_MIN);
const LOG_SPAN = Math.log(SCALE_MAX) - LOG_MIN;
const toSpot = (k: number) => (Math.log(clampScale(k)) - LOG_MIN) / LOG_SPAN;
const fromSpot = (s: number) => {
  const k = Math.exp(LOG_MIN + Math.min(1, Math.max(0, s)) * LOG_SPAN);
  return Math.abs(s - toSpot(1)) < SNAP ? 1 : k;
};
const percent = (k: number) => `${Math.round(k * 100)}`;

/**
 * A scale to choose, as it's wanted (the chosen things change as it moves): a slider from SCALE_MIN to SCALE_MAX
 * with 100% in the middle, the percentage to type (tapped, with the app's own keys under it), and a way back to 100%.
 */
export function ScaleControl({ value, onChange }: { value: number; onChange: (k: number) => void }) {
  const [track, setTrack] = useState({ left: 0, width: 1 });
  // The percentage being typed (keys showing), and whether it's still all selected (the first key replaces it).
  const [typed, setTyped] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);
  // Kept outside React state: the slider's drag is made once, and reads where the track is (and the track itself,
  // to measure it again) and what's showing.
  const [live] = useState(() => {
    const box = { track: { left: 0, width: 1 }, value: 1, onChange: (_: number) => {}, view: null as View | null };
    return { set: (next: Partial<typeof box>) => Object.assign(box, next), get: () => box };
  });
  live.set({ track, value, onChange });
  const [drag] = useState(() => {
    const at = (pageX: number) => {
      const { track: t, value: was, onChange: change } = live.get();
      const k = fromSpot((pageX - t.left) / t.width);
      if (k === 1 && was !== 1) haptics.tick();
      change(k);
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
  /** Opens the keys (starting from the percentage, all selected); open and all selected, lets go of the selection; else closes them. */
  const toggleKeys = () => {
    if (typed !== null && fresh && typed) return setFresh(false);
    setTyped(typed === null ? percent(value) : null);
    setFresh(true);
  };
  /** A key pressed: the scale follows as soon as what's typed is within range (so 150 doesn't pass through 1% and 15%). */
  const typeIt = (key: string) => {
    const next = typeKey(typed ?? '', key, fresh, 3);
    setTyped(next);
    setFresh(false);
    const k = parseInt(next, 10) / 100;
    if (k >= SCALE_MIN && k <= SCALE_MAX) onChange(k);
  };
  const spot = toSpot(value);
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
        accessibilityLabel="Scale"
        accessibilityValue={{ text: `${percent(value)} percent` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(clampScale(value * (e.nativeEvent.actionName === 'increment' ? 1.1 : 1 / 1.1)))}>
        <View style={styles.rail} />
        <View style={[styles.fill, { width: `${spot * 100}%` }]} />
        {/* 100%, in the middle. */}
        <View style={[styles.mark, { left: `${toSpot(1) * 100}%` }]} />
        <View style={[styles.thumb, { left: `${spot * 100}%` }]} />
      </View>
      <View style={styles.row}>
        <Pressable
          onPress={toggleKeys}
          accessibilityRole="button"
          accessibilityLabel="Scale, in percent"
          accessibilityValue={{ text: typed ?? percent(value) }}
          style={[styles.inputBox, typed !== null && styles.inputBoxOn]}>
          <Text style={[styles.input, typed !== null && fresh && !!typed && styles.selected]} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
            {typed === null ? percent(value) : typed || ' '}
          </Text>
          <Text style={styles.unit}>%</Text>
        </Pressable>
        <Text style={styles.limits}>
          {percent(SCALE_MIN)}–{percent(SCALE_MAX)}%
        </Text>
        <Pressable
          onPress={() => {
            onChange(1);
            haptics.tick();
          }}
          disabled={value === 1}
          accessibilityRole="button"
          style={({ pressed }) => [styles.reset, value === 1 && styles.resetOff, pressed && { opacity: 0.6 }]}>
          <Text style={styles.resetText}>Reset to 100%</Text>
        </Pressable>
      </View>
      {typed !== null ? <NumberKeys onKey={typeIt} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingHorizontal: 18, paddingVertical: 10, gap: 14 },
  track: { height: 44, justifyContent: 'center' },
  rail: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)' },
  fill: { position: 'absolute', height: 6, borderRadius: 3, backgroundColor: colors.accent },
  mark: { position: 'absolute', width: 2, height: 16, marginLeft: -1, backgroundColor: 'rgba(255,255,255,0.45)' },
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
  input: { color: colors.text, fontSize: 18, fontWeight: '600', minWidth: 44, paddingVertical: 8, textAlign: 'right' },
  // Still all selected: the first key replaces it.
  selected: { backgroundColor: 'rgba(224,179,84,0.45)', borderRadius: 4, overflow: 'hidden' },
  unit: { color: colors.textMuted, fontSize: 16, marginLeft: 2 },
  limits: { flex: 1, color: colors.textMuted, fontSize: 13 },
  reset: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)' },
  resetOff: { opacity: 0.4 },
  resetText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
});
