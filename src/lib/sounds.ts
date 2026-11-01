import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { loadSettings, saveSettings } from './storage';

/** The table's sound effects (swap a file in assets/sounds, keeping its name, to change one). */
const sources = {
  cardFlip: require('../../assets/sounds/card-flip.mp3'),
  shuffle: require('../../assets/sounds/shuffle.mp3'),
  dieRoll: require('../../assets/sounds/die-roll.mp3'),
  diceRoll: require('../../assets/sounds/dice-roll.mp3'),
  coinFlip: require('../../assets/sounds/coin-flip.mp3'),
  counterClick: require('../../assets/sounds/counter-click.wav'),
  timerStart: require('../../assets/sounds/timer-start.wav'),
  timerEnd: require('../../assets/sounds/timer-end.wav'),
};
const VOLUME: Partial<Record<Sound, number>> = { cardFlip: 0.2, counterClick: 0.3, timerStart: 0.6, timerEnd: 0.6 };

type Sound = keyof typeof sources;
type Player = ReturnType<typeof createAudioPlayer>;

/** Players for each sound, taken in turn, so a sound played again while it's still playing (or rewinding) still plays. */
const VOICES = 3;
const voices = new Map<Sound, Player[]>();
const nextVoice = new Map<Sound, number>();

// Quiet with the phone's silent switch on, and played over the player's own music rather than stopping it.
void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});

function voicesOf(sound: Sound): Player[] {
  let list = voices.get(sound);
  if (!list) {
    list = [];
    for (let i = 0; i < VOICES; i++) {
      try {
        // Audio stays on between sounds: switched off as one ended, the next one started that moment went unheard.
        const player = createAudioPlayer(sources[sound], { keepAudioSessionActive: true });
        player.volume = VOLUME[sound] ?? 1;
        list.push(player);
      } catch {
        // No audio: the table carries on silently.
      }
    }
    voices.set(sound, list);
  }
  return list;
}

// Each sound's players made now, loaded and ready, rather than on its first tap (which then came late or not at all).
for (const sound of Object.keys(sources) as Sound[]) voicesOf(sound);

let off = loadSettings().soundsOff ?? false;

export const soundsOn = () => !off;

export function setSoundsOn(on: boolean) {
  off = !on;
  saveSettings({ ...loadSettings(), soundsOff: off });
}

/** Plays a short bundled effect, quietly doing nothing if it can't: audio never gets in the way of the table. */
export function playSound(sound: Sound) {
  if (off) return;
  const list = voicesOf(sound);
  if (!list.length) return;
  // An idle player if there is one, otherwise the one whose turn it is.
  const turn = nextVoice.get(sound) ?? 0;
  const at = list.findIndex((p, k) => !list[(turn + k) % list.length].playing);
  const i = (turn + Math.max(0, at)) % list.length;
  nextVoice.set(sound, (i + 1) % list.length);
  const player = list[i];
  try {
    if (player.playing) player.pause();
    // Once it's played, rewound first: a player left at its end plays nothing.
    if (player.currentTime > 0) {
      player
        .seekTo(0)
        .then(() => player.play())
        .catch(() => {});
    } else player.play();
  } catch {
    // As above.
  }
}
