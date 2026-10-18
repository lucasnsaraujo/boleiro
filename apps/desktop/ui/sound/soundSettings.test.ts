import { expect, test } from "vitest";
import { DEFAULT_SOUND, loadSoundSettings, saveSoundSettings, volumeOf } from "./soundSettings.js";

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

test("the crowd and the interface follow the effects volume until the player sets their own, which is kept", () => {
  const store = memoryStore();
  saveSoundSettings(store, { music: 0.5, sfx: 0.4, isMuted: false });
  expect(volumeOf(loadSoundSettings(store), "crowd")).toBe(0.4);
  expect(volumeOf(loadSoundSettings(store), "ui")).toBe(0.4);
  saveSoundSettings(store, { music: 0.5, sfx: 0.4, crowd: 0.9, ui: 0, isMuted: false });
  const saved = loadSoundSettings(store);
  expect([volumeOf(saved, "music"), volumeOf(saved, "sfx"), volumeOf(saved, "crowd"), volumeOf(saved, "ui")]).toEqual([0.5, 0.4, 0.9, 0]);
  expect(loadSoundSettings(memoryStore({ "boleiro.sound": JSON.stringify({ crowd: "loud", ui: 3 }) }))).toEqual({ ...DEFAULT_SOUND, ui: 1 });
});
