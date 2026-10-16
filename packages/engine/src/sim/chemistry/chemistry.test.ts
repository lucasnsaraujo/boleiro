import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import { EVENT_BANK } from "../events/eventBank.js";
import type { EventScene } from "../events/eventType.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { isInjured } from "../players/isInjured.js";
import { playingStrength } from "../players/matchSetup.js";
import { loadGame, saveGame } from "../saveGame.js";
import { chemistryOf, chemistryStrength, type Chemistry } from "./chemistryOf.js";
import { nameCaptain } from "./nameCaptain.js";

const CLUB = "flamengo-rj";
const start = loadNewGame(5, { coachClubId: CLUB });
const squadOf = (state: GameState, clubId = CLUB): SimPlayer[] => Object.values(state.players).filter((p) => p.clubId === clubId);

/** The game on the day of the coach's next match, playing on with the assistant's eleven. */
function toMatchDay(state: GameState): GameState {
  let current = advanceDay(state, {}).state;
  while (!current.fixtures.some((f) => f.date === current.date && !f.result && (f.homeId === CLUB || f.awayId === CLUB))) current = advanceDay(current, {}).state;
  return current;
}

/** The coach's eleven for a match: the assistant's usual one, or a rotated one with `changes` reserves in. */
function elevenOf(state: GameState, changes: number, round: number): string[] {
  const squad = squadOf(state).filter((p) => !isInjured(p, state.date)).sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : 1));
  const keeper = squad.find((p) => p.group === "GK");
  const outfield = squad.filter((p) => p.group !== "GK");
  if (!keeper) throw new Error("no keeper");
  const best = outfield.slice(0, 10);
  const reserves = outfield.slice(10);
  const rotated = best.map((p, i) => (i < changes ? (reserves[(i + round * changes) % reserves.length] ?? p) : p));
  return [keeper.id, ...rotated.map((p) => p.id)];
}

function playMatches(changes: number, count: number): GameState {
  let state = start;
  for (let round = 0; round < count; round++) {
    state = toMatchDay(state);
    state = advanceDay(state, { lineup: elevenOf(state, changes, round) }).state;
  }
  return state;
}

const reasonPoints = (chemistry: Chemistry, kind: Chemistry["reasons"][number]["kind"]) => chemistry.reasons.find((r) => r.kind === kind)?.points ?? 0;

describe("team chemistry", () => {
  const steady = playMatches(0, 4);
  const rotated = playMatches(6, 4);

  it("rises with a stable eleven and falls when the eleven keeps changing", () => {
    const neutral = chemistryOf(start, CLUB);
    expect(reasonPoints(chemistryOf(steady, CLUB), "settled")).toBeGreaterThan(0);
    expect(reasonPoints(chemistryOf(rotated, CLUB), "settled")).toBeLessThan(0);
    expect(chemistryOf(steady, CLUB).value).toBeGreaterThan(chemistryOf(rotated, CLUB).value);
    expect(chemistryOf(rotated, CLUB).value).toBeLessThan(neutral.value);
  });

  it("remembers the meter before the last match, so the screen can say where it moved", () => {
    const before = chemistryOf(steady, CLUB);
    const after = toMatchDay(steady);
    const played = advanceDay(after, { lineup: elevenOf(after, 7, 9) }).state;
    const now = chemistryOf(played, CLUB);
    expect(now.was).toBe(chemistryOf(after, CLUB).value);
    expect(now.value).toBeLessThan(before.value);
  });

  it("falls with new signings in the eleven", () => {
    const chemistry = chemistryOf(steady, CLUB);
    const signedOn = steady.date;
    const players = { ...steady.players };
    for (const id of chemistry.eleven.slice(1, 4)) {
      const player = players[id];
      if (player) players[id] = { ...player, condition: { ...player.condition, arrivedOn: signedOn } };
    }
    const signed = chemistryOf({ ...steady, players }, CLUB);
    expect(signed.value).toBeLessThan(chemistry.value);
    const newcomers = signed.reasons.find((r) => r.kind === "newcomers");
    expect(newcomers && "playerIds" in newcomers ? newcomers.playerIds : []).toHaveLength(3);
  });

  it("falls when a reserve as good as a starter fights him for the place", () => {
    const chemistry = chemistryOf(steady, CLUB);
    const starter = steady.players[chemistry.eleven[5] ?? ""];
    if (!starter) throw new Error("no starter");
    const reserve = squadOf(steady).find((p) => !chemistry.eleven.includes(p.id) && p.group === starter.group && p.group !== "GK");
    if (!reserve) throw new Error("no reserve");
    const rival = { ...reserve, strength: starter.strength + 1, positions: starter.positions ?? [], condition: { ...reserve.condition, injuredUntil: null } };
    const contested = chemistryOf({ ...steady, players: { ...steady.players, [rival.id]: rival } }, CLUB);
    expect(contested.links.some((link) => link.kind === "rival" && link.playerIds[1] === rival.id)).toBe(true);
    expect(contested.value).toBeLessThan(chemistry.value);
  });

  it("links neighbours of a settled eleven as pairs that get on", () => {
    const chemistry = chemistryOf(steady, CLUB);
    const good = chemistry.links.filter((link) => link.kind === "good");
    expect(good.length).toBeGreaterThan(3);
    for (const link of good) for (const id of link.playerIds) expect(chemistry.eleven).toContain(id);
  });

  it("falls with a captain without standing in the squad", () => {
    const chemistry = chemistryOf(steady, CLUB);
    const squad = squadOf(steady);
    const youngest = [...squad].sort((a, b) => a.age - b.age || a.strength - b.strength)[0];
    if (!youngest) throw new Error("empty squad");
    const named = nameCaptain(steady, CLUB, youngest.id);
    const withKid = chemistryOf(named, CLUB);
    expect(withKid.captain).toMatchObject({ playerId: youngest.id, isNamed: true });
    expect(withKid.captain?.standing ?? 100).toBeLessThan(chemistry.captain?.standing ?? 0);
    expect(reasonPoints(withKid, "captain")).toBeLessThan(0);
    expect(withKid.value).toBeLessThan(chemistry.value);
  });

  it("has the assistant suggest the player with the most standing when the coach names nobody", () => {
    const chemistry = chemistryOf(steady, CLUB);
    expect(chemistry.captain?.isNamed).toBe(false);
    for (const other of chemistry.candidates) expect(other.standing).toBeLessThanOrEqual(chemistry.captain?.standing ?? 0);
    expect(chemistry.candidates[0]?.playerId).toBe(chemistry.captain?.playerId);
  });

  it("gives an old idol more standing than a kid", () => {
    const chemistry = chemistryOf(steady, CLUB);
    const kid = [...squadOf(steady)].sort((a, b) => a.age - b.age)[0];
    if (!kid) throw new Error("empty squad");
    const idol = { ...kid, age: 34 };
    const history = { ...steady.history, players: { ...steady.history.players, [CLUB]: { ...steady.history.players[CLUB], [kid.id]: { name: kid.name, apps: 300, goals: 10 } } } };
    const crowned = chemistryOf({ ...steady, history, players: { ...steady.players, [kid.id]: idol } }, CLUB);
    expect(crowned.captain?.playerId).toBe(kid.id);
    expect(crowned.captain?.standing ?? 0).toBeGreaterThan(chemistry.candidates.find((c) => c.playerId === kid.id)?.standing ?? 100);
  });

  it("keeps the named captain until he leaves the club", () => {
    const captain = squadOf(steady)[3];
    if (!captain) throw new Error("a short squad");
    const named = nameCaptain(steady, CLUB, captain.id);
    expect(chemistryOf(advanceDay(named, {}).state, CLUB).captain?.playerId).toBe(captain.id);
    const gone = { ...named, players: { ...named.players, [captain.id]: { ...captain, clubId: "palmeiras-sp" } } };
    expect(chemistryOf(gone, CLUB).captain).toMatchObject({ isNamed: false });
    expect(chemistryOf(gone, CLUB).captain?.playerId).not.toBe(captain.id);
    const played = advanceDay(toMatchDay(gone), {}).state;
    expect(played.chemistry?.[CLUB]?.captainId).toBeUndefined();
  });

  it("refuses a captain from another club", () => {
    const other = squadOf(steady, "palmeiras-sp")[0];
    expect(() => nameCaptain(steady, CLUB, other?.id ?? "")).toThrow();
  });

  it("moves strength by 3% at most, at the meter's ends", () => {
    expect(chemistryStrength(100)).toBeCloseTo(1.03, 10);
    expect(chemistryStrength(0)).toBeCloseTo(0.97, 10);
    expect(chemistryStrength(50)).toBe(1);
  });

  it("moves a club's players by its meter, within 3% either way", () => {
    const context = { date: steady.date, pitch: "natural" as const };
    const squad = squadOf(steady);
    const neutralState: GameState = { ...steady, chemistry: {} };
    const neutral = playingStrength(neutralState, CLUB, context, squad);
    const best = playingStrength(steady, CLUB, context, squad);
    const players = { ...steady.players };
    for (const p of squad) players[p.id] = { ...p, condition: { ...p.condition, arrivedOn: steady.date } };
    const record = steady.chemistry?.[CLUB];
    if (!record) throw new Error("no chemistry kept");
    const kid = [...squad].sort((a, b) => a.age - b.age)[0]?.id ?? "";
    const worst: GameState = { ...steady, players, chemistry: { [CLUB]: { ...record, settled: -100, captainId: kid } } };
    const low = playingStrength(worst, CLUB, context, squad.map((p) => players[p.id] ?? p));
    expect(chemistryOf(worst, CLUB).value).toBeLessThan(30);
    for (const p of squad) {
      expect(best(p) / neutral(p)).toBeLessThanOrEqual(1.03 + 1e-9);
      expect(low(players[p.id] ?? p) / neutral(players[p.id] ?? p)).toBeGreaterThanOrEqual(0.97 - 1e-9);
    }
    expect(squad.some((p) => best(p) !== neutral(p))).toBe(true);
  });

  it("is the same in two runs from the same seed", () => {
    expect(chemistryOf(playMatches(0, 4), CLUB)).toEqual(chemistryOf(steady, CLUB));
    expect(steady.chemistry).toEqual(playMatches(0, 4).chemistry);
  });

  it("loads a save from before chemistry, starting the eleven's history neutral", () => {
    const old: GameState = { ...steady };
    delete old.chemistry;
    const loaded = loadGame(saveGame(old));
    const chemistry = chemistryOf(loaded, CLUB);
    expect(reasonPoints(chemistry, "settled")).toBe(0);
    expect(chemistry.value).toBeGreaterThan(0);
    const played = advanceDay(toMatchDay(loaded), {}).state;
    expect(played.chemistry?.[CLUB]?.eleven).toHaveLength(11);
  });
});

describe("chemistry and events", () => {
  const fight = EVENT_BANK.find((type) => type.id === "dressing-room-fight");
  if (!fight) throw new Error("no fight event");
  const lostToday = (state: GameState) => {
    const fixture = { id: "test", competitionId: "serie-a", stage: 0, date: state.date, homeId: CLUB, awayId: "palmeiras-sp", result: { homeGoals: 0, awayGoals: 2 } };
    return [fixture];
  };
  const sceneOf = (state: GameState, seed = 0.4): EventScene => {
    let s = seed;
    return { state, clubId: CLUB, squad: squadOf(state), date: state.date, played: lostToday(state), random: () => (s = (s * 9301 + 0.49297) % 1) };
  };

  it("casts the teammate a dressing-room fight was with", () => {
    const cast = fight.cast(sceneOf(start));
    expect(cast?.playerId).toBeDefined();
    expect(cast?.teammateId).toBeDefined();
    expect(cast?.teammateId).not.toBe(cast?.playerId);
    expect(start.players[cast?.teammateId ?? ""]?.clubId).toBe(CLUB);
  });

  it("counts two players who fought twice as one bad pair", () => {
    const [a = "", b = ""] = chemistryOf(start, CLUB).eleven;
    const log = [
      { typeId: "dressing-room-fight", date: start.date, clubId: CLUB, playerId: a, teammateId: b },
      { typeId: "dressing-room-fight", date: start.date, clubId: CLUB, playerId: b, teammateId: a },
    ];
    const fought = chemistryOf({ ...start, eventMemory: { log, pending: {}, news: [], rivalry: {} } }, CLUB);
    expect(fought.links.filter((link) => link.kind === "fight")).toHaveLength(1);
  });

  it("turns two players who fought into a bad pair", () => {
    const chemistry = chemistryOf(start, CLUB);
    const [a = "", b = ""] = chemistry.eleven;
    const log = [{ typeId: "dressing-room-fight", date: start.date, clubId: CLUB, playerId: a, teammateId: b, choice: 1 }];
    const fought = chemistryOf({ ...start, eventMemory: { log, pending: {}, news: [], rivalry: {} } }, CLUB);
    expect(fought.links).toContainEqual(expect.objectContaining({ kind: "fight", playerIds: [a, b].sort() }));
    expect(fought.value).toBeLessThan(chemistry.value);
  });

  it("makes a fight likelier when the chemistry is low", () => {
    const scene = sceneOf(start);
    const cast = fight.cast(scene);
    if (!cast) throw new Error("no cast");
    const weightOf = (state: GameState) => (typeof fight.weight === "function" ? fight.weight({ ...scene, state }, cast) : fight.weight);
    const record = { eleven: chemistryOf(start, CLUB).eleven, settled: -100, steadyGames: 0, kept: 0, was: 50 };
    expect(weightOf({ ...start, chemistry: { [CLUB]: record } })).toBeGreaterThan(weightOf(start));
  });
});
