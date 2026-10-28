// Shufflevale Pro: a one-time purchase from the App Store (StoreKit, through expo-iap), which takes away the free
// version's card limit, adds sharing and backing up deck files (opening one is free), and adds what's made with the
// player's own pictures on the table: custom art, custom tokens, and dice and coins' own faces (see isProPiece). Owning
// it is remembered on the phone, so it works offline; the App Store is asked again each time the app opens (which
// also catches a refund). The purchase is the only way in.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';

import type { TablePiece } from './sandbox';
import { copiesOf } from './types';
import type { Deck } from './types';
import { loadSettings, saveSettings } from './storage';

/** The Pro product, as set up in App Store Connect. */
export const PRO_PRODUCT_ID = 'com.3rianmurray.shufflevale.pro';

type Iap = typeof import('expo-iap');

/**
 * The App Store module, or null where there isn't one (Expo Go, which doesn't include it). Loaded lazily, so the
 * app still runs there.
 */
let iapModule: Iap | null | undefined;
function iap(): Iap | null {
  if (iapModule !== undefined) return iapModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    iapModule = Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? null : (require('expo-iap') as Iap);
  } catch {
    iapModule = null;
  }
  return iapModule;
}

/**
 * FOR TESTING ONLY, AND IT MUST BE TURNED OFF BEFORE ANY APP STORE SUBMISSION (App Review rejected 1.2.0 for a
 * tester switch): `extra.testerSwitch` in app.json shows a switch in About, to act as free or as Pro without buying.
 * Every EAS build fails while it's on (scripts/no-tester-switch.mjs), so it never reaches a store build.
 */
export const TESTER_BUILD = !!(Constants.expoConfig?.extra as { testerSwitch?: boolean } | undefined)?.testerSwitch;

/** The tester switch: acting as free or as Pro. */
export type ProOverride = 'free' | 'pro';

export interface ProState {
  /** Bought (or restored) on this Apple Account. */
  owned: boolean;
  /** Pro's price, as the App Store shows it here (e.g. "$4.99"), once it's known. */
  price: string | null;
  /** The App Store can be used here (not Expo Go). */
  available: boolean;
  /** A purchase or restore is under way. */
  busy: boolean;
  /** The tester switch (only while TESTER_BUILD): acting as free or as Pro, or (null) as the purchase says. */
  override: ProOverride | null;
}

let state: ProState = {
  owned: !!loadSettings().proOwned,
  price: null,
  available: true,
  busy: false,
  override: TESTER_BUILD ? (loadSettings().proOverride ?? null) : null,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<ProState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Whether Pro is on: bought (or restored). Where there's no App Store at all (Expo Go, in development), everything's open. */
export function isPro(s: ProState = state): boolean {
  if (TESTER_BUILD && s.override) return s.override === 'pro';
  return s.owned || !s.available;
}

/** The tester switch (only while TESTER_BUILD): act as free, as Pro, or (null) as the purchase says. */
export function setProOverride(override: ProOverride | null) {
  if (!TESTER_BUILD) return;
  const { proOverride: _old, ...rest } = loadSettings();
  saveSettings(override ? { ...rest, proOverride: override } : rest);
  set({ override });
}

/** Pro's state, redrawing as it changes. */
export const useProState = () => useSyncExternalStore(subscribe, () => state);
/** Whether Pro is on, redrawing as it changes. */
export const usePro = () => isPro(useProState());

const setOwned = (owned: boolean) => {
  if (owned === state.owned) return;
  saveSettings({ ...loadSettings(), proOwned: owned });
  set({ owned });
};

let started = false;

/**
 * Connects to the App Store once, as the app opens: listens for purchases, looks up Pro's price, and checks whether
 * it's owned.
 */
export async function startPro() {
  if (started) return;
  started = true;
  const m = iap();
  if (!m) {
    set({ available: false });
    return;
  }
  try {
    await m.initConnection();
  } catch (e) {
    console.warn('App Store connection failed', e);
    return;
  }
  m.purchaseUpdatedListener((purchase) => {
    if (purchase.productId !== PRO_PRODUCT_ID) return;
    if (purchase.purchaseState === 'purchased') {
      setOwned(true);
      m.finishTransaction({ purchase, isConsumable: false }).catch((e) => console.warn('finishTransaction failed', e));
      if (state.busy) Alert.alert('Welcome to Shufflevale Pro', 'Unlimited cards, deck files and every component are yours. Thank you!');
    }
    set({ busy: false });
  });
  m.purchaseErrorListener((error) => {
    set({ busy: false });
    if (error.code === m.ErrorCode.UserCancelled) return;
    // Bought before (on this Apple Account): it's theirs, so it's restored.
    if (error.code === m.ErrorCode.AlreadyOwned) {
      void restorePro();
      return;
    }
    Alert.alert('Purchase didn’t go through', error.message || 'Please try again in a moment.');
  });
  const [products, purchases] = await Promise.allSettled([m.fetchProducts({ skus: [PRO_PRODUCT_ID], type: 'in-app' }), m.getAvailablePurchases()]);
  if (products.status === 'fulfilled') {
    const product = (products.value ?? []).find((p) => p.id === PRO_PRODUCT_ID);
    if (product) set({ price: product.displayPrice });
  }
  // What the App Store says now (a refund takes Pro away again).
  if (purchases.status === 'fulfilled') setOwned(purchases.value.some((p) => p.productId === PRO_PRODUCT_ID));
}

/**
 * The table's components that are part of Pro: what's made with the player's own pictures (custom art, a token with
 * a picture, a die or coin with faces of its own). Every other component is free, for playing alongside a game.
 */
export const isProPiece = (p: Pick<TablePiece, 'kind' | 'image' | 'faces'>) =>
  p.kind === 'art' || (p.kind === 'token' && !!p.image) || !!p.faces?.some(Boolean);

/**
 * The Playground example (see examples.ts): the one table where Pro's components can be tried without it. Known by
 * its id, so renaming it changes nothing (and a copy of it isn't it).
 */
export const isPlayground = (tableId: string) => loadSettings().playgroundTableId === tableId;

/**
 * A short fingerprint of how a deck looks (its back, shape, and each card's picture, own back and copies). Noted
 * for the Playing Cards example as it's made, so the Playground can tell if it's been changed into a deck of
 * someone's own (whose cards, without Pro, don't play there).
 */
export function deckLook(deck: Deck): string {
  const text = [deck.backImage ?? '', deck.cardShape ?? '', ...deck.cards.map((c) => `${c.id}|${c.image}|${c.back ?? ''}|${copiesOf(c)}`)].join(';');
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${deck.cards.length}:${h.toString(36)}`;
}

/** How many cards the walkthrough's sample deck comes with (see sampleDeck.ts). */
const SAMPLE_CARDS = 12;
/** How many cards the Playing Cards example comes with. */
const PLAYING_CARDS = 52;

/**
 * The app's own example decks (Playing Cards, the walkthrough's sample), with how many of their cards are the app's
 * own: those don't count toward the free limit (cards added to them do).
 */
export function exampleAllowances(): Map<string, number> {
  const s = loadSettings();
  const out = new Map<string, number>();
  if (s.playingCardsDeckId) out.set(s.playingCardsDeckId, PLAYING_CARDS);
  if (s.sampleDeckId) out.set(s.sampleDeckId, SAMPLE_CARDS);
  return out;
}

/** Opens Apple's purchase sheet for Pro. The result arrives through the listeners in `startPro`. */
export async function buyPro() {
  const m = iap();
  if (!m || state.busy) return;
  set({ busy: true });
  try {
    await m.requestPurchase({ request: { apple: { sku: PRO_PRODUCT_ID } }, type: 'in-app' });
  } catch (e) {
    set({ busy: false });
    console.warn('requestPurchase failed', e);
  }
}

/** Looks for Pro on this Apple Account (e.g. on a new phone). Says how it went. */
export async function restorePro(): Promise<boolean> {
  const m = iap();
  if (!m) return false;
  set({ busy: true });
  try {
    await m.restorePurchases();
    const owned = (await m.getAvailablePurchases()).some((p) => p.productId === PRO_PRODUCT_ID);
    setOwned(owned);
    Alert.alert(
      owned ? 'Pro restored' : 'No purchase found',
      owned
        ? 'Shufflevale Pro is unlocked again. Thank you!'
        : 'Shufflevale Pro hasn’t been bought with this Apple Account. If you bought it with another one, sign in with it in Settings.',
    );
    return owned;
  } catch (e) {
    Alert.alert('Couldn’t restore', e instanceof Error ? e.message : 'Please try again in a moment.');
    return false;
  } finally {
    set({ busy: false });
  }
}
