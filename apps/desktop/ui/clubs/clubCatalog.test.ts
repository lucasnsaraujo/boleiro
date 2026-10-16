import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { CLUBS, clubById, clubFaceOf, crestUrlOf, initialsOf, plateColours } from "./clubCatalog.js";

test("a club is found by id with its name, state and division", () => {
  expect(clubById("bahia-ba")).toMatchObject({ shortName: "Bahia", state: "BA", division: "A" });
  expect(clubById("nobody")).toBeNull();
});

test("every club with a crest file gets an image url, others get none", () => {
  const bahiaCrest = createHash("sha256").update(readFileSync(join(import.meta.dirname, "../../../../assets/crests/10010.png"))).digest("hex").slice(0, 16);
  expect(crestUrlOf("bahia-ba")).toMatch(new RegExp(`${bahiaCrest}-64.*\\.webp$`));
  expect(crestUrlOf("nobody")).toBeNull();
});

test("a South American club the game plays result-only has its pack name, colours and a 128 px crest at most", () => {
  expect(clubFaceOf({}, "tm-209")).toEqual({ id: "tm-209", shortName: "CA River Plate", colours: { primary: "#FFFFFF", secondary: "#FF0000" }, stadium: "Mâs Monumental" });
  expect(crestUrlOf("tm-209", 64)).toMatch(/-64[^/]*\.webp$/);
  expect(crestUrlOf("tm-209", 256)).toMatch(/-128[^/]*\.webp$/);
});

test("a Brazilian club's face comes from the game's own clubs before the packs", () => {
  const bahia = { id: "bahia-ba", shortName: "Bahia renamed", colours: { primary: "#000000", secondary: "#FFFFFF" }, stadium: "Fonte Nova" };
  expect(clubFaceOf({ "bahia-ba": bahia }, "bahia-ba")).toBe(bahia);
  expect(clubFaceOf({}, "nobody")).toBeNull();
});

test("initials take the first letters of a multi-word name and the first three of a single word", () => {
  expect(initialsOf("Bahia")).toBe("BAH");
  expect(initialsOf("São Paulo")).toBe("SP");
  expect(initialsOf("Atlético-MG")).toBe("AMG");
  expect(initialsOf("Red Bull Bragantino")).toBe("RBB");
});

test("plate text keeps the club's second colour when it reads well on the first", () => {
  expect(plateColours({ primary: "#1F3A93", secondary: "#FFFFFF" })).toEqual({ background: "#1F3A93", text: "#FFFFFF" });
});

test("plate text falls back to white or black when the club's second colour would be unreadable", () => {
  expect(plateColours({ primary: "#FFFFFF", secondary: "#FFEE00" })).toEqual({ background: "#FFFFFF", text: "#0a0a0a" });
  expect(plateColours({ primary: "#1F3A93", secondary: "#1F3A90" })).toEqual({ background: "#1F3A93", text: "#ffffff" });
});

/** WCAG 2 contrast ratio between two #rrggbb colours, worked out here so the plates are checked against the standard itself. */
function wcagContrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light = 0, dark = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

test("a red club whose second colour is yellow or white gets ink on its plate, the one that reads", () => {
  const jacuipense = clubById("jacuipense-ba")?.colours;
  const alagoinhas = clubById("alagoinhas-ba")?.colours;
  expect(jacuipense).toEqual({ primary: "#FF0000", secondary: "#FFFF00" });
  expect(alagoinhas).toEqual({ primary: "#FF0000", secondary: "#FFFFFF" });
  for (const colours of [jacuipense, alagoinhas]) {
    if (!colours) continue;
    const { background, text } = plateColours(colours);
    expect(background).toBe("#FF0000");
    expect(wcagContrast(background, text)).toBeGreaterThanOrEqual(4.5);
  }
});

test("every club in the pack has plate text that reaches 4.5:1 against its plate", () => {
  expect(CLUBS.length).toBeGreaterThan(100);
  const unreadable = CLUBS.map((club) => ({ id: club.id, ...plateColours(club.colours) })).filter(({ background, text }) => wcagContrast(background, text) < 4.5);
  expect(unreadable).toEqual([]);
});

test("a Club World Cup guest from a country without a league in the game has its pack name and a crest", () => {
  expect(clubFaceOf({}, "tm-11391")?.shortName).toBe("Auckland City FC");
  expect(crestUrlOf("tm-11391", 64)).toMatch(/-64[^/]*\.webp$/);
});
