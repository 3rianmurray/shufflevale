import { useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback } from 'react';
import { Platform } from 'react-native';

/**
 * iPhone holds portrait everywhere except a table (see sandbox/[id]), which turns to landscape. The app allows both
 * landscapes in its native config so a table can use them; this locks the rest back to portrait. An iPad turns freely.
 */
const PHONE = Platform.OS === 'ios' && !Platform.isPad;

export function lockPhonePortrait() {
  if (!PHONE) return;
  void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
}

export function unlockPhone() {
  if (!PHONE) return;
  void ScreenOrientation.unlockAsync().catch(() => {});
}

/** Lets the screen turn to landscape while it's focused, and holds it portrait again once something is pushed over it. */
export function useTurnableScreen() {
  useFocusEffect(
    useCallback(() => {
      unlockPhone();
      return () => lockPhonePortrait();
    }, []),
  );
}
