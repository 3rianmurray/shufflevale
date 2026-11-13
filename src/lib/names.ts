// Names the player types (decks, cards, groups, tables, hands, sessions), kept just as they're typed, and the app's
// own prompt for asking for one.
import { useSyncExternalStore } from 'react';

/** The longest a name can be (decks, cards, groups, tables, hands, sessions): plenty, and it still fits on screen. */
export const MAX_NAME_LENGTH = 60;

/** A name kept to `MAX_NAME_LENGTH`, trimmed. */
export const clampName = (name: string) => name.trim().slice(0, MAX_NAME_LENGTH).trim();

/**
 * What's being asked for: words (a name, kept as typed); a whole number (`number`, or `signed` if it can
 * be below 0); or a time (minutes, or minutes:seconds). Each brings up the keyboard it wants.
 */
export type AskKind = 'name' | 'number' | 'signed' | 'time';

/** A name being asked for: the prompt's title, the name it starts with, and what's done with the new one. */
export interface NameRequest {
  title: string;
  current: string;
  done: (name: string) => void;
  kind?: AskKind;
  /** Words on a table (a zone's name, a text label) rather than a name: the empty field says Text, not Name. */
  plain?: boolean;
  /** What the yellow button says, if not Save (say, Paste for how many copies to paste). */
  confirm?: string;
  /**
   * Where on screen (its middle, down from the top) the thing being changed was, so the prompt's field opens right
   * there and the eye doesn't have to go looking for it. Otherwise the prompt sits at its usual place.
   */
  at?: number;
}

let request: NameRequest | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const set = (next: NameRequest | null) => {
  request = next;
  listeners.forEach((l) => l());
};

/** Asks for a name (see NamePrompt); `done` gets it trimmed, and only if it isn't empty. */
export function askName(title: string, current: string, done: (name: string) => void) {
  set({ title, current, done });
}

/** Asks for words just as they're typed (the words on a table: see NameRequest's `plain`); otherwise as `askName`. */
export function askText(title: string, current: string, done: (text: string) => void) {
  set({ title, current, done, plain: true });
}

/**
 * Asks for a number (or a time) the same way, with the number keyboard (see AskKind), the button's words, and where
 * the field opens (see NameRequest).
 */
export function askNumber(title: string, current: string, done: (text: string) => void, kind: Exclude<AskKind, 'name'> = 'number', confirm?: string, at?: number) {
  set({ title, current, done, kind, confirm, at });
}

/** Closes the prompt (with the name it gives, if any). */
export function answerName(name: string | null) {
  const asked = request;
  set(null);
  const trimmed = name ? clampName(name) : undefined;
  if (asked && trimmed) asked.done(trimmed);
}

export const useNameRequest = () => useSyncExternalStore(subscribe, () => request);
