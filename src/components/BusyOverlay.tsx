import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useBusy } from '../lib/busy';
import { colors } from '../theme';
import { Text } from './Text';

/** What the app's busy with (see `whileBusy`), over every screen, taking every touch till it's done. */
export function BusyOverlay() {
  const label = useBusy();
  if (!label) return null;
  return (
    <View style={styles.backdrop}>
      <View style={styles.box}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.label}>{label}…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  box: { backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 20, paddingHorizontal: 28, alignItems: 'center', gap: 12 },
  label: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
