import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { startMatchDay } from "../live/startMatchDay.js";
import { finishMatchDay } from "../live/finishMatchDay.js";
import { loadNewGame } from "../loadNewGame.js";
import { matchRatings } from "../live/matchRatings.js";
import { competitionKey } from "./history.js";

const start = loadNewGame(2, { coachClubId: null });
const leagueDay = start.calendar.leagueDates.A[0] ?? "";
let beforeLeague: GameState = start;
while (beforeLeague.date < leagueDay) beforeLeague = advanceDay(beforeLeague, {}).state;

describe("the season's ratings", () => {
  const live = startMatchDay(beforeLeague, {});
  const after = finishMatchDay(live).state;
  const fixture = after.fixtures.find((f) => f.date === leagueDay && f.competitionId.startsWith("serie-a") && f.result);
  if (!fixture) throw new Error("no Série A match on the first league day");
  const match = live.matches.find((m) => m.fixtureId === fixture.id);
  const tally = after.history.current.ratings?.[competitionKey(fixture.competitionId)] ?? {};

  it("count one rated game for everyone who played a match, with his match rating in tenths", () => {
    if (!match) throw new Error("the match has no timeline");
    const side = (clubId: string) => {
      const squad = Object.values(beforeLeague.players).filter((p) => p.clubId === clubId);
      const cameOn = new Set(match.events.flatMap((e) => (e.type === "substitution" && e.clubId === clubId ? [e.playerId] : [])));
      const starters = (match.play?.starters ?? []).flatMap((id) => squad.filter((p) => p.id === id));
      return { clubId, starters, bench: squad.filter((p) => cameOn.has(p.id)) };
    };
    const rated = matchRatings({ home: side(fixture.homeId), away: side(fixture.awayId) }, match.events, match.play);
    for (const { playerId, rating } of [...rated.home, ...rated.away]) {
      expect(tally[playerId]?.[0], playerId).toBe(1);
      expect(tally[playerId]?.[1], playerId).toBe(Math.round(rating * 10));
    }
  });

  it("credit each goal's assist to its passer", () => {
    if (!match) throw new Error("the match has no timeline");
    const assists = match.events.flatMap((e) => (e.type === "goal" && e.assistId ? [e.assistId] : []));
    for (const id of new Set(assists)) expect(tally[id]?.[2]).toBe(assists.filter((a) => a === id).length);
  });

});
