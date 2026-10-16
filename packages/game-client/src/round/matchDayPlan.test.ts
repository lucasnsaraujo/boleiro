import { expect, test } from "vitest";
import { advanceDay } from "@boleiro/engine/sim/advanceDay";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { loadNewGame } from "@boleiro/engine/sim/loadNewGame";
import { matchDayPlan } from "./matchDayPlan.js";

const CLUB = "flamengo-rj";

function toMatchDay(state: GameState): GameState {
  const date = state.fixtures.find((f) => f.homeId === CLUB || f.awayId === CLUB)?.date ?? "";
  let current = state;
  while (current.date < date) current = advanceDay(current, {}).state;
  return current;
}

const matchDay = toMatchDay(loadNewGame(5, { coachClubId: CLUB }));

test("the lineup sheet flags the coach's players one yellow from a ban in today's competition", () => {
  const fixture = matchDay.fixtures.find((f) => f.date === matchDay.date && (f.homeId === CLUB || f.awayId === CLUB));
  const [booked, clean] = matchDayPlan(matchDay).squad;
  if (!fixture || !booked || !clean) throw new Error("the coach has a match and a squad");
  const discipline = { ...matchDay.discipline, [fixture.competitionId]: { [booked.id]: { yellows: 2, phase: 0, bans: 0 }, [clean.id]: { yellows: 1, phase: 0, bans: 0 } } };
  const squad = matchDayPlan({ ...matchDay, discipline }).squad;
  expect(squad.find((p) => p.id === booked.id)?.isOneYellowFromBan).toBe(true);
  expect(squad.find((p) => p.id === clean.id)?.isOneYellowFromBan).toBeUndefined();
});
