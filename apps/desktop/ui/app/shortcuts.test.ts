import { expect, test } from "vitest";
import { commandForKey, shortcutKeys } from "./shortcuts.js";

const press = (key: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

test("the F-keys open the bar's screens in Brasfoot's order", () => {
  expect(["F1", "F2", "F5", "F6", "F7", "F8", "F9"].map((key) => commandForKey(press(key), "mac"))).toEqual([
    "agenda",
    "tabelas",
    "times",
    "busca",
    "tecnicos",
    "historico",
    "opcoes",
  ]);
});

test("E plays the round and M mutes, in either case, but not with a modifier held", () => {
  expect(commandForKey(press("e"), "mac")).toBe("jogarRodada");
  expect(commandForKey(press("M", { shiftKey: true }), "windows")).toBe("mudo");
  expect(commandForKey(press("e", { metaKey: true }), "mac")).toBeNull();
  expect(commandForKey(press("m", { altKey: true }), "windows")).toBeNull();
});

test("saving is Command-S on a Mac and Ctrl-S elsewhere", () => {
  expect(commandForKey(press("s", { metaKey: true }), "mac")).toBe("salvar");
  expect(commandForKey(press("s", { ctrlKey: true }), "mac")).toBeNull();
  expect(commandForKey(press("s", { ctrlKey: true }), "windows")).toBe("salvar");
  expect(commandForKey(press("s"), "windows")).toBeNull();
});

test("keys with no command do nothing", () => {
  expect(commandForKey(press("F12"), "mac")).toBeNull();
  expect(commandForKey(press("x"), "mac")).toBeNull();
});

test("the shortcut sheet names each key the way the platform's keyboard prints it", () => {
  expect(shortcutKeys("salvar", "mac")).toEqual(["⌘", "S"]);
  expect(shortcutKeys("salvar", "windows")).toEqual(["Ctrl", "S"]);
  expect(shortcutKeys("tabelas", "windows")).toEqual(["F2"]);
});
