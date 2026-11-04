import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../components/AppIcon';
import { Button } from '../components/Button';
import { Text } from '../components/Text';
import { useDecks } from '../lib/DecksContext';
import { DeckFileError } from '../lib/deckFile';
import { readDeckFile } from '../lib/deckExport';
import type { OpenedFile } from '../lib/deckExport';
import { anyMatches, defaultChoices, fileSummary, takeHeldFile, useFileImport } from '../lib/useFileImport';
import type { DeckChoice, FileChoices, FilePlan, TableChoice } from '../lib/useFileImport';
import { colors } from '../theme';

/** Back to wherever the app was (or the home screen, if it was opened with the file). */
const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** A choice's button words. */
const DECK_WORDS: Record<DeckChoice, string> = { update: 'Update existing', use: 'Use existing', keep: 'Keep both' };
const TABLE_WORDS: Record<TableChoice, string> = { replace: 'Replace existing', keep: 'Keep both' };

/**
 * A Shufflevale file opened in the app from elsewhere (see +native-intent.tsx), or picked on the home screen and
 * holding things already here (`held`): what's in it, and adding it. Decks and tables already here each have their
 * choices (use, update or replace the one here, or keep both). Opening one is free; if its cards don't fit in the
 * free version, the Pro screen is offered, and once it's bought the file can still be added.
 */
export default function OpenFileScreen() {
  const { file, held } = useLocalSearchParams<{ file?: string; held?: string }>();
  const insets = useSafeAreaInsets();
  const { decks } = useDecks();
  const { addFile, fits, cardsIn, planFile } = useFileImport();
  // Taken from the home screen, already read (and what's here already worked out), if it came from there.
  const [handed] = useState(() => (held ? takeHeldFile() : null));
  const [found, setFound] = useState<OpenedFile | null>(handed?.file ?? null);
  const [plan, setPlan] = useState<FilePlan | null>(handed?.plan ?? null);
  const [choices, setChoices] = useState<FileChoices | null>(handed ? defaultChoices(handed.plan) : null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Read once, as it's opened (the copy iOS handed over goes once this screen's done with it); one handed over goes
  // the same way.
  useEffect(() => {
    let gone = false;
    let opened: OpenedFile | null = handed?.file ?? null;
    if (!handed && file) {
      readDeckFile(file)
        .then((f) => {
          opened = f;
          if (gone) f.done();
          else setFound(f);
        })
        .catch((e) => !gone && setError(e instanceof DeckFileError ? e.message : 'Something went wrong reading it.'));
    }
    return () => {
      gone = true;
      opened?.done();
    };
  }, [file, handed]);

  // What's here already: worked out once it's read (comparing pictures can take a moment).
  useEffect(() => {
    if (!found || plan) return;
    const timer = setTimeout(() => {
      const p = planFile(found);
      setPlan(p);
      setChoices(defaultChoices(p));
    }, 50);
    return () => clearTimeout(timer);
    // Once, for the file read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found]);

  const ready = !!found && !!plan && !!choices;
  const roomy = ready && fits(found, plan, choices);

  const add = () => {
    if (!found || !plan || !choices || adding) return;
    // Shown before the pictures are saved (which holds everything up for a big file).
    setAdding(true);
    setTimeout(() => {
      try {
        addFile(found, plan, choices);
      } catch (e) {
        setAdding(false);
        setError(e instanceof DeckFileError ? e.message : 'Something went wrong reading it.');
        return;
      }
      leave();
    }, 80);
  };

  /** One thing in the file that's here already: its name, what it is to the one here, and its choices. */
  const choiceRow = <C extends string>(key: string, name: string, line: string, options: C[], words: Record<C, string>, chosen: C, choose: (c: C) => void) => (
    <View key={key} style={styles.match}>
      <Text style={styles.matchName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.matchLine}>{line}</Text>
      <View style={styles.options}>
        {options.map((o) => (
          <Pressable
            key={o}
            onPress={() => choose(o)}
            accessibilityRole="radio"
            accessibilityState={{ selected: chosen === o }}
            style={({ pressed }) => [styles.option, chosen === o && styles.optionOn, pressed && { opacity: 0.7 }]}>
            <Text style={[styles.optionText, chosen === o && styles.optionTextOn]} numberOfLines={1} adjustsFontSizeToFit>
              {words[o]}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const matches =
    ready && anyMatches(plan) ? (
      <View style={styles.matches}>
        {found.decks.map((u, i) => {
          const m = plan.decks[i];
          const chosen = choices.decks[i];
          if (!m || !chosen) return null;
          const changed = m.how === 'id' && !m.identical;
          const line =
            m.how === 'same'
              ? `Same as “${decks.find((d) => d.id === m.deckId)?.name ?? u.name}”`
              : changed
                ? `Newer version of your deck${m.changed ? ` · ${m.changed} ${m.changed === 1 ? 'card' : 'cards'} changed` : ''}`
                : 'You have this deck';
          const options: DeckChoice[] = changed ? ['update', 'use', 'keep'] : ['use', 'keep'];
          return choiceRow(`d${i}`, u.name, line, options, DECK_WORDS, chosen, (c) =>
            setChoices({ ...choices, decks: choices.decks.map((was, j) => (j === i ? c : was)) }),
          );
        })}
        {found.tables.map((t, i) => {
          const chosen = choices.tables[i];
          if (!plan.tables[i] || !chosen) return null;
          return choiceRow(`t${i}`, t.name, 'You have this table', ['replace', 'keep'] as TableChoice[], TABLE_WORDS, chosen, (c) =>
            setChoices({ ...choices, tables: choices.tables.map((was, j) => (j === i ? c : was)) }),
          );
        })}
      </View>
    ) : null;

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 16 }]}>
      <ScrollView contentContainerStyle={styles.middle}>
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
        ) : ready ? (
          <>
            <Text style={styles.title}>Add {fileSummary(found)}?</Text>
            {!roomy ? (
              <Text style={styles.body}>
                {`It has ${cardsIn(found, plan, choices)} new cards, more than the free version has room for. Shufflevale Pro removes the limit.`}
              </Text>
            ) : matches ? null : (
              <Text style={styles.body}>
                {found.tables.length === 1 && found.decks.length
                  ? `Its decks go in a new group, “${found.tables[0].name} Decks”.`
                  : 'They’re added alongside what you have; nothing is replaced.'}
              </Text>
            )}
            {matches}
          </>
        ) : file || held ? (
          <ActivityIndicator color={colors.accent} size="large" />
        ) : (
          <Text style={styles.title}>No file to open</Text>
        )}
      </ScrollView>
      <View style={[styles.actions, adding && !error && styles.hidden]}>
        {ready && roomy ? <Button label="Add" variant="primary" onPress={add} /> : null}
        {ready && !roomy ? <Button label="See Pro" variant="primary" onPress={() => router.push({ pathname: '/pro', params: { reason: 'cards' } })} /> : null}
        <Button label={found ? 'Not now' : 'Close'} onPress={leave} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  middle: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 24 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
  // What's here already, each with its choices.
  matches: { alignSelf: 'stretch', maxWidth: 480, width: '100%', marginHorizontal: 'auto', gap: 10 },
  match: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, gap: 4 },
  matchName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  matchLine: { color: colors.textMuted, fontSize: 13 },
  options: { flexDirection: 'row', gap: 6, marginTop: 6 },
  option: { flex: 1, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 9, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  optionOn: { backgroundColor: colors.accent },
  optionText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  optionTextOn: { color: colors.accentText },
  actions: { gap: 10 },
  hidden: { opacity: 0, pointerEvents: 'none' },
});
