import type { GameState } from "@boleiro/engine/sim/gameState";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { expect, test } from "vitest";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { matchPageOf } from "./matchPageOf.js";

const CLUB = "flamengo-rj";
const fresh = newGameFromFiles(4, { coachClubId: CLUB }, bundledGameFiles);
const [ours, theirs] = fresh.fixtures.filter((f) => f.homeId === CLUB || f.awayId === CLUB);

/** The game with the club's first two matches over, 1–0 each. */
function played(): GameState {
  const done = new Set([ours?.id, theirs?.id]);
  return { ...fresh, fixtures: fresh.fixtures.map((f) => (done.has(f.id) ? { ...f, result: { homeGoals: 1, awayGoals: 0 } } : f)) };
}

test("a played match's page tapes the eggs the book wrote down for it, and another match's page doesn't", () => {
  if (!ours || !theirs) throw new Error("the club has matches");
  const find = { eggId: "olympic-goal", date: ours.date, clubId: CLUB, fixtureId: ours.id, headline: "Gol olímpico de Pedro" };
  const booked: GameState = { ...played(), eggs: { log: [find] } };
  expect(matchPageOf(booked, ours.id, null)?.eggs).toContainEqual({ eggId: "olympic-goal", title: "Gol olímpico", rarity: "rare", look: "sticker", text: "Gol olímpico de Pedro" });
  expect(matchPageOf(booked, theirs.id, null)?.eggs.some((note) => note.eggId === "olympic-goal")).toBe(false);
});

test("a match told again from its seed tapes only the eggs the book wrote down, not ones its retelling would lay", () => {
  if (!ours) throw new Error("the club has matches");
  const seven = { ...played(), fixtures: fresh.fixtures.map((f) => (f.id === ours.id ? { ...f, result: { homeGoals: 7, awayGoals: 1 } } : f)) };
  expect(matchPageOf(seven, ours.id, null)?.eggs).toEqual([]);
});
