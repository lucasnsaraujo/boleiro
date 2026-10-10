/** The player's sound choices: music and effects volume from 0 to 1, and a mute over both. */
export type SoundSettings = { music: number; sfx: number; isMuted: boolean };

export const DEFAULT_SOUND: SoundSettings = { music: 0.6, sfx: 0.8, isMuted: false };
const KEY = "boleiro.sound";

type Store = Pick<Storage, "getItem" | "setItem">;

const volume = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback);

/** The saved choices, or the defaults for anything missing or broken. */
export function loadSoundSettings(store: Store): SoundSettings {
  let saved: unknown;
  try {
    saved = JSON.parse(store.getItem(KEY) ?? "null");
  } catch {
    return DEFAULT_SOUND;
  }
  if (typeof saved !== "object" || saved === null) return DEFAULT_SOUND;
  const fields = new Map(Object.entries(saved));
  const isMuted = fields.get("isMuted");
  return {
    music: volume(fields.get("music"), DEFAULT_SOUND.music),
    sfx: volume(fields.get("sfx"), DEFAULT_SOUND.sfx),
    isMuted: typeof isMuted === "boolean" ? isMuted : DEFAULT_SOUND.isMuted,
  };
}

export function saveSoundSettings(store: Store, settings: SoundSettings): void {
  try {
    store.setItem(KEY, JSON.stringify(settings));
  } catch {
    return;
  }
}
