import { expect, test } from "vitest";
import { DEFAULT_SOUND, loadSoundSettings, saveSoundSettings } from "./soundSettings.js";

function memoryStore(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) };
}

test("saved sound choices come back as they were saved", () => {
  const store = memoryStore();
  saveSoundSettings(store, { music: 0.25, sfx: 1, isMuted: true });
  expect(loadSoundSettings(store)).toEqual({ music: 0.25, sfx: 1, isMuted: true });
});

test("with nothing saved, or something broken, the defaults apply field by field", () => {
  expect(loadSoundSettings(memoryStore())).toEqual(DEFAULT_SOUND);
  expect(loadSoundSettings(memoryStore({ "boleiro.sound": "{oops" }))).toEqual(DEFAULT_SOUND);
  expect(loadSoundSettings(memoryStore({ "boleiro.sound": JSON.stringify({ music: 7, sfx: "loud", isMuted: 1 }) }))).toEqual({ ...DEFAULT_SOUND, music: 1 });
});

test("a storage that refuses to save doesn't break the game", () => {
  const full = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
  expect(() => saveSoundSettings(full, DEFAULT_SOUND)).not.toThrow();
});
