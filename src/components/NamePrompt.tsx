import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';

import { answerName, MAX_NAME_LENGTH, useNameRequest } from '../lib/names';
import { colors } from '../theme';
import { Button } from './Button';
import { NumberKeys, typeKey } from './NumberKeys';
import { MAX_TEXT_SCALE, Text } from './Text';
import { ALL_ORIENTATIONS } from '../lib/orientations';

/**
 * The app's prompt for a name (see `askName`), over every screen: a title, a field, and Cancel and Save.
 */
export function NamePrompt() {
  const request = useNameRequest();
  const [draft, setDraft] = useState('');
  // A new request starts from its own name.
  const [shown, setShown] = useState<typeof request>(null);
  // What's there is selected as it opens (so typing replaces it), until the first change.
  const [selectAll, setSelectAll] = useState(true);
  // Kept just as typed (a number or time with the number keyboard).
  const kind = shown?.kind ?? 'name';
  const plain = !!shown?.plain;
  if (request !== shown) {
    setShown(request);
    setSelectAll(true);
    setDraft(request ? request.current : '');
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
    setDraft(typeKey(draft, key, selectAll, MAX_NAME_LENGTH));
    setSelectAll(false);
  };

  return (
    <Modal visible={!!request} transparent animationType="fade" supportedOrientations={ALL_ORIENTATIONS} onRequestClose={() => answerName(null)}>
      <KeyboardAvoidingView style={[styles.backdrop, { paddingTop: top }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => answerName(null)} accessibilityLabel="Cancel" />
        <View style={styles.box} onLayout={(e) => setBoxH(e.nativeEvent.layout.height)}>
          <Text style={styles.title}>{shown?.title}</Text>
          {ownKeys ? (
            // On iPad a number is shown, not typed in a field (so Apple's keyboard never comes): the keys below change
            // it. Still all selected as it opens, it's highlighted (the first key replaces it).
            // A tap selects it all, or lets go of the selection.
            <Pressable
              onPress={() => setSelectAll(!selectAll)}
              accessibilityRole="button"
              style={styles.input}
              onLayout={(e) => setFieldMid(e.nativeEvent.layout.y + e.nativeEvent.layout.height / 2)}>
              <Text style={[styles.shownNumber, selectAll && !!draft && styles.selectedNumber]} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
                {draft || ' '}
              </Text>
            </Pressable>
          ) : (
          <TextInput
            onLayout={(e) => setFieldMid(e.nativeEvent.layout.y + e.nativeEvent.layout.height / 2)}
            autoFocus
            selectTextOnFocus
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            value={draft}
            maxLength={MAX_NAME_LENGTH}
            onChangeText={(t) => {
              setSelectAll(false);
              setDraft(t);
            }}
            selection={selectAll ? { start: 0, end: draft.length } : undefined}
            // A touch in the field hands the selection back to it (so a tap puts the cursor there, as anywhere), rather
            // than holding it all selected till the first key.
            onPressIn={() => setSelectAll(false)}
            autoCapitalize={kind !== 'name' ? 'none' : 'sentences'}
            // Digits only for a count; with a minus sign, or a colon for a time, the keyboard that has them.
            keyboardType={kind === 'number' ? 'number-pad' : kind === 'name' ? 'default' : 'numbers-and-punctuation'}
            returnKeyType="done"
            onSubmitEditing={save}
            style={styles.input}
            placeholderTextColor={colors.textMuted}
            placeholder={kind === 'name' ? (plain ? 'Text' : 'Name') : kind === 'time' ? '1:30' : '0'}
          />
          )}
          <View style={styles.buttons}>
            <Button label="Cancel" onPress={() => answerName(null)} style={{ flex: 1 }} />
            <Button label={shown?.confirm ?? 'Save'} variant="primary" onPress={save} disabled={!draft.trim()} style={{ flex: 1 }} />
          </View>
        </View>
        {ownKeys ? (
          <View style={styles.keys} onLayout={(e) => setKeysH(e.nativeEvent.layout.height)}>
            <NumberKeys onKey={press} extra={kind === 'signed' ? '-' : kind === 'time' ? ':' : ''} />
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
/** The gap above the app's own number keys (iPad). */
const KEYS_GAP = 10;

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
  // A number shown (iPad), in the field's place; highlighted while it's all selected.
  shownNumber: { color: colors.text, fontSize: 16, alignSelf: 'flex-start', borderRadius: 4, overflow: 'hidden' },
  selectedNumber: { backgroundColor: 'rgba(224,179,84,0.45)' },
  // The keys' panel, under the box and as wide as it.
  keys: { width: '100%', maxWidth: 340, marginTop: KEYS_GAP, backgroundColor: colors.surface, borderRadius: 16, padding: 10 },
});
