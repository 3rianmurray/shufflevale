import { createAudioPlayer, preload, setAudioModeAsync } from 'expo-audio';

/** The table's sound effects (swap a file in assets/sounds, keeping its name, to change one). */
const sources = {
  cardFlip: require('../../assets/sounds/card-flip.mp3'),
  shuffle: require('../../assets/sounds/shuffle.mp3'),
  dieRoll: require('../../assets/sounds/die-roll.mp3'),
  diceRoll: require('../../assets/sounds/dice-roll.mp3'),
  coinFlip: require('../../assets/sounds/coin-flip.mp3'),
};

type Sound = keyof typeof sources;
type Player = ReturnType<typeof createAudioPlayer>;
const players = new Map<Sound, Promise<Player>>();
const queued = new Map<Sound, number>();
const playing = new Set<Sound>();

// Quiet with the phone's silent switch on, and played over the player's own music rather than stopping it.
void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});

// Start loading the short bundled effects as soon as this module is imported, instead of on the first tap.
const preloads = new Map<Sound, Promise<void>>();
for (const sound of Object.keys(sources) as Sound[]) {
  preloads.set(sound, preload(sources[sound]).catch(() => {}));
}

function loadPlayer(sound: Sound): Promise<Player> {
  let pending = players.get(sound);
  if (pending) return pending;

  pending = (async () => {
    await preloads.get(sound);
    const player = createAudioPlayer(sources[sound]);
    if (sound === 'cardFlip') player.volume = 0.3;
    if (!player.isLoaded) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          subscription.remove();
          reject(new Error('Timed out loading sound effect'));
        }, 10_000);
        const subscription = player.addListener('playbackStatusUpdate', (status) => {
          if (status.isLoaded) {
            clearTimeout(timeout);
            subscription.remove();
            resolve();
          } else if (status.error) {
            clearTimeout(timeout);
            subscription.remove();
            reject(new Error(status.error));
          }
        });
      });
    }
    return player;
  })();
  players.set(sound, pending);
  void pending.catch(() => players.delete(sound));
  return pending;
}

async function playQueued(sound: Sound) {
  if (playing.has(sound)) return;
  playing.add(sound);
  try {
    const player = await loadPlayer(sound);
    while ((queued.get(sound) ?? 0) > 0) {
      queued.set(sound, (queued.get(sound) ?? 1) - 1);
      player.pause();
      // seekTo is asynchronous: wait for the rewind before starting playback again.
      await player.seekTo(0);
      player.play();
    }
  } catch {
    // Placeholder files or unavailable audio devices should not interrupt gameplay.
    queued.set(sound, 0);
  } finally {
    playing.delete(sound);
    if ((queued.get(sound) ?? 0) > 0) void playQueued(sound);
  }
}

/** Plays a short bundled effect. Fail quietly so audio never interrupts a table action. */
export function playSound(sound: Sound) {
  queued.set(sound, (queued.get(sound) ?? 0) + 1);
  void playQueued(sound);
}
