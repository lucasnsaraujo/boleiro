import { expect, test } from "vitest";
import { withAssistantDuty } from "@boleiro/engine/sim/coach/assistantDuties";
import { loadNewGame } from "@boleiro/engine/sim/loadNewGame";
import { matchDayPlan } from "./matchDayPlan.js";

const CLUB = "flamengo-rj";

const start = loadNewGame(5, { coachClubId: CLUB });
// The coach's first match day, as the plan reads it: only the date and the unplayed fixture matter.
const matchDay = { ...start, date: start.fixtures.find((f) => f.homeId === CLUB || f.awayId === CLUB)?.date ?? start.date };

test("the lineup sheet flags the coach's players one yellow from a ban in today's competition", () => {
  const fixture = matchDay.fixtures.find((f) => f.date === matchDay.date && (f.homeId === CLUB || f.awayId === CLUB));
  const [booked, clean] = matchDayPlan(matchDay).squad;
  if (!fixture || !booked || !clean) throw new Error("the coach has a match and a squad");
  const discipline = { ...matchDay.discipline, [fixture.competitionId]: { [booked.id]: { yellows: 2, phase: 0, bans: 0 }, [clean.id]: { yellows: 1, phase: 0, bans: 0 } } };
  const squad = matchDayPlan({ ...matchDay, discipline }).squad;
  expect(squad.find((p) => p.id === booked.id)?.isOneYellowFromBan).toBe(true);
  expect(squad.find((p) => p.id === clean.id)?.isOneYellowFromBan).toBeUndefined();
});

test("the plan brings the opponent's last five results, oldest first", () => {
  const plan = matchDayPlan(matchDay);
  const opponentId = plan.homeId === CLUB ? plan.awayId : plan.homeId;
  const base = matchDay.fixtures[0];
  if (!base) throw new Error("the game has fixtures");
  const played = (id: string, date: string, homeGoals: number, awayGoals: number) => ({ ...base, id, date, homeId: opponentId, awayId: "x", result: { homeGoals, awayGoals } });
  const results = [played("r1", "2025-01-01", 0, 1), played("r2", "2025-02-01", 2, 0), played("r3", "2025-03-01", 1, 1), played("r4", "2025-04-01", 3, 0), played("r5", "2025-05-01", 0, 2), played("r6", "2025-06-01", 1, 0)];
  const fixtures = [...results.toReversed(), ...matchDay.fixtures];
  expect(matchDayPlan({ ...matchDay, fixtures }).opponentForm).toEqual(["win", "draw", "win", "loss", "win"]);
});

test("a player on loan from today's opponent is marked and left out of the assistant's eleven", () => {
  const plan = matchDayPlan(matchDay);
  const opponentId = plan.homeId === CLUB ? plan.awayId : plan.homeId;
  const best = Object.values(matchDay.players).filter((p) => p.clubId === opponentId).sort((a, b) => b.strength - a.strength)[0];
  if (!best) throw new Error("the opponent has players");
  const loan = { fromClubId: opponentId, until: "2026-12-31", lenderWageShare: 0.5, buyOption: null };
  const borrowed = { ...matchDay, players: { ...matchDay.players, [best.id]: { ...best, clubId: CLUB, strength: 99 } }, market: { ...matchDay.market, loans: { [best.id]: loan } } };
  const withHim = matchDayPlan(borrowed);
  expect(withHim.squad.find((p) => p.id === best.id)?.status).toBe("facesOwner");
  expect(withHim.lineup).not.toContain(best.id);
});

test("with the lineup in the coach's hands the sheet opens on his last eleven, and the assistant's own pick comes apart for Escalar time", () => {
  const squad = matchDayPlan(matchDay).squad.filter((p) => p.status === null);
  const keeper = squad.filter((p) => p.group === "GK").at(-1);
  if (!keeper) throw new Error("Flamengo has a fit keeper");
  const own = [keeper, ...squad.filter((p) => p.group !== "GK").slice(-10)].map((p) => p.id);
  const lastMatch = { ...matchDay, chemistry: { ...matchDay.chemistry, [CLUB]: { eleven: own, settled: 0, steadyGames: 0, kept: 11, was: 50 } } };
  const handsOn = { ...lastMatch, coach: withAssistantDuty(lastMatch.coach, "lineup", false) };

  const assistants = matchDayPlan(lastMatch);
  expect(assistants.lineup).toEqual(assistants.assistantLineup);
  expect([...assistants.lineup].sort()).not.toEqual([...own].sort());

  const coachs = matchDayPlan(handsOn);
  expect([...coachs.lineup].sort()).toEqual([...own].sort());
  expect(coachs.assistantLineup).toEqual(assistants.assistantLineup);
});
