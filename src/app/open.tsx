import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../components/AppIcon';
import { Button } from '../components/Button';
import { Text } from '../components/Text';
import { DeckFileError } from '../lib/deckFile';
import { readDeckFile } from '../lib/deckExport';
import type { OpenedFile } from '../lib/deckExport';
import { usePro } from '../lib/pro';
import { fileSummary, useFileImport } from '../lib/useFileImport';
import { colors } from '../theme';

/** Back to wherever the app was (or the home screen, if it was opened with the file). */
const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * A Shufflevale file opened in the app from elsewhere (see +native-intent.tsx): what's in it, and adding it. Files
 * are part of Pro: without it, the Pro screen is offered, and once it's bought the file can still be added.
 */
export default function OpenFileScreen() {
  const { file } = useLocalSearchParams<{ file?: string }>();
  const insets = useSafeAreaInsets();
  const pro = usePro();
  const { addFile } = useFileImport();
  const [found, setFound] = useState<OpenedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Read once, as it's opened (the copy iOS handed over goes once this screen's done with it).
  useEffect(() => {
    if (!file) return;
    let gone = false;
    let opened: OpenedFile | null = null;
    readDeckFile(file)
      .then((f) => {
        opened = f;
        if (gone) f.done();
        else setFound(f);
      })
      .catch((e) => !gone && setError(e instanceof DeckFileError ? e.message : 'Something went wrong reading it.'));
    return () => {
      gone = true;
      opened?.done();
    };
  }, [file]);

  const add = () => {
    if (!found || adding) return;
    // Shown before the pictures are saved (which holds everything up for a big file).
    setAdding(true);
    setTimeout(() => {
      try {
        addFile(found);
      } catch (e) {
        setAdding(false);
        setError(e instanceof DeckFileError ? e.message : 'Something went wrong reading it.');
        return;
      }
      leave();
    }, 80);
  };

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.middle}>
        <AppIcon size={88} />
        {error ? (
          <>
            <Text style={styles.title}>Couldn’t open that file</Text>
            <Text style={styles.body}>{error}</Text>
          </>
        ) : adding ? (
          <>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.body}>Adding…</Text>
          </>
        ) : found ? (
          <>
            <Text style={styles.title}>Add {fileSummary(found)}?</Text>
            <Text style={styles.body}>
              {pro
                ? found.tables.length === 1 && found.decks.length
                  ? `Its decks go in a new group, “${found.tables[0].name} Decks”.`
                  : 'They’re added alongside what you have; nothing is replaced.'
                : 'Opening Shufflevale files is part of Pro.'}
            </Text>
          </>
        ) : file ? (
          <ActivityIndicator color={colors.accent} size="large" />
        ) : (
          <Text style={styles.title}>No file to open</Text>
        )}
      </View>
      <View style={[styles.actions, adding && !error && styles.hidden]}>
        {found && pro ? <Button label="Add" variant="primary" onPress={add} /> : null}
        {found && !pro ? <Button label="See Pro" variant="primary" onPress={() => router.push({ pathname: '/pro', params: { reason: 'files' } })} /> : null}
        <Button label={found ? 'Not now' : 'Close'} onPress={leave} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
  actions: { gap: 10 },
  hidden: { opacity: 0, pointerEvents: 'none' },
});
