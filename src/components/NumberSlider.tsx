import { useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import * as haptics from '../lib/haptics';
import { colors } from '../theme';
import { Text } from './Text';

const THUMB = 32;

/** Where a whole number sits along the slider (0 to 1), and which number a spot is nearest. */
const toSpot = (n: number, min: number, max: number) => (max === min ? 0 : (n - min) / (max - min));
const fromSpot = (s: number, min: number, max: number) => Math.round(min + Math.min(1, Math.max(0, s)) * (max - min));

/**
 * A whole number to choose, as a slider from `min` to `max` with the number shown big above it: nothing to type
 * (a die's face, say). What it's for changes as it moves; a tick for each number it passes.
 */
export function NumberSlider({ min, max, value, onChange }: { min: number; max: number; value: number; onChange: (n: number) => void }) {
  const [track, setTrack] = useState({ left: 0, width: 1 });
  // Kept outside React state: the slider's drag is made once, and reads where the track is (and the track itself,
  // to measure it again) and what's showing.
  const [live] = useState(() => {
    const box = { track: { left: 0, width: 1 }, min: 1, max: 6, value: 1, onChange: (_: number) => {}, view: null as View | null };
    return { set: (next: Partial<typeof box>) => Object.assign(box, next), get: () => box };
  });
  live.set({ track, min, max, value, onChange });
  const [drag] = useState(() => {
    const at = (pageX: number) => {
      const { track: t, min: lo, max: hi, value: was, onChange: change } = live.get();
      const n = fromSpot((pageX - t.left) / t.width, lo, hi);
      if (n !== was) haptics.tick();
      change(n);
    };
    // Where the track lies now, as a finger comes down: it may have moved since it was laid out (its window
    // dragged elsewhere).
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
      // Sideways drags are the slider's, not the window's.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => start(e.nativeEvent.pageX),
      onPanResponderMove: (e) => at(e.nativeEvent.pageX),
    });
  });
  const spot = toSpot(value, min, max);
  const marks = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <View style={styles.box}>
      <Text style={styles.number}>{value}</Text>
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
        accessibilityLabel="Number"
        accessibilityValue={{ min, max, now: value }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(Math.min(max, Math.max(min, value + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}>
        <View style={styles.rail} />
        <View style={[styles.fill, { width: `${spot * 100}%` }]} />
        {marks.map((m) => (
          <View key={m} style={[styles.mark, { left: `${toSpot(m, min, max) * 100}%` }]} />
        ))}
        <View style={[styles.thumb, { left: `${spot * 100}%` }]} />
      </View>
      <View style={styles.ends}>
        <Text style={styles.end}>{min}</Text>
        <Text style={styles.end}>{max}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingHorizontal: 18, paddingVertical: 6, gap: 6 },
  number: { color: colors.text, fontSize: 44, fontWeight: '700', textAlign: 'center' },
  track: { height: 44, justifyContent: 'center' },
  rail: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)' },
  fill: { position: 'absolute', height: 6, borderRadius: 3, backgroundColor: colors.accent },
  mark: { position: 'absolute', width: 2, height: 10, marginLeft: -1, backgroundColor: 'rgba(255,255,255,0.3)' },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    marginLeft: -THUMB / 2,
    borderRadius: THUMB / 2,
    backgroundColor: '#fff',
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.4)',
  },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
  end: { color: colors.textMuted, fontSize: 13 },
});
