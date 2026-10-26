import { useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

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

/**
 * On an iPhone turned on its side, the side away from its notch: where a table's hand stands. iOS gives both sides
 * the same margin, so it's read from which way the phone is turned. Turned left (its top, with the notch, to the
 * right) the hand goes on the left; turned right, on the right.
 */
export function useSideAwayFromNotch(active: boolean): 'left' | 'right' {
  const [side, setSide] = useState<'left' | 'right'>('right');
  // Asked again whenever the screen changes shape, in case the turn itself went unreported.
  const { width, height } = useWindowDimensions();
  useEffect(() => {
    if (!PHONE || !active) return;
    const apply = (o: ScreenOrientation.Orientation) => {
      if (o === ScreenOrientation.Orientation.LANDSCAPE_LEFT) setSide('left');
      else if (o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT) setSide('right');
    };
    ScreenOrientation.getOrientationAsync().then(apply, () => {});
    const sub = ScreenOrientation.addOrientationChangeListener((e) => apply(e.orientationInfo.orientation));
    return () => sub.remove();
  }, [active, width, height]);
  return side;
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
