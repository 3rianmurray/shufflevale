import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clearRollLog, ROLL_DEBUG, useRollLog } from '../lib/rollDebug';
import { Text } from './Text';

/** Tester builds only: the last roll's log (see lib/rollDebug), over the table, with a tap to close it. */
export function RollDebugOverlay() {
  const insets = useSafeAreaInsets();
  const lines = useRollLog();
  if (!ROLL_DEBUG || !lines.length) return null;
  return (
    <View style={[styles.box, { top: insets.top + 64 }]} pointerEvents="box-none">
      <Pressable onPress={clearRollLog} accessibilityRole="button" accessibilityLabel="Close the roll log" style={styles.inner}>
        <Text style={styles.title}>Roll log (tap to close)</Text>
        {lines.map((l, i) => (
          <Text key={i} style={styles.line} numberOfLines={1}>
            {l}
          </Text>
        ))}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', left: 8, right: 8, zIndex: 50 },
  inner: { backgroundColor: 'rgba(0,0,0,0.78)', borderRadius: 8, padding: 8 },
  title: { color: '#ffd76a', fontSize: 11, fontWeight: '700', marginBottom: 2 },
  line: { color: '#ffffff', fontSize: 10, fontFamily: 'Menlo' },
});
