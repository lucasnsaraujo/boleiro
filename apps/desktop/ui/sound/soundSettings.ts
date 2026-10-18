/** What the player can turn up or down on its own: the music, the effects, the crowd under the live round and the clicks of the interface. */
export type Category = "music" | "sfx" | "crowd" | "ui";

/**
 * The player's sound choices: each category's volume from 0 to 1, and a mute over all of them. The crowd
 * and the interface follow the effects until the player sets them (and in settings saved before they had their own).
 */
export type SoundSettings = { music: number; sfx: number; crowd?: number; ui?: number; isMuted: boolean };

export const DEFAULT_SOUND: SoundSettings = { music: 0.6, sfx: 0.8, isMuted: false };
const KEY = "boleiro.sound";

type Store = Pick<Storage, "getItem" | "setItem">;

const volume = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null);

/** How loud a category is set, from 0 to 1, before the mute. */
export function volumeOf(settings: SoundSettings, category: Category): number {
  if (category === "crowd" || category === "ui") return settings[category] ?? settings.sfx;
  return settings[category];
}

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
  const crowd = volume(fields.get("crowd"));
  const ui = volume(fields.get("ui"));
  return {
    music: volume(fields.get("music")) ?? DEFAULT_SOUND.music,
    sfx: volume(fields.get("sfx")) ?? DEFAULT_SOUND.sfx,
    ...(crowd === null ? {} : { crowd }),
    ...(ui === null ? {} : { ui }),
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
