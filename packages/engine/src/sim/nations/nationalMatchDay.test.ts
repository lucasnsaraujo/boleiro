import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { describe, expect, it } from "vitest";
import type { GameState } from "../gameState.js";
import { applyLiveChange } from "../live/applyLiveChange.js";
import { finishMatchDay } from "../live/finishMatchDay.js";
import type { LiveDay } from "../live/liveDay.js";
import { startMatchDay } from "../live/startMatchDay.js";
import { loadNewGame } from "../loadNewGame.js";
import { acceptNationalOffer } from "./nationalJobs.js";
import { nationalFixtureId, syncNationalFixtures } from "./nationalFixtures.js";
import { nationalSquadOf } from "./nationalSquad.js";
import { isFinal } from "../rivalries/coachRivalries.js";
import { isShootoutDue } from "../settleShootout.js";
import { hasExtraTime, tieBreakOf } from "../tieBreaks.js";

const football = loadNationalFootball();
const BRAZIL_MOROCCO = "world-cup-2026-C-1-brazil";

/** The game with its coach running `teamId` too, as if he took its federation's offer, its matches among the fixtures. */
function coaching(state: GameState, teamId: string): GameState {
  const nations = state.nations;
  if (!nations) throw new Error("the game has no national football");
  return syncNationalFixtures(acceptNationalOffer({ ...state, nations: { ...nations, offer: { teamId, expiresOn: "2026-12-31" } } }).state);
}

/** The game on the day of Brazil–Morocco, the World Cup's first match for Brazil. */
const onWorldCupDay = (coachClubId: string | null) => ({ ...coaching(loadNewGame(5, { coachClubId, nationalFootball: football }), "brazil"), date: "2026-06-13" });

const goalsOf = (live: LiveDay, fixtureId: string, teamId: string) => live.matches.find((m) => m.fixtureId === fixtureId)?.events.filter((e) => e.type === "goal" && e.clubId === teamId).length ?? 0;

describe("a national coach's match day", () => {
  const game = onWorldCupDay(null);
  const fixtureId = nationalFixtureId(BRAZIL_MOROCCO);

  it("opens his national team's match live, lined up from the called squad", () => {
    const live = startMatchDay(game, {});
    expect(live.coachMatch?.fixtureId).toBe(fixtureId);
    const squad = new Set(nationalSquadOf(game, "brazil").map((p) => p.id));
    expect(squad.size).toBeGreaterThanOrEqual(23);
    expect(live.coachMatch?.starters.home).toHaveLength(11);
    for (const p of [...(live.coachMatch?.starters.home ?? []), ...(live.coachMatch?.bench ?? [])]) expect(squad.has(p.id), p.name).toBe(true);
  });

  it("plays the eleven the coach picks from his call-up", () => {
    const squad = nationalSquadOf(game, "brazil");
    const keeper = squad.filter((p) => p.group === "GK").at(-1);
    const outfield = squad.filter((p) => p.group !== "GK").slice(-10);
    const lineup = [keeper, ...outfield].map((p) => p?.id ?? "");
    const live = startMatchDay(game, { lineup });
    expect(live.coachMatch?.starters.home.map((p) => p.id).sort()).toEqual([...lineup].sort());
  });

  it("refuses an eleven with a player the call-up left out", () => {
    const squad = new Set(nationalSquadOf(game, "brazil").map((p) => p.id));
    const stranger = Object.values(game.players).find((p) => !squad.has(p.id));
    const lineup = [...nationalSquadOf(game, "brazil").slice(0, 10).map((p) => p.id), stranger?.id ?? ""];
    expect(() => startMatchDay(game, { lineup })).toThrow();
  });

  it("records the live score, changes included, into the World Cup", () => {
    const live = startMatchDay(game, {});
    const starter = live.coachMatch?.starters.home.find((p) => p.group === "ATT") ?? live.coachMatch?.starters.home.at(-1);
    const sub = live.coachMatch?.bench.find((p) => p.group !== "GK");
    const changed = applyLiveChange(live, 60, { substitutions: [{ offId: starter?.id ?? "", onId: sub?.id ?? "" }], posture: "attacking" });
    const done = finishMatchDay(changed);
    const match = done.state.nations?.matches.find((m) => m.id === BRAZIL_MOROCCO);
    expect(match?.result).toEqual({ home: goalsOf(changed, fixtureId, "brazil"), away: goalsOf(changed, fixtureId, "morocco") });
    expect(done.state.fixtures.find((f) => f.id === fixtureId)?.result?.homeGoals).toBe(match?.result?.home);
  });

  it("keeps the called-up players at their clubs after the match, with its load on them", () => {
    const live = startMatchDay(game, {});
    const done = finishMatchDay(live);
    const starters = live.coachMatch?.starters.home.filter((p) => p.id in game.players) ?? [];
    expect(starters.length).toBeGreaterThan(0);
    for (const p of starters) {
      expect(done.state.players[p.id]?.clubId).toBe(game.players[p.id]?.clubId);
      expect(done.state.players[p.id]?.condition.fatigueOn).toBe("2026-06-13");
    }
  });

  it("saves the national tactics he ended the match with apart from his club's", () => {
    const live = startMatchDay(game, {});
    const changed = applyLiveChange(live, 30, { formation: "3-5-2" });
    const done = finishMatchDay(changed);
    expect(done.state.nations?.job?.tactics?.formation).toBe("3-5-2");
    expect(done.state.coach.tactics).toEqual(game.coach.tactics);
  });

  it("plays the competition's other matches of the day on the board too", () => {
    const live = startMatchDay(game, {});
    const national = live.matches.filter((m) => m.fixtureId.startsWith("national:"));
    expect(national.map((m) => `${m.homeId}-${m.awayId}`).sort()).toEqual(["brazil-morocco", "qatar-switzerland", "united-states-paraguay"]);
  });
});

describe("a club and national coach whose two teams play the same day", () => {
  const plain = loadNewGame(5, { coachClubId: null, nationalFootball: football });
  // Série A rests through the World Cup, so his club plays in a series below it, which play on.
  const clubId = plain.fixtures.find((f) => f.date === "2026-06-13" && f.competitionId.startsWith("serie-"))?.homeId ?? "";
  const game = onWorldCupDay(clubId);
  const fixtureId = nationalFixtureId(BRAZIL_MOROCCO);

  it("plays his club's match as his own and his national team's beside it, open to him too", () => {
    const live = startMatchDay(game, {});
    const club = game.fixtures.find((f) => f.date === "2026-06-13" && (f.homeId === clubId || f.awayId === clubId));
    expect(live.coachMatch?.fixtureId).toBe(club?.id);
    expect(live.coachMatch?.clubId).toBeUndefined();
    expect(live.waitingMatches?.map((m) => [m.fixtureId, m.clubId])).toEqual([[fixtureId, "brazil"]]);
  });

  it("takes his changes in the national match as the national team's, leaving his club's tactics alone", () => {
    const live = startMatchDay(game, {});
    const changed = applyLiveChange(live, 20, { formation: "4-4-2" }, "brazil");
    const done = finishMatchDay(changed);
    expect(done.state.nations?.job?.tactics?.formation).toBe("4-4-2");
    expect(done.state.coach.tactics).toEqual(game.coach.tactics);
    expect(done.state.nations?.matches.find((m) => m.id === BRAZIL_MOROCCO)?.result).toEqual({ home: goalsOf(changed, fixtureId, "brazil"), away: goalsOf(changed, fixtureId, "morocco") });
  });
});


describe("a national coach's match day, again", () => {
  it("plays the same way from the same game, live and after the final whistle", () => {
    const game = onWorldCupDay(null);
    const once = startMatchDay(game, {});
    const twice = startMatchDay(game, {});
    expect(twice.matches).toEqual(once.matches);
    expect(JSON.stringify(finishMatchDay(twice).state)).toBe(JSON.stringify(finishMatchDay(once).state));
  });
});

describe("a national knockout match", () => {
  it("goes to extra time and then penalties when level after ninety minutes, and its final is a final", () => {
    const game = coaching(loadNewGame(5, { coachClubId: null, nationalFootball: football }), "brazil");
    const nations = game.nations;
    if (!nations) throw new Error("the game has no national football");
    const knockout = (id: string, round: string, date: string) => ({ id, competitionId: "world-cup-2026", round, date, homeId: "brazil", awayId: "japan", isNeutral: true as const, result: null });
    const withKnockouts = syncNationalFixtures({ ...game, nations: { ...nations, matches: [...nations.matches, knockout("wc-r32-brazil", "round-of-32", "2026-06-29"), knockout("wc-final-brazil", "final", "2026-07-19")] } });
    const roundOf32 = withKnockouts.fixtures.find((f) => f.id === nationalFixtureId("wc-r32-brazil"));
    const final = withKnockouts.fixtures.find((f) => f.id === nationalFixtureId("wc-final-brazil"));
    const competition = withKnockouts.competitions[roundOf32?.competitionId ?? ""];
    if (!roundOf32 || !final || !competition) throw new Error("the knockout matches joined the full tier");
    expect(tieBreakOf(competition, roundOf32.stage)).toBe("extraTime");
    expect(hasExtraTime(competition, roundOf32.stage, 0)).toBe(true);
    expect(isShootoutDue(withKnockouts, { ...roundOf32, result: { homeGoals: 1, awayGoals: 1 } })).toBe(true);
    expect(isShootoutDue(withKnockouts, { ...roundOf32, result: { homeGoals: 2, awayGoals: 1 } })).toBe(false);
    expect(isFinal(withKnockouts, final)).toBe(true);
    expect(isFinal(withKnockouts, roundOf32)).toBe(false);
  });
});

describe("a ban in a national competition", () => {
  it("is served in the national team's next match, a player of the game's and one from abroad alike", () => {
    const game = onWorldCupDay(null);
    const squad = nationalSquadOf(game, "brazil");
    const own = squad.find((p) => p.id in game.players && p.group !== "GK");
    const outsider = squad.find((p) => !(p.id in game.players) && p.group !== "GK");
    if (!own || !outsider) throw new Error("Brazil calls up players of the game's and from abroad");
    const ban = { yellows: 0, phase: 0, bans: 1 };
    const banned = { ...game, discipline: { ...game.discipline, "national:world-cup-2026": { [own.id]: ban, [outsider.id]: ban } } };
    const live = startMatchDay(banned, {});
    const fielded = [...(live.coachMatch?.starters.home ?? []), ...(live.coachMatch?.bench ?? [])].map((p) => p.id);
    expect(fielded).not.toContain(own.id);
    expect(fielded).not.toContain(outsider.id);
    const after = finishMatchDay(live).state.discipline["national:world-cup-2026"];
    expect(after?.[own.id]?.bans).toBe(0);
    expect(after?.[outsider.id]?.bans).toBe(0);
  });
});

describe("a two-legged national tie", () => {
  it("is one stage of the full tier, its first leg no decider and its second settled on aggregate", () => {
    const game = coaching(loadNewGame(5, { coachClubId: null, nationalFootball: football }), "spain");
    const nations = game.nations;
    if (!nations) throw new Error("the game has no national football");
    const leg = (id: string, date: string, homeId: string, awayId: string, second?: true) => ({ id, competitionId: "nations-league-2026", round: "quarter-finals", date, homeId, awayId, ...(second ? { leg: 2 as const } : {}), result: null });
    const ties = [leg("nl-qf-1", "2027-03-26", "spain", "france"), leg("nl-qf-1-2", "2027-03-29", "france", "spain", true)];
    const synced = syncNationalFixtures({ ...game, nations: { ...nations, matches: [...nations.matches, ...ties] } });
    const [first, second] = ties.map((t) => synced.fixtures.find((f) => f.id === nationalFixtureId(t.id)));
    if (!first || !second) throw new Error("both legs joined the full tier");
    expect(second.stage).toBe(first.stage);
    expect(second.tie).toBe(first.tie);
    const played = { ...synced, fixtures: synced.fixtures.map((f) => (f.id === first.id ? { ...f, result: { homeGoals: 2, awayGoals: 0 } } : f)) };
    expect(isShootoutDue(played, { ...first, result: { homeGoals: 2, awayGoals: 0 } })).toBe(false);
    expect(isShootoutDue(played, { ...second, result: { homeGoals: 2, awayGoals: 0 } })).toBe(true);
    expect(isShootoutDue(played, { ...second, result: { homeGoals: 1, awayGoals: 0 } })).toBe(false);
  });
});

describe("a national coach's half-time talk", () => {
  it("lifts his national side's players for the second half, not the opponent's", () => {
    const live = startMatchDay(onWorldCupDay(null), {});
    const talked = applyLiveChange(live, 45, { talk: "faith" });
    const brazil = live.coachMatch?.starters.home[1];
    const morocco = live.coachMatch?.starters.away[1];
    if (!brazil || !morocco) throw new Error("both sides start eleven");
    expect(talked.coachMatch?.strengths[brazil.id]).toBeGreaterThan(live.coachMatch?.strengths[brazil.id] ?? Infinity);
    expect(talked.coachMatch?.strengths[morocco.id]).toBe(live.coachMatch?.strengths[morocco.id]);
  });
});
