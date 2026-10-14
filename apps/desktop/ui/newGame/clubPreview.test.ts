import { beforeAll, expect, test } from "vitest";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { squadStrength } from "@boleiro/engine/sim/finances/squadStrength";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { clubPreviews, PREVIEW_KEYS, type ClubPreviews } from "./clubPreview.js";

let state: Pick<GameState, (typeof PREVIEW_KEYS)[number]>;
let previews: ClubPreviews;

beforeAll(async () => {
  const { engine, close } = inMemoryEngine();
  await engine.apply({ type: "newGame", seed: 3, choices: { coachClubId: null } });
  state = await engine.read(PREVIEW_KEYS);
  close();
  previews = clubPreviews(state);
}, 30_000);

const squadOf = (clubId: string) => Object.values(state.players).filter((p) => p.clubId === clubId);

test("a club's strength is the mean of its best eleven, rounded", () => {
  expect(previews["flamengo-rj"]?.strength).toBe(Math.round(squadStrength(squadOf("flamengo-rj"))));
});

test("each club is ranked by strength inside its own division, the strongest first", () => {
  const serieA = Object.entries(previews).filter(([id]) => state.clubs[id]?.division === "A");
  expect(serieA.map(([, preview]) => preview.rank).sort((a, b) => a - b)).toEqual(Array.from({ length: serieA.length }, (_, i) => i + 1));
  const first = serieA.find(([, preview]) => preview.rank === 1)?.[1];
  expect(serieA.every(([, preview]) => preview.strength <= (first?.strength ?? 0))).toBe(true);
});

test("the wage bill is the month's wages of the whole squad, and the cash is the club's", () => {
  expect(previews["bahia-ba"]?.monthlyWages).toBe(squadOf("bahia-ba").reduce((sum, p) => sum + p.wage, 0));
  expect(previews["bahia-ba"]?.cash).toBe(state.finances["bahia-ba"]?.cash);
});

test("the debut is the club's first fixture of the season", () => {
  const debut = previews["bahia-ba"]?.debut;
  const first = state.fixtures.filter((f) => f.homeId === "bahia-ba" || f.awayId === "bahia-ba").toSorted((a, b) => a.date.localeCompare(b.date))[0];
  expect(debut).toEqual({ date: first?.date, opponentId: first?.homeId === "bahia-ba" ? first.awayId : first?.homeId, isHome: first?.homeId === "bahia-ba" });
});
