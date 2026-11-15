import { router } from 'expo-router';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../components/AppIcon';
import { Text } from '../components/Text';
import { versionLines } from '../lib/version';
import { colors } from '../theme';

const SUPPORT = 'https://3rianmurray.github.io/shufflevale/';
const PRIVACY = 'https://3rianmurray.github.io/shufflevale/privacy.html';
const EMAIL = 'shufflevale@gmail.com';

const IS_PAD = Platform.OS === 'ios' && Platform.isPad;
/** The iPad window's width at most (the Shufflevale menu's), and the room kept above and below it. */
const WINDOW_WIDTH = 440;
const WINDOW_ROOM = 24;

/** The app's name and icon, which version is running (down to the update), and where to get help. */
export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { version, update } = versionLines();
  const links: [string, string][] = [
    ['Support', SUPPORT],
    ['Privacy Policy', PRIVACY],
    [`Email ${EMAIL}`, `mailto:${EMAIL}`],
  ];
  const body = (
    <>
      <AppIcon size={112} />
      <Text style={styles.name}>Shufflevale</Text>
      <Text style={styles.tagline}>Your own cards, ready to play</Text>
      <Text style={styles.version}>{version}</Text>
      {/* Which over-the-air update is running, smaller (only once one is). */}
      {update ? <Text style={styles.update}>{update}</Text> : null}
      <View style={[styles.links, IS_PAD && styles.padLinks]}>
        {links.map(([label, url], i) => (
          <Pressable
            key={url}
            onPress={() => Linking.openURL(url).catch(() => {})}
            accessibilityRole="link"
            style={({ pressed }) => [styles.link, i > 0 && styles.linkDivider, pressed && { opacity: 0.6 }]}>
            <Text style={styles.linkText}>{label}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.footnote}>© 2026 Brian Murray</Text>
    </>
  );

  // On iPad: a window in the middle of the screen, looking like the Shufflevale menu, as tall as it needs (it scrolls
  // if the screen is too short). A tap outside it closes it.
  if (IS_PAD) {
    return (
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.window, { width: Math.min(WINDOW_WIDTH, width - 32), maxHeight: height - insets.top - insets.bottom - WINDOW_ROOM * 2 }]}>
          <ScrollView style={styles.windowScroll} bounces={false} contentContainerStyle={styles.content}>
            {body}
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      {body}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // iPad: the screen dimmed a little behind the window (as behind the menu), which sits in the middle.
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  window: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  // Only as tall as what's in it (up to the window's most).
  windowScroll: { flexGrow: 0, borderRadius: 16 },
  content: { alignItems: 'center', padding: 24, paddingTop: 36 },
  name: { color: colors.text, fontSize: 26, fontWeight: '700', marginTop: 16 },
  tagline: { color: colors.textMuted, fontSize: 15, marginTop: 4 },
  version: { color: colors.textMuted, fontSize: 13, marginTop: 14, textAlign: 'center' },
  update: { color: colors.textMuted, fontSize: 11, marginTop: 2, textAlign: 'center', opacity: 0.7 },
  links: { alignSelf: 'stretch', backgroundColor: colors.surface, borderRadius: 14, marginTop: 28 },
  // On the window (already the surface color), the links stand out on the screen's own color instead.
  padLinks: { backgroundColor: colors.bg },
  link: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  linkDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  linkText: { flex: 1, color: colors.accent, fontSize: 16, fontWeight: '600' },
  chevron: { color: colors.textMuted, fontSize: 20 },
  footnote: { color: colors.textMuted, fontSize: 12, marginTop: 24 },
});
