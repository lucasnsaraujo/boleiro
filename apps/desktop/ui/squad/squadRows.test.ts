import { describe, expect, test } from "vitest";
import type { GameState, SimPlayer } from "@boleiro/engine/sim/gameState";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { valuePlayer } from "@boleiro/engine/sim/transfers/valuePlayer";
import { bundledGameFiles } from "@boleiro/game-client/engine/bundledGameFiles";
import { nextSort, sortedSquad, squadRows, statusText, type SquadRow } from "./squadRows.js";

const game = newGameFromFiles(7, { coachClubId: "bahia-ba" }, bundledGameFiles);
const squad = Object.values(game.players).filter((p) => p.clubId === "bahia-ba");
const [someone, other] = squad;
if (!someone || !other) throw new Error("Bahia needs players");

const withPlayer = (player: SimPlayer): GameState["players"] => ({ ...game.players, [player.id]: player });
const rowOf = (rows: readonly SquadRow[], id: string) => rows.find((row) => row.id === id);

describe("squadRows", () => {
  test("lists every player at the coach's club and nobody else", () => {
    const rows = squadRows(game);
    expect(rows.map((row) => row.id).sort()).toEqual(squad.map((p) => p.id).sort());
  });

  test("lists another club's squad when asked for it", () => {
    const palmeiras = Object.values(game.players).filter((p) => p.clubId === "palmeiras-sp");
    expect(palmeiras.length).toBeGreaterThan(0);
    expect(squadRows(game, "palmeiras-sp").map((row) => row.id).sort()).toEqual(palmeiras.map((p) => p.id).sort());
    expect(squadRows({ ...game, coachClubId: null }, "palmeiras-sp")).toHaveLength(palmeiras.length);
  });

  test("a coach without a club has no squad", () => {
    expect(squadRows({ ...game, coachClubId: null })).toEqual([]);
  });

  test("an injured player shows until when", () => {
    const hurt = { ...someone, condition: { ...someone.condition, injuredUntil: "2026-01-20" } };
    expect(rowOf(squadRows({ ...game, players: withPlayer(hurt) }), someone.id)?.status).toEqual({ kind: "injured", until: "2026-01-20" });
    expect(rowOf(squadRows({ ...game, date: "2026-01-20", players: withPlayer(hurt) }), someone.id)?.status).toBeNull();
  });

  test("a suspended player shows the competitions he is banned from", () => {
    const discipline = { "state-ba-2026": { [someone.id]: { yellows: 0, phase: 0, bans: 1 } }, "serie-a-2026": { [someone.id]: { yellows: 2, phase: 0, bans: 0 } } };
    expect(rowOf(squadRows({ ...game, discipline }), someone.id)?.status).toEqual({ kind: "suspended", competitions: ["Baiano"] });
  });

  test("a ban in a competition the club has no game left in no longer counts", () => {
    const discipline = { "copa-do-brasil-2026": { [someone.id]: { yellows: 0, phase: 0, bans: 1 } } };
    expect(game.fixtures.some((f) => f.competitionId === "copa-do-brasil-2026" && !f.result)).toBe(true);
    expect(rowOf(squadRows({ ...game, discipline }), someone.id)?.status).toBeNull();
  });

  test("a ban left over from a competition that is over no longer counts", () => {
    const discipline = { "state-ba-2026": { [someone.id]: { yellows: 0, phase: 0, bans: 1 } } };
    const fixtures = game.fixtures.map((f) => (f.competitionId === "state-ba-2026" ? { ...f, result: { homeGoals: 1, awayGoals: 0 } } : f));
    expect(rowOf(squadRows({ ...game, discipline, fixtures }), someone.id)?.status).toBeNull();
  });

  test("fatigue is today's, after the rest since the last match", () => {
    const tired = { ...someone, condition: { ...someone.condition, fatigue: 100, fatigueOn: "2026-01-01" } };
    const rows = (date: string) => squadRows({ ...game, date, players: withPlayer(tired) });
    expect(rowOf(rows("2026-01-01"), someone.id)?.fatigue).toBe(100);
    expect(rowOf(rows("2026-01-04"), someone.id)?.fatigue).toBe(25);
  });

  test("energy is what a match's fatigue leaves, from 100 when fresh down to 0", () => {
    const tired = { ...someone, condition: { ...someone.condition, fatigue: 140, fatigueOn: "2026-01-01" } };
    const rows = (date: string) => squadRows({ ...game, date, players: withPlayer(tired) });
    expect(rowOf(rows("2026-01-01"), someone.id)?.energy).toBe(0);
    expect(rowOf(rows("2026-01-04"), someone.id)?.energy).toBe(65);
    expect(rowOf(squadRows(game), other.id)?.energy).toBe(100);
  });

  test("a player's value is his market value at his club's division, in reais", () => {
    const expected = Math.round(valuePlayer(someone, "A", game.date) * game.market.eurBrl);
    expect(rowOf(squadRows(game), someone.id)?.value).toBe(expected);
  });

  test("goals add up every competition of this season", () => {
    const history = { ...game.history, current: { ...game.history.current, goals: { "state-ba": { [someone.id]: 2 }, "serie-a": { [someone.id]: 3, [other.id]: 1 } } } };
    expect(rowOf(squadRows({ ...game, history }), someone.id)?.goals).toBe(5);
    expect(rowOf(squadRows(game), someone.id)?.goals).toBe(0);
  });

  test("a contract that ends this season is flagged", () => {
    const leaving = { ...someone, contractUntil: "2026-12-31" };
    const staying = { ...other, contractUntil: "2027-12-31" };
    const rows = squadRows({ ...game, players: { ...withPlayer(leaving), [other.id]: staying } });
    expect(rowOf(rows, someone.id)?.isLastContractYear).toBe(true);
    expect(rowOf(rows, other.id)?.isLastContractYear).toBe(false);
  });
});

describe("sortedSquad", () => {
  const rows = squadRows(game);

  test("groups the squad by position, keepers first, strongest first within each group by default", () => {
    const groups = sortedSquad(rows, { key: "strength", descending: true });
    expect(groups.map((g) => g.group)).toEqual(["GK", "DEF", "MID", "ATT"]);
    for (const { group, rows: inGroup } of groups) {
      expect(inGroup.every((row) => row.group === group)).toBe(true);
      expect(inGroup.map((row) => row.strength)).toEqual(inGroup.map((row) => row.strength).toSorted((a, b) => b - a));
    }
    expect(groups.flatMap((g) => g.rows)).toHaveLength(rows.length);
  });

  test("sorts by any column within each group, either way", () => {
    for (const { rows: inGroup } of sortedSquad(rows, { key: "age", descending: false })) {
      expect(inGroup.map((row) => row.age)).toEqual(inGroup.map((row) => row.age).toSorted((a, b) => a - b));
    }
    for (const { rows: inGroup } of sortedSquad(rows, { key: "wage", descending: true })) {
      expect(inGroup.map((row) => row.wage)).toEqual(inGroup.map((row) => row.wage).toSorted((a, b) => b - a));
    }
    for (const { rows: inGroup } of sortedSquad(rows, { key: "name", descending: false })) {
      expect(inGroup.map((row) => row.name)).toEqual(inGroup.map((row) => row.name).toSorted((a, b) => a.localeCompare(b, "pt-BR")));
    }
  });

  test("a group with nobody in it is left out", () => {
    expect(sortedSquad(rows.filter((row) => row.group !== "GK"), { key: "strength", descending: true }).map((g) => g.group)).toEqual(["DEF", "MID", "ATT"]);
  });
});

describe("nextSort", () => {
  test("a new column starts from its natural order, the same column flips", () => {
    expect(nextSort({ key: "strength", descending: true }, "age")).toEqual({ key: "age", descending: false });
    expect(nextSort({ key: "age", descending: false }, "wage")).toEqual({ key: "wage", descending: true });
    expect(nextSort({ key: "age", descending: false }, "age")).toEqual({ key: "age", descending: true });
  });
});

describe("statusText", () => {
  test("says until when a player is out injured, or where he is banned", () => {
    expect(statusText({ kind: "injured", until: "2026-03-12" })).toBe("Lesionado até 12 mar");
    expect(statusText({ kind: "suspended", competitions: ["Baiano", "Copa do Brasil"] })).toBe("Suspenso: Baiano, Copa do Brasil");
    expect(statusText(null)).toBe("");
  });
});
