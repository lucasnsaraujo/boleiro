import { expect, test } from "vitest";
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
