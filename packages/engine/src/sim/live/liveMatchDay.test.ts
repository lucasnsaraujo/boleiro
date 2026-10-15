import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { waitingCoachesOf } from "../coach/humanCoaches.js";
import { loadNewGame } from "../loadNewGame.js";
import { applyLiveChange } from "./applyLiveChange.js";
import { finishMatchDay } from "./finishMatchDay.js";
import type { LiveDay } from "./liveDay.js";
import { FULL_TIME, HALF_TIME } from "./matchTimeline.js";
import { startMatchDay } from "./startMatchDay.js";

const COACH_CLUB = "flamengo-rj";
const start = loadNewGame(5, { coachClubId: COACH_CLUB });

function advanceTo(state: GameState, date: string): GameState {
  let current = state;
  while (current.date < date) current = advanceDay(current, {}).state;
  return current;
}

const coachMatchDate = start.fixtures.find((f) => f.homeId === COACH_CLUB || f.awayId === COACH_CLUB)?.date ?? "";
const matchDay = advanceTo(start, coachMatchDate);

describe("a live match day", () => {
  it("ends, with no live changes, exactly as advanceDay plays the day", () => {
    const decisions = { tactics: { formation: "4-3-3", posture: "attacking", penaltyTakerId: null } } as const;
    expect(finishMatchDay(startMatchDay(matchDay, decisions))).toEqual(advanceDay(matchDay, decisions));
  });

  it("gives every match of the day a timeline of its final score, its cards and both whistles", () => {
    const live = startMatchDay(matchDay, {});
    const { state } = finishMatchDay(live);
    const today = state.fixtures.filter((f) => f.date === matchDay.date);
    expect(live.matches.map((m) => m.fixtureId)).toEqual(today.map((f) => f.id));
    for (const match of live.matches) {
      const result = today.find((f) => f.id === match.fixtureId)?.result;
      const count = (type: string, clubId: string) => match.events.filter((e) => e.type === type && "clubId" in e && e.clubId === clubId).length;
      expect([count("goal", match.homeId), count("goal", match.awayId)]).toEqual([result?.homeGoals, result?.awayGoals]);
      const cards = (result?.cards?.home.yellows ?? 0) + (result?.cards?.home.reds ?? 0);
      expect(count("card", match.homeId)).toBe(cards);
      expect(match.events.filter((e) => e.type === "halfTime" || e.type === "fullTime")).toEqual([
        { type: "halfTime", minute: HALF_TIME },
        { type: "fullTime", minute: FULL_TIME },
      ]);
      expect(match.events.map((e) => e.minute)).toEqual(match.events.map((e) => e.minute).sort((a, b) => a - b));
    }
  });

  it("spreads goals over the minutes as Série A does, with more late goals than early ones", () => {
    const goalMinutes = Array.from({ length: 30 }, (_, seed) => seed).flatMap((seed) =>
      startMatchDay({ ...matchDay, rngState: seed }, {}).matches.flatMap((m) => m.events.filter((e) => e.type === "goal").map((e) => e.minute)),
    );
    const between = (from: number, to: number) => goalMinutes.filter((minute) => minute >= from && minute <= to).length;
    expect(goalMinutes.length).toBeGreaterThan(600);
    expect(between(76, 90)).toBeGreaterThan(1.4 * between(1, 15));
  });

  it("puts every injury of the day on the timeline of the injured player's match", () => {
    const live = startMatchDay(matchDay, {});
    const injured = finishMatchDay(live).events.flatMap((e) => (e.type === "playerInjured" ? [e.playerId] : []));
    const onTimeline = live.matches.flatMap((m) => m.events.flatMap((e) => (e.type === "injury" ? [e.playerId] : [])));
    expect(onTimeline.sort()).toEqual(injured.sort());
  });

  it("keeps the coach's tactics for his next matches", () => {
    const tactics = { formation: "5-3-2", posture: "defensive", penaltyTakerId: null } as const;
    const { state } = advanceDay(matchDay, { tactics });
    expect(state.coach.tactics).toEqual(tactics);
    expect(advanceDay(state, {}).state.coach.tactics).toEqual(tactics);
  });
});

const coachFixtureId = (live: LiveDay) => live.coachMatch?.fixtureId ?? "";
const otherMatches = (live: LiveDay) => live.matches.filter((m) => m.fixtureId !== coachFixtureId(live));
const coachEvents = (live: LiveDay) => live.matches.find((m) => m.fixtureId === coachFixtureId(live))?.events ?? [];

describe("a live change", () => {
  const live = startMatchDay(matchDay, {});

  it("redraws only the coach's match, and only after the minute of the change", () => {
    const changed = applyLiveChange(live, 60, { posture: "attacking" });
    expect(otherMatches(changed)).toEqual(otherMatches(live));
    expect(coachEvents(changed).filter((e) => e.minute <= 60 && e.type !== "fullTime")).toEqual(
      coachEvents(live).filter((e) => e.minute <= 60 && e.type !== "fullTime"),
    );
    const others = (day: LiveDay) => finishMatchDay(day).state.fixtures.filter((f) => f.date === matchDay.date && f.id !== coachFixtureId(live));
    expect(others(changed)).toEqual(others(live));
  });

  it("never lets a player score or get a card after he was injured, once the coach makes a change", () => {
    const coachOnly = { ...matchDay, fixtures: matchDay.fixtures.filter((f) => f.date !== matchDay.date || f.homeId === COACH_CLUB || f.awayId === COACH_CLUB) };
    const lateActs: string[] = [];
    for (let seed = 0; seed < 200; seed++) {
      const kickedOff = startMatchDay({ ...coachOnly, rngState: seed }, {});
      for (const minute of [0, 45]) {
        const events = coachEvents(applyLiveChange(kickedOff, minute, { posture: "attacking" }));
        const injuredAt = new Map(events.flatMap((e) => (e.type === "injury" ? [[e.playerId, e.minute] as const] : [])));
        for (const e of events) {
          const isRedrawn = e.minute > minute && (e.type === "goal" || e.type === "card");
          if (isRedrawn && e.minute > (injuredAt.get(e.playerId) ?? FULL_TIME)) lateActs.push(`seed ${seed}, change at ${minute}: ${e.type} at ${e.minute}`);
        }
      }
    }
    expect(lateActs).toEqual([]);
  });

  it("gives the same match for the same seed and the same changes at the same minutes", () => {
    const play = () => finishMatchDay(applyLiveChange(applyLiveChange(live, 30, { formation: "4-3-3" }), 70, { posture: "defensive" }));
    expect(play()).toEqual(play());
  });
});

describe("substitutions", () => {
  const live = startMatchDay(matchDay, {});
  const coachSide = live.matches.find((m) => m.fixtureId === coachFixtureId(live))?.homeId === COACH_CLUB ? "home" : "away";
  const starters = live.coachMatch?.starters[coachSide].filter((p) => p.group !== "GK") ?? [];
  const bench = live.coachMatch?.bench.filter((p) => p.group !== "GK") ?? [];
  const sub = (i: number) => ({ offId: starters[i]?.id ?? "", onId: bench[i]?.id ?? "" });

  it("bring the substitute on for the rest of the match and count both players' minutes", () => {
    const changed = applyLiveChange(live, 60, { substitutions: [sub(0)] });
    expect(coachEvents(changed)).toContainEqual({ type: "substitution", minute: 60, clubId: COACH_CLUB, playerId: sub(0).onId, offId: sub(0).offId });
    const { state } = finishMatchDay(changed);
    const minutesPlayed = (id: string) => (state.players[id]?.condition.seasonMinutes ?? 0) - (matchDay.players[id]?.condition.seasonMinutes ?? 0);
    expect([minutesPlayed(sub(0).offId), minutesPlayed(sub(0).onId)]).toEqual([60, 30]);
  });

  it("stop at five", () => {
    const four = applyLiveChange(live, 45, { substitutions: [0, 1, 2, 3].map(sub) });
    expect(() => applyLiveChange(four, 60, { substitutions: [sub(4)] })).not.toThrow();
    expect(() => applyLiveChange(four, 60, { substitutions: [sub(4), sub(5)] })).toThrow(/at most 5 substitutions/);
  });

  it("come in at most three windows, plus half-time", () => {
    const threeWindows = [50, 60, 70].reduce((day, minute, i) => applyLiveChange(day, minute, { substitutions: [sub(i)] }), applyLiveChange(live, 45, { substitutions: [sub(5)] }));
    expect(() => applyLiveChange(threeWindows, 70, { substitutions: [sub(3)] })).not.toThrow();
    expect(() => applyLiveChange(threeWindows, 80, { substitutions: [sub(3)] })).toThrow(/at most 3 substitution windows/);
  });

  it("still come at half-time after three windows in the first half", () => {
    const threeWindows = [10, 20, 30].reduce((day, minute, i) => applyLiveChange(day, minute, { substitutions: [sub(i)] }), live);
    expect(() => applyLiveChange(threeWindows, 45, { substitutions: [sub(3)] })).not.toThrow();
  });

  it("take each player off only once", () => {
    expect(() => applyLiveChange(live, 60, { substitutions: [sub(0), { offId: sub(0).offId, onId: sub(1).onId }] })).toThrow(/is not on the pitch/);
  });

  it("never bring a player back once he is off", () => {
    const changed = applyLiveChange(live, 30, { substitutions: [sub(0)] });
    expect(() => applyLiveChange(changed, 60, { substitutions: [{ offId: sub(0).onId, onId: sub(0).offId }] })).toThrow(/cannot come on/);
    const subOff = applyLiveChange(changed, 60, { substitutions: [{ offId: sub(0).onId, onId: sub(1).onId }] });
    expect(() => applyLiveChange(subOff, 70, { substitutions: [{ offId: sub(1).onId, onId: sub(0).onId }] })).toThrow(/cannot come on/);
  });
});

describe("the coach's posture", () => {
  // Only the coach's match, so each seed plays one game.
  const coachOnly = { ...matchDay, fixtures: matchDay.fixtures.filter((f) => f.date !== matchDay.date || f.homeId === COACH_CLUB || f.awayId === COACH_CLUB) };
  const goalsWith = (posture: "attacking" | "defensive") => {
    const totals = { for: 0, against: 0 };
    for (let seed = 0; seed < 300; seed++) {
      const changed = applyLiveChange(startMatchDay({ ...coachOnly, rngState: seed }, {}), 0, { posture });
      for (const e of coachEvents(changed)) if (e.type === "goal") totals[e.clubId === COACH_CLUB ? "for" : "against"]++;
    }
    return totals;
  };

  it("makes an attacking side score and concede more than a defensive one for the rest of the match", () => {
    const attacking = goalsWith("attacking");
    const defensive = goalsWith("defensive");
    expect(attacking.for).toBeGreaterThan(1.2 * defensive.for);
    expect(attacking.against).toBeGreaterThan(1.2 * defensive.against);
  });
});

describe("match depth", () => {
  // Goal kinds and assists draw from a stream keyed on the game's seed, so each day gets a seed of its own.
  const days = Array.from({ length: 30 }, (_, seed) => startMatchDay({ ...matchDay, seed, rngState: seed }, {}));
  const allEvents = days.flatMap((live) => live.matches.flatMap((m) => m.events.map((e) => ({ e, match: m, live }))));
  const goals = allEvents.flatMap(({ e, match }) => (e.type === "goal" ? [{ goal: e, match }] : []));
  const share = (count: number) => count / goals.length;

  it("tells each goal's kind at about Série A's shares: penalties, headers, own goals and free kicks", () => {
    const kind = (k: string) => goals.filter(({ goal }) => goal.kind === k).length;
    expect(goals.length).toBeGreaterThan(600);
    expect(goals.every(({ goal }) => goal.kind !== undefined)).toBe(true);
    expect(share(kind("penalty"))).toBeGreaterThan(0.05);
    expect(share(kind("penalty"))).toBeLessThan(0.13);
    expect(share(kind("header"))).toBeGreaterThan(0.13);
    expect(share(kind("header"))).toBeLessThan(0.23);
    expect(kind("ownGoal")).toBeGreaterThan(0);
    expect(kind("freeKick")).toBeGreaterThan(0);
  });

  it("credits most open-play goals with an assist by a team-mate, never the scorer himself", () => {
    const openPlay = goals.filter(({ goal }) => goal.kind === "openPlay");
    const assisted = openPlay.filter(({ goal }) => goal.assistId);
    expect(assisted.length / openPlay.length).toBeGreaterThan(0.6);
    expect(assisted.length / openPlay.length).toBeLessThan(0.85);
    for (const { goal } of assisted) {
      expect(goal.assistId).not.toBe(goal.playerId);
      expect(matchDay.players[goal.assistId ?? ""]?.clubId).toBe(goal.clubId);
    }
  });

  it("puts an own goal in by a player of the other side", () => {
    for (const { goal, match } of goals.filter(({ goal }) => goal.kind === "ownGoal")) {
      const opponentId = goal.clubId === match.homeId ? match.awayId : match.homeId;
      expect(matchDay.players[goal.playerId]?.clubId).toBe(opponentId);
    }
  });

  it("has CPU coaches make substitutions within Law 3: five at most, in three windows plus half-time", () => {
    const sides = days.flatMap((live) =>
      live.matches.flatMap((m) => [m.homeId, m.awayId].filter((id) => id !== COACH_CLUB).map((clubId) => m.events.filter((e) => e.type === "substitution" && e.clubId === clubId))),
    );
    for (const subs of sides) {
      expect(subs.length).toBeLessThanOrEqual(5);
      expect(new Set(subs.filter((s) => s.minute !== HALF_TIME).map((s) => s.minute)).size).toBeLessThanOrEqual(3);
    }
    const mean = sides.reduce((sum, subs) => sum + subs.length, 0) / sides.length;
    expect(mean).toBeGreaterThan(3.5);
  });

  it("has a CPU coach replace a player hurt in the match", () => {
    const hurt = allEvents.filter(({ e }) => e.type === "injury" && e.clubId !== COACH_CLUB && e.minute < FULL_TIME - 1);
    const replaced = hurt.filter(({ e, match }) => match.events.some((s) => s.type === "substitution" && e.type === "injury" && s.offId === e.playerId && s.minute === e.minute));
    expect(hurt.length).toBeGreaterThan(5);
    expect(replaced.length / hurt.length).toBeGreaterThan(0.7);
  });

  it("leaves the coach's own side to him: no substitution he did not make", () => {
    expect(allEvents.some(({ e }) => e.type === "substitution" && e.clubId === COACH_CLUB)).toBe(false);
  });
});

describe("a live day saved by an older build", () => {
  it("still settles a level deciding leg on penalties when its changed timeline has no kicks", () => {
    const changed = applyLiveChange(startMatchDay(matchDay, {}), 30, { posture: "defensive" });
    const fixtureId = changed.coachMatch?.fixtureId ?? "";
    const fixture = changed.state.fixtures.find((f) => f.id === fixtureId);
    if (!fixture) throw new Error("the coach has a match");
    // The coach's match made a one-leg cup final, played to a goalless draw with no shootout on its timeline.
    const league = changed.state.competitions[fixture.competitionId];
    if (!league) throw new Error("the coach's match has a competition");
    const ties: [string, string][] = [[fixture.homeId, fixture.awayId]];
    const cup = { ...league, id: "old-cup", stages: [{ kind: "knockout" as const, ties, dates: [fixture.date] }] };
    const asCupFinal = { ...fixture, competitionId: "old-cup", stage: 0, tie: 0 };
    const old: LiveDay = {
      ...changed,
      state: {
        ...changed.state,
        competitions: { ...changed.state.competitions, "old-cup": cup },
        fixtures: changed.state.fixtures.map((f) => (f.id === fixtureId ? asCupFinal : f)),
      },
      matches: changed.matches.map((m) => (m.fixtureId === fixtureId ? { ...m, events: m.events.filter((e) => e.type !== "goal" && e.type !== "shootoutKick" && e.type !== "orderOverruled") } : m)),
    };
    const { events } = finishMatchDay(old);
    const played = events.find((e) => e.type === "matchPlayed" && e.fixture.id === fixtureId);
    expect(played?.type === "matchPlayed" && played.fixture.result).toMatchObject({ homeGoals: 0, awayGoals: 0 });
    expect(played?.type === "matchPlayed" && played.fixture.result?.penaltyWinnerId).toBeOneOf([fixture.homeId, fixture.awayId]);
  });
});

describe("a hot-seat live match day", () => {
  const WAITING_CLUB = "palmeiras-sp";
  const twoCoaches = loadNewGame(5, { coachClubId: COACH_CLUB, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: WAITING_CLUB }] } });
  const plays = (date: string, clubId: string) => twoCoaches.fixtures.some((f) => f.date === date && (f.homeId === clubId || f.awayId === clubId));
  const dates = [...new Set(twoCoaches.fixtures.map((f) => f.date))].sort();
  const bothPlay = advanceTo(twoCoaches, dates.find((date) => plays(date, COACH_CLUB) && plays(date, WAITING_CLUB)) ?? "");
  // A second coach at the club the first one meets on his first match day.
  const firstMatch = start.fixtures.find((f) => f.date === coachMatchDate && (f.homeId === COACH_CLUB || f.awayId === COACH_CLUB));
  const RIVAL_CLUB = firstMatch?.homeId === COACH_CLUB ? firstMatch.awayId : (firstMatch?.homeId ?? "");
  const derby = loadNewGame(5, { coachClubId: COACH_CLUB, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: RIVAL_CLUB }] } });
  const derbyDay = advanceTo(derby, coachMatchDate);
  const matchOf = (live: LiveDay, clubId: string) => live.matches.find((m) => m.homeId === clubId || m.awayId === clubId);
  const subsOf = (live: LiveDay, clubId: string) => matchOf(live, clubId)?.events.filter((e) => e.type === "substitution" && e.clubId === clubId) ?? [];
  const openSideOf = (live: LiveDay, clubId: string) => {
    const open = [live.coachMatch, ...(live.waitingMatches ?? [])].find((m) => m && [m.starters.home[0]?.clubId, m.starters.away[0]?.clubId].includes(clubId));
    const side = open?.starters.home[0]?.clubId === clubId ? "home" : "away";
    const isOwner = (open?.clubId ?? live.state.coachClubId) === clubId;
    return { starters: open?.starters[side].filter((p) => p.group !== "GK") ?? [], bench: (isOwner ? open?.bench : open?.opponentBench)?.filter((p) => p.group !== "GK") ?? [] };
  };
  const subFor = (live: LiveDay, clubId: string) => {
    const { starters, bench } = openSideOf(live, clubId);
    return { offId: starters[0]?.id ?? "", onId: bench[0]?.id ?? "" };
  };

  it("leaves the waiting coach's side to him too: no substitution he did not make", () => {
    expect(subsOf(startMatchDay(bothPlay, {}), WAITING_CLUB)).toEqual([]);
  });

  it("lets the waiting coach substitute in his own match, leaving every other match as it was", () => {
    const live = startMatchDay(bothPlay, {});
    const sub = subFor(live, WAITING_CLUB);
    const changed = applyLiveChange(live, 60, { substitutions: [sub] }, WAITING_CLUB);
    expect(subsOf(changed, WAITING_CLUB)).toEqual([{ type: "substitution", minute: 60, clubId: WAITING_CLUB, playerId: sub.onId, offId: sub.offId }]);
    const others = (day: LiveDay) => day.matches.filter((m) => m !== matchOf(day, WAITING_CLUB));
    expect(others(changed)).toEqual(others(live));
    const { state } = finishMatchDay(changed);
    const minutesPlayed = (id: string) => (state.players[id]?.condition.seasonMinutes ?? 0) - (bothPlay.players[id]?.condition.seasonMinutes ?? 0);
    expect([minutesPlayed(sub.offId), minutesPlayed(sub.onId)]).toEqual([60, 30]);
  });

  it("keeps the waiting coach's live tactics for his next matches", () => {
    const changed = applyLiveChange(startMatchDay(bothPlay, {}), 30, { formation: "5-3-2" }, WAITING_CLUB);
    expect(waitingCoachesOf(finishMatchDay(changed).state)[0]?.coach.tactics.formation).toBe("5-3-2");
  });

  it("lets two coaches who play each other each change his own side, and neither gets an AI substitution", () => {
    const live = startMatchDay(derbyDay, {});
    expect(matchOf(live, COACH_CLUB)).toBe(matchOf(live, RIVAL_CLUB));
    expect([...subsOf(live, COACH_CLUB), ...subsOf(live, RIVAL_CLUB)]).toEqual([]);
    const ours = subFor(live, COACH_CLUB);
    const theirs = subFor(live, RIVAL_CLUB);
    const changed = applyLiveChange(applyLiveChange(live, 30, { substitutions: [ours] }, COACH_CLUB), 50, { substitutions: [theirs], posture: "attacking" }, RIVAL_CLUB);
    expect(subsOf(changed, COACH_CLUB).map((e) => e.minute)).toEqual([30]);
    expect(subsOf(changed, RIVAL_CLUB).map((e) => e.minute)).toEqual([50]);
    expect(() => applyLiveChange(changed, 60, { substitutions: [{ offId: theirs.offId, onId: ours.onId }] }, RIVAL_CLUB)).toThrow();
    const played = finishMatchDay(changed).state.fixtures.find((f) => f.id === matchOf(changed, COACH_CLUB)?.fixtureId);
    expect(played?.result).not.toBeNull();
  });

  it("refuses a change for a club with no match today", () => {
    expect(() => applyLiveChange(startMatchDay(bothPlay, {}), 30, { posture: "attacking" }, "santos-sp")).toThrow(/no match today/);
  });
});
