import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';

import { answerName, MAX_NAME_LENGTH, titleCase, useNameRequest } from '../lib/names';
import { colors } from '../theme';
import { Button } from './Button';
import { MAX_TEXT_SCALE, Text } from './Text';
import { ALL_ORIENTATIONS } from '../lib/orientations';

/**
 * The app's prompt for a name (see `askName`), over every screen: a title, a field that keeps what's typed in
 * title case, and Cancel and Save.
 */
export function NamePrompt() {
  const request = useNameRequest();
  const [draft, setDraft] = useState('');
  // A new request starts from its own name.
  const [shown, setShown] = useState<typeof request>(null);
  // What's there is selected as it opens (so typing replaces it), until the first change.
  const [selectAll, setSelectAll] = useState(true);
  // A name is title-cased as it's typed; words on a table (plain), a number or a time are kept as typed (a number
  // or time with the number keyboard).
  const kind = shown?.kind ?? 'name';
  const plain = !!shown?.plain;
  const asTyped = (t: string) => (kind === 'name' && !plain ? titleCase(t) : t);
  if (request !== shown) {
    setShown(request);
    setSelectAll(true);
    setDraft(request ? ((request.kind ?? 'name') === 'name' && !request.plain ? titleCase(request.current) : request.current) : '');
  }
  const save = () => answerName(draft);

  // Where the box goes: by default up the screen, above where the keyboard comes, so it stays put when it shows (no
  // lifting); or, asked for at a place (see NameRequest's `at`), with its field right there, as long as the box
  // still clears the keyboard.
  const { height } = useWindowDimensions();
  // The field's middle, down from the box's top, and the box's height (measured; till then, about what they are).
  const [fieldMid, setFieldMid] = useState(72);
  const [boxH, setBoxH] = useState(160);
  // On iPad a number has the app's own keys, just under the box (iPad's own number pad floats by the field, pointing
  // at it). What's below the box is then those keys, not the keyboard.
  const ownKeys = IS_PAD && kind !== 'name';
  const [keysH, setKeysH] = useState(250);
  const below = ownKeys ? keysH + KEYS_GAP + 16 : KEYBOARD_ROOM;
  const top = shown?.at === undefined ? DEFAULT_TOP : Math.max(MIN_TOP, Math.min(shown.at - fieldMid, height - below - boxH - 8));
  /** A key pressed: typed after what's there, or (still all selected, as it opens) in place of it. */
  const press = (key: string) => {
    const from = selectAll ? '' : draft;
    setSelectAll(false);
    if (key === DELETE) return setDraft(from.slice(0, -1));
    // A minus sign only goes first: pressed again, it comes off.
    if (key === '-') return setDraft(from.startsWith('-') ? from.slice(1) : `-${from}`);
    if (from.length < MAX_NAME_LENGTH) setDraft(from + key);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', kind === 'signed' ? '-' : kind === 'time' ? ':' : '', '0', DELETE];

  return (
    <Modal visible={!!request} transparent animationType="fade" supportedOrientations={ALL_ORIENTATIONS} onRequestClose={() => answerName(null)}>
      <KeyboardAvoidingView style={[styles.backdrop, { paddingTop: top }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => answerName(null)} accessibilityLabel="Cancel" />
        <View style={styles.box} onLayout={(e) => setBoxH(e.nativeEvent.layout.height)}>
          <Text style={styles.title}>{shown?.title}</Text>
          <TextInput
            onLayout={(e) => setFieldMid(e.nativeEvent.layout.y + e.nativeEvent.layout.height / 2)}
            // On iPad, a number's keys are the app's own (below): iPad's keyboard stays away, the cursor still shows.
            showSoftInputOnFocus={!ownKeys}
            autoFocus
            selectTextOnFocus
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            value={draft}
            maxLength={MAX_NAME_LENGTH}
            onChangeText={(t) => {
              setSelectAll(false);
              setDraft(asTyped(t));
            }}
            selection={selectAll ? { start: 0, end: draft.length } : undefined}
            autoCapitalize={kind !== 'name' ? 'none' : plain ? 'sentences' : 'words'}
            // Digits only for a count; with a minus sign, or a colon for a time, the keyboard that has them.
            keyboardType={kind === 'number' ? 'number-pad' : kind === 'name' ? 'default' : 'numbers-and-punctuation'}
            returnKeyType="done"
            onSubmitEditing={save}
            style={styles.input}
            placeholderTextColor={colors.textMuted}
            placeholder={kind === 'name' ? (plain ? 'Text' : 'Name') : kind === 'time' ? '1:30' : '0'}
          />
          <View style={styles.buttons}>
            <Button label="Cancel" onPress={() => answerName(null)} style={{ flex: 1 }} />
            <Button label={shown?.confirm ?? 'Save'} variant="primary" onPress={save} disabled={!draft.trim()} style={{ flex: 1 }} />
          </View>
        </View>
        {ownKeys ? (
          <View style={styles.keys} onLayout={(e) => setKeysH(e.nativeEvent.layout.height)}>
            {keys.map((key, i) =>
              key ? (
                <Pressable
                  key={i}
                  onPress={() => press(key)}
                  accessibilityRole="button"
                  accessibilityLabel={key === DELETE ? 'Delete' : key === '-' ? 'Minus' : key}
                  style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}>
                  <Text style={styles.keyText} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
                    {key}
                  </Text>
                </Pressable>
              ) : (
                <View key={i} style={styles.keySpace} />
              ),
            )}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** The box's usual top; the highest it goes (clear of the status bar); and the room kept for the keyboard below it. */
const DEFAULT_TOP = 140;
const MIN_TOP = 60;
const IS_PAD = Platform.OS === 'ios' && Platform.isPad;
const KEYBOARD_ROOM = IS_PAD ? 420 : 330;
/** The app's own number keys (iPad): the gap above them, and the delete key. */
const KEYS_GAP = 10;
const DELETE = '⌫';

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', backgroundColor: 'rgba(0,0,0,0.45)', padding: 24 },
  box: { width: '100%', maxWidth: 340, backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 14 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  input: {
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  buttons: { flexDirection: 'row', gap: 10 },
  // Three keys to a row, under the box and as wide as it.
  keys: {
    width: '100%',
    maxWidth: 340,
    marginTop: KEYS_GAP,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 10,
  },
  key: { width: '31.5%', height: 52, borderRadius: 10, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  keyPressed: { opacity: 0.6 },
  keySpace: { width: '31.5%', height: 52 },
  keyText: { color: colors.text, fontSize: 22, fontWeight: '600' },
});
