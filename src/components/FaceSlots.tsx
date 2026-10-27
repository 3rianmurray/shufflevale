import { Pressable, StyleSheet, View } from 'react-native';

import { faceCount, pieceSizeOf } from '../lib/sandbox';
import type { TablePiece } from '../lib/sandbox';
import { colors } from '../theme';
import { TablePieceView } from './TablePieceView';
import { Text } from './Text';

/** How big each face is drawn: smaller for the dice with many. */
const SLOT = 56;
const SMALL_SLOT = 46;
/** How many to a row, so each die's faces make even rows (a d6's two of three, a d20's four of five). */
const COLUMNS: Record<number, number> = { 2: 2, 4: 4, 6: 3, 8: 4, 10: 5, 12: 4, 20: 5 };
const GAP = 10;

/**
 * A die's faces (1 up), or a coin's (heads and tails), side by side, each drawn just as the piece shows it (the
 * player's own art, or the standard face): tapped, that face's art is chosen.
 */
export function FaceSlots({ piece, onPick }: { piece: TablePiece; onPick: (face: number) => void }) {
  const n = faceCount(piece);
  const own = pieceSizeOf({ ...piece, scale: 1 });
  const coin = piece.kind === 'coin';
  const slot = n > 6 ? SMALL_SLOT : SLOT;
  const columns = COLUMNS[n] ?? 4;
  return (
    <View style={[styles.row, { maxWidth: columns * (slot + 8) + (columns - 1) * GAP }]}>
      {Array.from({ length: n }, (_, i) => {
        const name = coin ? (i ? 'Tails' : 'Heads') : String(i + 1);
        return (
          <Pressable
            key={i}
            onPress={() => onPick(i)}
            accessibilityRole="button"
            accessibilityLabel={`${coin ? name : `Face ${name}`}${piece.faces?.[i] ? ', own art' : ''}`}
            style={({ pressed }) => [styles.slot, pressed && styles.pressed]}>
            <View style={{ width: slot, height: slot }}>
              <TablePieceView piece={{ ...piece, x: slot / 2, y: slot / 2, angle: 0, value: i + 1, scale: slot / Math.max(own.w, own.h) }} />
            </View>
            <Text style={styles.name}>{name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // (As many to a row as COLUMNS has: its width's set where it's drawn.)
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: GAP, paddingVertical: 6, alignSelf: 'center' },
  slot: { alignItems: 'center', gap: 6, padding: 4, borderRadius: 10 },
  pressed: { opacity: 0.6 },
  name: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
});
