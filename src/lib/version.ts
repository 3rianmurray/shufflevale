// Which version of the app is running: the app's own version, as people know it, and (once an over-the-air update is
// running) which update, since the version is the same for every update to a build.
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * The running version, as the About screen shows it: "Version 2.5.0", and under it the update's short id (e.g.
 * "Update 4afdef") once an over-the-air update is running; nothing there for the code the build shipped with.
 * (The id's last characters: its first ones are the time it was made, so updates days apart all began the same.)
 */
export function versionLines(): { version: string; update: string | null } {
  const version = `Version ${Constants.expoConfig?.version ?? '?'}`;
  if (__DEV__) return { version, update: 'Development' };
  if (Updates.isEmbeddedLaunch || !Updates.updateId) return { version, update: null };
  return { version, update: `Update ${Updates.updateId.replace(/-/g, '').slice(-6)}` };
}
