// Saying the app's busy with something that takes a while (backing up, opening a big file), over every screen
// (see BusyOverlay), so it doesn't just look stuck.
import { useSyncExternalStore } from 'react';

let label: string | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const set = (next: string | null) => {
  label = next;
  listeners.forEach((l) => l());
};

/** Long enough for the overlay to be drawn before the work (which holds everything up) starts. */
const DRAW_MS = 80;

/** Runs `work` with "`text`…" shown over the screen, once that's on screen. */
export function whileBusy(text: string): <T>(work: () => T | Promise<T>) => Promise<T> {
  return async (work) => {
    set(text);
    try {
      await new Promise((resolve) => setTimeout(resolve, DRAW_MS));
      return await work();
    } finally {
      set(null);
    }
  };
}

export const useBusy = () => useSyncExternalStore(subscribe, () => label);
