import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import { RAPIDO } from "../formats.js";
import type { GameState, LeagueCompetition } from "../gameState.js";
import { groupStageAt, knockoutStageAt } from "../stageAt.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadEurope } from "./loadEurope.js";
import { loadMarketLeagues } from "./loadMarketLeagues.js";
import { loadSouthAmerica } from "./loadSouthAmerica.js";

const LAFC = "tm-51828";
const AMERICA = "tm-3631";
const AL_HILAL = "tm-1114";
const world = [...loadSouthAmerica(2026), ...loadEurope(2026), ...loadMarketLeagues(2026)];

const leagueOf = (state: GameState, country: string): LeagueCompetition | undefined =>
  Object.values(state.competitions).find((c): c is LeagueCompetition => c.kind === "league" && c.abroad?.country === country && c.season === state.season);

/** The season played to its last day, and the first day of the next. */
function playSeason(state: GameState): { last: GameState; next: GameState } {
  let current = state;
  for (;;) {
    const day = advanceDay(current, {});
    if (day.events.some((e) => e.type === "seasonEnded")) return { last: current, next: day.state };
    current = day.state;
  }
}

describe("a career in MLS", () => {
  const start = loadNewGame(5, { coachClubId: LAFC, world, formats: RAPIDO });

  it("brings MLS into the full tier, its 30 clubs in their two conferences of 15", () => {
    const mls = leagueOf(start, "us");
    expect(start.world?.us?.isFullTier).toBe(true);
    expect(start.world?.us?.leagues).toEqual([]);
    expect(mls?.format).toBe("mls");
    const conferences = mls && groupStageAt(mls, 0).groups;
    expect(conferences?.map((conference) => conference.length)).toEqual([15, 15]);
    expect(conferences?.[1]).toContain(LAFC);
    expect(conferences?.[0]).toContain("tm-69261");
  });

  describe("over a whole season", () => {
    const { last, next } = playSeason(start);
    const mls = leagueOf(last, "us");
    const played = last.fixtures.filter((f) => f.competitionId === mls?.id);

    it("plays 28 conference games a club and then the play-offs: eight a conference, down to the MLS Cup", () => {
      expect(played.filter((f) => f.stage === 0 && (f.homeId === LAFC || f.awayId === LAFC))).toHaveLength(28);
      expect(mls && [1, 2, 3, 4].map((stage) => knockoutStageAt(mls, stage).ties.length)).toEqual([8, 4, 2, 1]);
      const [east, west] = mls ? groupStageAt(mls, 0).groups : [];
      const [final] = mls ? knockoutStageAt(mls, 4).ties : [];
      expect(east).toContain(final?.find((id) => east?.includes(id)));
      expect(west).toContain(final?.find((id) => west?.includes(id)));
      expect(played.every((f) => f.result)).toBe(true);
    });

    it("files the MLS Cup winner as the season's champion", () => {
      const final = played.find((f) => f.stage === 4);
      const result = final?.result;
      const winner = result && (result.homeGoals > result.awayGoals ? final.homeId : result.homeGoals < result.awayGoals ? final.awayId : result.penaltyWinnerId);
      expect(winner).toBeDefined();
      expect(next.world?.us?.seasons.at(-1)?.champions[0]).toBe(winner);
    });
  });
});

describe("a career in Liga MX", () => {
  const start = loadNewGame(5, { coachClubId: AMERICA, world, formats: RAPIDO });

  it("plays the Clausura and the Apertura, each a round robin of 17 rounds and a two-leg liguilla of eight", () => {
    const liga = leagueOf(start, "mx");
    expect(liga?.format).toBe("liga-mx");
    expect(liga?.stageDates.map((dates) => dates.length)).toEqual([17, 2, 2, 2, 17, 2, 2, 2]);
    const days = liga?.stageDates.flat() ?? [];
    expect(new Set(days).size).toBe(days.length);
    expect(days).toEqual([...days].sort());
  });

  describe("over a whole season", () => {
    const { last, next } = playSeason(start);
    const liga = leagueOf(last, "mx");
    const played = last.fixtures.filter((f) => f.competitionId === liga?.id);

    it("plays both tournaments and liguillas, each club 34 tournament games", () => {
      expect(played.filter((f) => (f.stage === 0 || f.stage === 4) && (f.homeId === AMERICA || f.awayId === AMERICA))).toHaveLength(34);
      expect(liga && [1, 2, 3, 5, 6, 7].map((stage) => knockoutStageAt(liga, stage).ties.length)).toEqual([4, 2, 1, 4, 2, 1]);
      expect(played.every((f) => f.result)).toBe(true);
    });

    it("files the Apertura champion, nobody going down", () => {
      const record = next.world?.mx?.seasons.at(-1);
      const finalists = liga ? knockoutStageAt(liga, 7).ties[0] : undefined;
      expect(finalists).toContain(record?.champions[0]);
      expect(record?.relegated).toEqual([[]]);
    });
  });
});

describe("a career in Saudi Arabia", () => {
  it("plays the Pro League's double round robin in the full tier", () => {
    const start = loadNewGame(5, { coachClubId: AL_HILAL, world, formats: RAPIDO });
    const league = leagueOf(start, "sa");
    expect(start.world?.sa?.isFullTier).toBe(true);
    expect(league?.format).toBe("round-robin");
    expect(league?.stageDates[0]).toHaveLength(34);
  });
});
