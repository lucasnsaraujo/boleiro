import { expect, test } from "vitest";
import type { Competition, Fixture } from "@boleiro/engine/sim/gameState";
import { competitionKeyName, competitionName, fixtureLabel } from "./competitionName.js";

const base = { season: 2026, clubIds: [], stageDates: [], drawOrder: [] };

const serieA: Competition = {
  ...base,
  id: "serie-a-2026",
  kind: "league",
  format: "serie-a",
  division: "A",
  stages: [{ kind: "groups", groups: [], legs: 2, dates: ["2026-01-28", "2026-02-01", "2026-02-04"] }],
};
const paulista: Competition = { ...base, id: "state-sp-2026", kind: "state", state: "SP", stages: [] };
const copa: Competition = {
  ...base,
  id: "copa-do-brasil-2026",
  kind: "cup",
  entries: [],
  stages: [{ kind: "knockout", ties: [], dates: ["2026-02-18"] }],
};

function fixture(competition: Competition, date: string): Fixture {
  return { id: "f1", competitionId: competition.id, stage: 0, date, homeId: "a", awayId: "b", result: null };
}

test("each kind of competition gets the name a fan uses", () => {
  expect(competitionName(serieA)).toBe("Série A");
  expect(competitionName(paulista)).toBe("Paulista");
  expect(competitionName({ ...paulista, state: "RJ" })).toBe("Carioca");
  expect(competitionName(copa)).toBe("Copa do Brasil");
});

test("a round-robin game says which round it is", () => {
  expect(fixtureLabel(serieA, fixture(serieA, "2026-02-04"))).toBe("Série A · 3ª rodada");
});

test("a knockout game only names the competition", () => {
  expect(fixtureLabel(copa, fixture(copa, "2026-02-18"))).toBe("Copa do Brasil");
});

test("a competition kept in the history is named the way the fan says it", () => {
  expect(["serie-a", "serie-d", "copa-do-brasil", "state-sp", "state-rs"].map(competitionKeyName)).toEqual(["Série A", "Série D", "Copa do Brasil", "Paulista", "Gaúcho"]);
});
