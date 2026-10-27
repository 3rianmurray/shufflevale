/**
 * Tester builds only (the tester switch: see TESTER_BUILD): a roll, logged frame by frame, to find where a die is
 * drawn as it starts to roll. The first die of each roll is watched: each time it's drawn (where it lies, its roll,
 * whether it's landed, how far back it sets off from), and where it actually is on screen, frame by frame, from
 * just before the roll till a moment in. Shown over the table (see RollDebugOverlay). Never in a store build.
 */
import { useSyncExternalStore } from 'react';
import type { View } from 'react-native';

import { TESTER_BUILD } from './pro';

export const ROLL_DEBUG = TESTER_BUILD;

/** How many frames it's watched on screen, and how many lines are kept. */
const FRAMES = 24;
const MAX_LINES = 40;

let lines: string[] = [];
let watching: string | null = null;
let started = 0;
const views = new Map<string, View>();
const listeners = new Set<() => void>();
// (Told after the drawing that logged it, never during it.)
let telling = false;
const tell = () => {
  if (telling) return;
  telling = true;
  setTimeout(() => {
    telling = false;
    listeners.forEach((l) => l());
  }, 0);
};

/** A line for the die being watched (any other's are left out). */
export function rollLog(id: string, text: string) {
  if (!ROLL_DEBUG || id !== watching) return;
  lines = [...lines, `${String(Date.now() - started).padStart(4)}ms ${text}`].slice(-MAX_LINES);
  tell();
}

/** A die's view, to find where it is on screen (kept for every die, so it's there the moment it's rolled). */
export function rollView(id: string, view: View | null) {
  if (!ROLL_DEBUG) return;
  if (view) views.set(id, view);
  else views.delete(id);
}

/** A roll starting: its first die watched afresh, and where it is on screen sampled every frame for a while. */
export function watchRoll(id: string) {
  if (!ROLL_DEBUG) return;
  watching = id;
  started = Date.now();
  lines = [];
  rollLog(id, `roll ${id.slice(-4)}`);
  let frame = 0;
  const sample = () => {
    if (watching !== id || frame >= FRAMES) return;
    const n = frame++;
    views.get(id)?.measureInWindow((x, y) => rollLog(id, `frame ${n}: on screen ${Math.round(x)}, ${Math.round(y)}`));
    requestAnimationFrame(sample);
  };
  sample();
}

/** Done looking: the lines go. */
export function clearRollLog() {
  lines = [];
  watching = null;
  tell();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
/** The lines so far. */
export const useRollLog = () => useSyncExternalStore(subscribe, () => lines);
