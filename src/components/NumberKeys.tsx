import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { colors } from '../theme';
import { MAX_TEXT_SCALE, Text } from './Text';

/** The delete key's label (and what it sends). */
export const DELETE_KEY = '⌫';

/** Below this window height, on its side (an iPhone turned sideways), the keys go two rows of six, and lower. */
const SHORT_HEIGHT = 500;

/**
 * The app's own number keys (on iPad, where Apple's number pad floats beside the field, pointing at it): 1 to 9, then
 * `extra` (a minus sign, a colon, a Done, or nothing), 0 and delete. Each key pressed is sent to `onKey`. Three to a
 * row; on a short screen on its side (an iPhone turned sideways), six to a row and lower, so they leave room.
 */
export function NumberKeys({ onKey, extra = '' }: { onKey: (key: string) => void; extra?: string }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', extra, '0', DELETE_KEY];
  const { width, height } = useWindowDimensions();
  const short = height < SHORT_HEIGHT && width > height;
  const size = short ? styles.keyShort : styles.keyTall;
  return (
    <View style={[styles.keys, short && styles.keysShort]}>
      {keys.map((key, i) =>
        key ? (
          <Pressable
            key={i}
            onPress={() => onKey(key)}
            accessibilityRole="button"
            accessibilityLabel={key === DELETE_KEY ? 'Delete' : key === '-' ? 'Minus' : key}
            style={({ pressed }) => [styles.key, size, pressed && styles.pressed]}>
            <Text style={[styles.keyText, key.length > 1 && styles.wordText]} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
              {key}
            </Text>
          </Pressable>
        ) : (
          <View key={i} style={size} />
        ),
      )}
    </View>
  );
}

/** A key pressed, applied to the number as typed (`selected`: it's all still selected, so a digit replaces it). */
export function typeKey(text: string, key: string, selected: boolean, most: number): string {
  const from = selected ? '' : text;
  if (key === DELETE_KEY) return from.slice(0, -1);
  // A minus sign only goes first: pressed again, it comes off.
  if (key === '-') return from.startsWith('-') ? from.slice(1) : `-${from}`;
  return from.length < most ? from + key : from;
}

const styles = StyleSheet.create({
  keys: { alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  keysShort: { rowGap: 6 },
  key: { borderRadius: 10, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  // Three keys to a row.
  keyTall: { width: '31.5%', height: 52 },
  // Six to a row, lower (a short screen on its side).
  keyShort: { width: '15.5%', height: 40 },
  pressed: { opacity: 0.6 },
  keyText: { color: colors.text, fontSize: 22, fontWeight: '600' },
  wordText: { fontSize: 16 },
});
