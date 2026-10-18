import { describe, expect, it } from "vitest";
import type { PositionGroup } from "../../engine/match.js";
import { advanceDay } from "../advanceDay.js";
import type { MatchPlan } from "../coach/matchPlan.js";
import type { Tactics } from "../coach/tactics.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { applyLiveChange } from "./applyLiveChange.js";
import { finishMatchDay } from "./finishMatchDay.js";
import type { LiveDay } from "./liveDay.js";
import type { MatchEvent } from "./matchTimeline.js";
import { energyAt } from "./planSubstitutions.js";
import { startMatchDay } from "./startMatchDay.js";

const COACH_CLUB = "flamengo-rj";
const start = loadNewGame(5, { coachClubId: COACH_CLUB });
const coachMatchDate = start.fixtures.find((f) => f.homeId === COACH_CLUB || f.awayId === COACH_CLUB)?.date ?? "";
let matchDay: GameState = start;
while (matchDay.date < coachMatchDate) matchDay = advanceDay(matchDay, {}).state;
const coachOnly: GameState = { ...matchDay, fixtures: matchDay.fixtures.filter((f) => f.date !== matchDay.date || f.homeId === COACH_CLUB || f.awayId === COACH_CLUB) };

const FIVE_THREE_TWO: Tactics = { formation: "5-3-2", posture: "balanced", penaltyTakerId: null };
const withPlan = (state: GameState, matchPlan: MatchPlan): GameState => ({ ...state, coach: { ...state.coach, matchPlan } });
const coachEvents = (live: LiveDay): MatchEvent[] => live.matches.find((m) => m.fixtureId === live.coachMatch?.fixtureId)?.events ?? [];
type Substitution = Extract<MatchEvent, { type: "substitution" }>;
const ownSubs = (live: LiveDay): Substitution[] => coachEvents(live).filter((e): e is Substitution => e.type === "substitution" && e.clubId === COACH_CLUB);
const playerOf = (live: LiveDay, id: string): SimPlayer | undefined =>
  [...(live.coachMatch?.starters.home ?? []), ...(live.coachMatch?.starters.away ?? []), ...(live.coachMatch?.bench ?? [])].find((p) => p.id === id);

/** The coach's eleven by line after `minute`: who started, swapped by the substitutions, less anyone sent off or hurt. */
function linesAfter(live: LiveDay, minute: number): Record<PositionGroup, number> {
  const open = live.coachMatch;
  const side = open?.starters.home.some((p) => p.clubId === COACH_CLUB) ? "home" : "away";
  let eleven = [...(open?.starters[side] ?? [])];
  const gone = new Set<string>();
  for (const e of coachEvents(live)) {
    if (e.minute > minute || !("clubId" in e) || e.clubId !== COACH_CLUB) continue;
    if (e.type === "substitution") eleven = eleven.map((p) => (p.id === e.offId ? (playerOf(live, e.playerId) ?? p) : p));
    if ((e.type === "card" && e.card !== "yellow") || e.type === "injury") gone.add(e.playerId);
  }
  const counts: Record<PositionGroup, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const p of eleven) if (!gone.has(p.id)) counts[p.group]++;
  return counts;
}

/** Kick-offs of the coach's match over many day streams, as `state` plays it with `tactics`, until `found` holds. */
function findKickOff(state: GameState, tactics: Tactics | undefined, found: (live: LiveDay) => boolean): LiveDay {
  for (let seed = 0; seed < 600; seed++) {
    const live = startMatchDay({ ...state, rngState: seed }, tactics ? { tactics } : {});
    if (found(live)) return live;
  }
  throw new Error("no kick-off found");
}

const redFor = (group: PositionGroup) => (live: LiveDay) =>
  coachEvents(live).some((e) => e.type === "card" && e.card !== "yellow" && e.clubId === COACH_CLUB && e.minute < 85 && playerOf(live, e.playerId)?.group === group);

describe("a match plan that keeps the shape", () => {
  it("answers a centre-back sent off in a 5-3-2 with a forward off and a defender on: 5-3-1", () => {
    const live = findKickOff(withPlan(coachOnly, { keepsShape: true }), FIVE_THREE_TWO, (day) => redFor("DEF")(day) && linesAfter(day, 0).ATT === 2);
    const red = coachEvents(live).find((e) => e.type === "card" && e.card !== "yellow" && e.clubId === COACH_CLUB);
    const sub = ownSubs(live).find((e) => e.minute === red?.minute);
    expect(sub).toMatchObject({ byPlan: true });
    expect(sub && playerOf(live, sub.offId)?.group).toBe("ATT");
    expect(sub && playerOf(live, sub.playerId)?.group).toBe("DEF");
    expect(linesAfter(live, red?.minute ?? 0)).toEqual({ GK: 1, DEF: 5, MID: 3, ATT: 1 });
    expect(live.coachMatch?.answeredByPlan).toContainEqual({ clubId: COACH_CLUB, minute: red?.minute, playerId: red && "playerId" in red ? red.playerId : "" });
  });

  it("lets a forward sent off go without a substitution, and still answers it", () => {
    const live = findKickOff(withPlan(coachOnly, { keepsShape: true }), FIVE_THREE_TWO, redFor("ATT"));
    const red = coachEvents(live).find((e) => e.type === "card" && e.card !== "yellow" && e.clubId === COACH_CLUB);
    expect(ownSubs(live).filter((e) => e.minute === red?.minute)).toEqual([]);
    expect(live.coachMatch?.answeredByPlan?.map((a) => a.minute)).toContain(red?.minute);
  });

  it("brings the strongest fit of a hurt player's line on for him", () => {
    const hurtLive = findKickOff(withPlan(coachOnly, { keepsShape: true }), undefined, (day) =>
      coachEvents(day).some((e) => e.type === "injury" && e.clubId === COACH_CLUB && e.minute < 85 && playerOf(day, e.playerId)?.group !== "GK"),
    );
    const injury = coachEvents(hurtLive).find((e) => e.type === "injury" && e.clubId === COACH_CLUB);
    const sub = ownSubs(hurtLive).find((e) => injury && "playerId" in injury && e.offId === injury.playerId);
    expect(sub).toMatchObject({ minute: injury?.minute, byPlan: true });
    expect(playerOf(hurtLive, sub?.playerId ?? "")?.group).toBe(playerOf(hurtLive, injury && "playerId" in injury ? injury.playerId : "")?.group);
  });
});

describe("a match plan's other rules", () => {
  // The kick-off whose coach's side has a player hurt early on, with no plan: the injury is drawn before any plan acts.
  const unplanned = findKickOff(coachOnly, undefined, (day) => coachEvents(day).some((e) => e.type === "injury" && e.clubId === COACH_CLUB && e.minute < 60));
  const seed = unplanned.state.rngState;
  const injury = coachEvents(unplanned).find((e) => e.type === "injury" && e.clubId === COACH_CLUB);
  const hurtId = injury && "playerId" in injury ? injury.playerId : "";

  it("brings a hurt player's named substitute on, whatever his line", () => {
    const hurtGroup = playerOf(unplanned, hurtId)?.group;
    const named = unplanned.coachMatch?.bench.find((p) => p.group !== hurtGroup && p.group !== "GK");
    const live = startMatchDay(withPlan({ ...coachOnly, rngState: seed }, { namedSubs: { [hurtId]: named?.id ?? "" } }), {});
    expect(ownSubs(live)).toContainEqual({ type: "substitution", minute: injury?.minute, clubId: COACH_CLUB, playerId: named?.id, offId: hurtId, byPlan: true });
  });

  it("leaves an injury its rules don't cover to the coach, with nothing answered", () => {
    const live = startMatchDay(withPlan({ ...coachOnly, rngState: seed }, { minuteSubs: [{ minute: 89, offId: "nobody", onId: "nobody-else" }] }), {});
    expect(ownSubs(live)).toEqual([]);
    expect(live.coachMatch?.answeredByPlan).toBeUndefined();
  });

  it("makes a planned substitution at its minute", () => {
    const starter = unplanned.coachMatch?.starters.home.concat(unplanned.coachMatch.starters.away).find((p) => p.clubId === COACH_CLUB && p.group === "MID" && p.id !== hurtId);
    const reserve = unplanned.coachMatch?.bench.find((p) => p.group === "MID");
    const live = startMatchDay(withPlan({ ...coachOnly, rngState: seed }, { minuteSubs: [{ minute: 70, offId: starter?.id ?? "", onId: reserve?.id ?? "" }] }), {});
    expect(ownSubs(live)).toContainEqual({ type: "substitution", minute: 70, clubId: COACH_CLUB, playerId: reserve?.id, offId: starter?.id, byPlan: true });
  });

  it("takes a player off at the first minute his energy is below the floor, the most tired first", () => {
    const tiredId = unplanned.coachMatch?.starters.home.concat(unplanned.coachMatch.starters.away).find((p) => p.clubId === COACH_CLUB && p.group === "MID" && p.id !== hurtId)?.id ?? "";
    const tired = { ...coachOnly.players[tiredId], condition: { ...coachOnly.players[tiredId]?.condition, fatigue: 35, fatigueOn: coachOnly.date } } as SimPlayer;
    const state = withPlan({ ...coachOnly, rngState: seed, players: { ...coachOnly.players, [tiredId]: tired } }, { energyFloor: 50 });
    const live = startMatchDay(state, {});
    const off = ownSubs(live).find((e) => e.offId === tiredId);
    expect(off).toMatchObject({ byPlan: true });
    expect(energyAt(tired, coachOnly.date, off?.minute ?? 0)).toBeLessThan(50);
    expect(energyAt(tired, coachOnly.date, (off?.minute ?? 0) - 1)).toBeGreaterThanOrEqual(50);
    const others = ownSubs(live).filter((e) => e.offId !== tiredId && e.offId !== hurtId);
    for (const e of others) expect(energyAt(playerOf(live, e.offId) ?? tired, coachOnly.date, e.minute)).toBeLessThan(50);
  });

  it("drains an older player faster, from the energy he starts with", () => {
    const young = { ...coachOnly.players[tiredIdOf()], age: 24 } as SimPlayer;
    const old = { ...young, age: 34 };
    expect(energyAt(young, coachOnly.date, 0)).toBe(energyAt(old, coachOnly.date, 0));
    expect(energyAt(old, coachOnly.date, 60)).toBeLessThan(energyAt(young, coachOnly.date, 60));
    expect(energyAt(young, coachOnly.date, 60)).toBeLessThan(energyAt(young, coachOnly.date, 30));
  });

  it("follows the plan again over the timeline a coach's change draws anew, from his minute on", () => {
    const planned = withPlan(coachOnly, { keepsShape: true });
    const hurtAfterChange = (day: LiveDay) => {
      const changed = applyLiveChange(day, 1, { posture: "attacking" });
      return coachEvents(changed).some((e) => e.type === "injury" && e.clubId === COACH_CLUB && e.minute > 1 && e.minute < 85 && playerOf(changed, e.playerId)?.group !== "GK");
    };
    const changed = applyLiveChange(findKickOff(planned, undefined, hurtAfterChange), 1, { posture: "attacking" });
    const injury = coachEvents(changed).find((e) => e.type === "injury" && e.clubId === COACH_CLUB && e.minute > 1);
    const hurtId = injury && "playerId" in injury ? injury.playerId : "";
    expect(ownSubs(changed)).toContainEqual(expect.objectContaining({ minute: injury?.minute, offId: hurtId, byPlan: true }));
    expect(changed.coachMatch?.answeredByPlan).toContainEqual({ clubId: COACH_CLUB, minute: injury?.minute, playerId: hurtId });
    expect(changed.coachMatch?.lastChangeMinute).toBe(1);
  });

  it("puts the minutes of the players the plan brought on in the record of the day", () => {
    const live = startMatchDay(withPlan({ ...coachOnly, rngState: seed }, { keepsShape: true }), {});
    const cameOn = ownSubs(live).map((e) => e.playerId);
    expect(cameOn.length).toBeGreaterThan(0);
    const { state } = finishMatchDay(live);
    for (const id of cameOn) expect(state.players[id]?.condition.seasonMinutes).toBeGreaterThan(coachOnly.players[id]?.condition.seasonMinutes ?? 0);
  });
});

function tiredIdOf(): string {
  return Object.values(coachOnly.players).find((p) => p.clubId === COACH_CLUB && p.group === "MID")?.id ?? "";
}
