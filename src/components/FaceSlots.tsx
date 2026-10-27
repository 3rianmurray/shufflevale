import { Pressable, StyleSheet, View } from 'react-native';

import { faceCount, pieceSizeOf } from '../lib/sandbox';
import type { TablePiece } from '../lib/sandbox';
import { colors } from '../theme';
import { TablePieceView } from './TablePieceView';
import { Text } from './Text';

/** How big each face is drawn. */
const SLOT = 56;

/**
 * A six-sided die's faces (1 to 6), or a coin's (heads and tails), side by side, each drawn just as the piece shows
 * it (the player's own art, or the standard face): tapped, that face's art is chosen.
 */
export function FaceSlots({ piece, onPick }: { piece: TablePiece; onPick: (face: number) => void }) {
  const n = faceCount(piece);
  const own = pieceSizeOf({ ...piece, scale: 1 });
  const coin = piece.kind === 'coin';
  return (
    <View style={styles.row}>
      {Array.from({ length: n }, (_, i) => {
        const name = coin ? (i ? 'Tails' : 'Heads') : String(i + 1);
        return (
          <Pressable
            key={i}
            onPress={() => onPick(i)}
            accessibilityRole="button"
            accessibilityLabel={`${coin ? name : `Face ${name}`}${piece.faces?.[i] ? ', own art' : ''}`}
            style={({ pressed }) => [styles.slot, pressed && styles.pressed]}>
            <View style={{ width: SLOT, height: SLOT }}>
              <TablePieceView piece={{ ...piece, x: SLOT / 2, y: SLOT / 2, angle: 0, value: i + 1, scale: SLOT / Math.max(own.w, own.h) }} />
            </View>
            <Text style={styles.name}>{name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // At most three to a row: a die's six as two even rows.
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, paddingVertical: 6, maxWidth: 3 * (SLOT + 8) + 2 * 10, alignSelf: 'center' },
  slot: { alignItems: 'center', gap: 6, padding: 4, borderRadius: 10 },
  pressed: { opacity: 0.6 },
  name: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
});
