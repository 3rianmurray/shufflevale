// Shufflevale Pro: a one-time purchase from the App Store (StoreKit, through expo-iap), which takes away the free
// version's card limit, adds sharing and backing up deck files (opening one is free), and adds what's made with the
// player's own pictures on the table: custom art, custom tokens, and dice and coins' own faces (see isProPiece). Owning
// it is remembered on the phone, so it works offline; the App Store is asked again each time the app opens (which
// also catches a refund). The purchase is the only way in.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';

import type { TablePiece } from './sandbox';
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

export interface ProState {
  /** Bought (or restored) on this Apple Account. */
  owned: boolean;
  /** Pro's price, as the App Store shows it here (e.g. "$4.99"), once it's known. */
  price: string | null;
  /** The App Store can be used here (not Expo Go). */
  available: boolean;
  /** A purchase or restore is under way. */
  busy: boolean;
}

let state: ProState = {
  owned: !!loadSettings().proOwned,
  price: null,
  available: true,
  busy: false,
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
  return s.owned || !s.available;
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
/** Connected to the App Store (with the purchase listeners on), or connecting. */
let connected = false;
let connecting: Promise<boolean> | null = null;
/** A purchase from Unlock Pro is under way: its result (success, failure or cancel) is told once, by whichever hears first. */
let purchasing = false;

/** A purchase that failed: said so, unless canceled; one already bought is restored instead. */
function purchaseFailed(m: Iap, code: string | undefined, message?: string) {
  if (!purchasing) return;
  purchasing = false;
  set({ busy: false });
  if (code === m.ErrorCode.UserCancelled) return;
  // Bought before (on this Apple Account): it's theirs, so it's restored.
  if (code === m.ErrorCode.AlreadyOwned) {
    void restorePro();
    return;
  }
  Alert.alert('Purchase didn’t go through', message || 'Please try again in a moment.');
}

/** Connects to the App Store and starts listening for purchases, once; tried again if it failed before. */
function connect(m: Iap): Promise<boolean> {
  if (connected) return Promise.resolve(true);
  if (connecting) return connecting;
  connecting = (async () => {
    try {
      await m.initConnection();
    } catch (e) {
      console.warn('App Store connection failed', e);
      return false;
    }
    m.purchaseUpdatedListener((purchase) => {
      if (purchase.productId !== PRO_PRODUCT_ID) return;
      if (purchase.purchaseState === 'purchased') {
        setOwned(true);
        m.finishTransaction({ purchase, isConsumable: false }).catch((e) => console.warn('finishTransaction failed', e));
        if (purchasing) Alert.alert('Welcome to Shufflevale Pro', 'Unlimited cards, deck files and every component are yours. Thank you!');
        purchasing = false;
      }
      set({ busy: false });
    });
    m.purchaseErrorListener((error) => purchaseFailed(m, error.code, error.message));
    connected = true;
    return true;
  })().finally(() => {
    connecting = null;
  });
  return connecting;
}

/** Looks up Pro's price on the App Store. Whether it was found. */
async function loadProduct(m: Iap): Promise<boolean> {
  try {
    const product = ((await m.fetchProducts({ skus: [PRO_PRODUCT_ID], type: 'in-app' })) ?? []).find((p) => p.id === PRO_PRODUCT_ID);
    if (product) set({ price: product.displayPrice });
    return !!product;
  } catch (e) {
    console.warn('Pro lookup failed', e);
    return false;
  }
}

/**
 * Connects to the App Store as the app opens: listens for purchases, looks up Pro's price, and checks whether it's
 * owned. Unlock Pro tries again if this didn't get through.
 */
export async function startPro() {
  if (started) return;
  started = true;
  const m = iap();
  if (!m) {
    set({ available: false });
    return;
  }
  if (!(await connect(m))) return;
  const [, purchases] = await Promise.allSettled([loadProduct(m), m.getAvailablePurchases()]);
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
 * The Playground example (see examples.ts): an ordinary table, but the one where its custom pieces' pictures (its
 * art's, tokens' and dice's faces) can be changed without Pro, to try what Pro does. Known by its id, so renaming it
 * changes nothing (and a copy of it isn't it).
 */
export const isPlayground = (tableId: string) => loadSettings().playgroundTableId === tableId;

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

/**
 * Opens Apple's purchase sheet for Pro, connecting to the App Store first if that hadn't worked yet. The result
 * arrives through the listeners in `connect`; if the App Store can't be reached, it says so.
 */
export async function buyPro() {
  const m = iap();
  if (!m || state.busy) return;
  set({ busy: true });
  const ready = (await connect(m)) && (state.price !== null || (await loadProduct(m)));
  if (!ready) {
    set({ busy: false });
    Alert.alert('Couldn’t reach the App Store', 'Please try again in a moment.');
    return;
  }
  purchasing = true;
  try {
    await m.requestPurchase({ request: { apple: { sku: PRO_PRODUCT_ID } }, type: 'in-app' });
  } catch (e) {
    console.warn('requestPurchase failed', e);
    const err = e as { code?: string; message?: string };
    purchaseFailed(m, err?.code, err?.message);
  }
}

/** Looks for Pro on this Apple Account (e.g. on a new phone). Says how it went. */
export async function restorePro(): Promise<boolean> {
  const m = iap();
  if (!m) return false;
  set({ busy: true });
  try {
    if (!(await connect(m))) throw new Error('Couldn’t reach the App Store. Please try again in a moment.');
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
