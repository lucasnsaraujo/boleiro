import { describe, expect, it } from "vitest";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { developPlayers } from "../players/developPlayers.js";
import { SQUAD_CAP } from "../transfers/squadCap.js";
import { academySquad, LEAVING_AGE, scoutedStars, starsOf, YOUTH_AGES } from "./academy.js";
import { copinhaRun, playCopinha } from "./copinha.js";
import { fillShortSquads } from "./fillShortSquads.js";
import { citiesOf } from "./hometowns.js";
import { promoteProspect, releaseProspect, sellProspect } from "./moveProspect.js";
import { turnOverAcademies } from "./turnOverAcademies.js";

const COACH = "flamengo-rj";
const start = loadNewGame(4, { coachClubId: COACH });
const youth = start.youth;
const prospects = Object.values(youth?.prospects ?? {});
const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1);
const academyOf = (state: GameState, clubId: string) => academySquad(state.youth, clubId);
const smallestNational = Object.values(start.clubs).filter((c) => c.division === "D").sort((a, b) => a.fanbase - b.fanbase)[0];

describe("a new game's academies", () => {
  it("gives every club in a national division an academy of kids aged 16 to 20, and state-only clubs none", () => {
    for (const club of Object.values(start.clubs)) {
      const kids = academyOf(start, club.id);
      if (club.division === null) expect(kids).toEqual([]);
      else expect(kids.length).toBeGreaterThanOrEqual(8);
    }
    expect(prospects.every((p) => p.age >= YOUTH_AGES.min && p.age <= YOUTH_AGES.max)).toBe(true);
  });

  it("makes a big club's academy larger and more promising than a small Série D club's", () => {
    if (!smallestNational) throw new Error("no Série D club");
    const big = academyOf(start, COACH);
    const small = academyOf(start, smallestNational.id);
    expect(big.length).toBeGreaterThan(small.length);
    expect(mean(big.map((p) => p.potential)) - mean(small.map((p) => p.potential))).toBeGreaterThan(15);
  });

  it("plays its kids below the pros of their age and below their own potential", () => {
    const pros17 = Object.values(start.players).filter((p) => p.clubId === COACH && p.age <= 19);
    const kids = academyOf(start, COACH);
    expect(kids.every((p) => p.strength < p.potential)).toBe(true);
    expect(mean(kids.map((p) => p.strength))).toBeLessThan(mean(pros17.map((p) => p.strength)));
  });

  it("finds most of a club's kids in its own state", () => {
    const fromRio = new Set(citiesOf("RJ"));
    const kids = prospects.filter((p) => start.clubs[p.clubId]?.state === "RJ");
    expect(kids.filter((p) => fromRio.has(p.hometown)).length / kids.length).toBeGreaterThan(0.65);
    expect(prospects.every((p) => p.name.length > 0)).toBe(true);
  });
});

describe("the scouts' stars", () => {
  it("always hold the kid's true stars and narrow each season until they are exact", () => {
    for (const p of prospects) {
      for (const season of [p.joinedSeason, p.joinedSeason + 1, p.joinedSeason + 2]) {
        const { low, high } = scoutedStars(p, season);
        expect(low).toBeLessThanOrEqual(starsOf(p.potential));
        expect(high).toBeGreaterThanOrEqual(starsOf(p.potential));
        expect(high - low).toBeLessThanOrEqual(Math.max(0, 2 - (season - p.joinedSeason)));
      }
      expect(scoutedStars(p, p.joinedSeason + 2)).toEqual({ low: starsOf(p.potential), high: starsOf(p.potential) });
    }
  });

  it("gives a first look wider than one star to some kids", () => {
    const fresh = prospects.filter((p) => p.joinedSeason === start.season);
    expect(fresh.some((p) => scoutedStars(p, start.season).high - scoutedStars(p, start.season).low === 2)).toBe(true);
  });
});

describe("the academies at the season's turn", () => {
  const atTurn: GameState = { ...start, date: `${start.season + 1}-01-01` };
  const { state: turned, events } = turnOverAcademies(atTurn);
  const after = Object.values(turned.youth?.prospects ?? {});

  it("leaves nobody of 21 in any academy: each 20-year-old is promoted into his squad or released", () => {
    expect(after.every((p) => p.age < LEAVING_AGE)).toBe(true);
    const leaving = prospects.filter((p) => p.age === YOUTH_AGES.max);
    for (const p of leaving) {
      const promoted = turned.players[p.id];
      const released = events.some((e) => e.type === "prospectReleased" && e.prospectId === p.id);
      expect(promoted?.clubId === p.clubId || released).toBe(true);
    }
    expect(events.some((e) => e.type === "youthPromoted" && turned.players[e.playerId]?.potential !== undefined)).toBe(true);
    expect(events.some((e) => e.type === "prospectReleased")).toBe(true);
  });

  it("ages the kids who stay and holds trials that bring two to four 16-year-olds to each academy", () => {
    const stayed = prospects.filter((p) => p.age < YOUTH_AGES.max);
    expect(stayed.every((p) => turned.youth?.prospects[p.id]?.age === p.age + 1)).toBe(true);
    const trials = events.flatMap((e) => (e.type === "youthTrialsHeld" ? [e] : []));
    expect(trials.length).toBe(Object.values(start.clubs).filter((c) => c.division !== null).length);
    for (const trial of trials) {
      expect(trial.prospectIds.length).toBeGreaterThanOrEqual(2);
      expect(trial.prospectIds.length).toBeLessThanOrEqual(4);
      expect(trial.prospectIds.every((id) => turned.youth?.prospects[id]?.age === YOUTH_AGES.min)).toBe(true);
    }
  });

  it("decides on the coach's 21-year-olds too", () => {
    const ours = prospects.filter((p) => p.clubId === COACH && p.age === YOUTH_AGES.max);
    expect(ours.length).toBeGreaterThan(0);
    expect(ours.every((p) => !turned.youth?.prospects[p.id])).toBe(true);
  });

  it("opens academies for a save from before them", () => {
    const opened = turnOverAcademies({ ...atTurn, youth: undefined }).state;
    expect(academyOf(opened, COACH).length).toBeGreaterThan(0);
  });

  it("lets a squad short of players take its academy's kids before inventing new ones", () => {
    // Only twelve players left: the squad drops below 18 and fills up.
    const kept = Object.values(turned.players).filter((p) => p.clubId === COACH && p.group !== "DEF").sort((a, b) => b.strength - a.strength).slice(0, 12);
    const thinned = Object.fromEntries(Object.entries(turned.players).filter(([, p]) => p.clubId !== COACH || kept.includes(p)));
    const developed = developPlayers({ ...turned, players: thinned });
    const newcomers = Object.values(developed.state.players).filter((p) => p.clubId === COACH && !thinned[p.id]);
    const fromAcademy = newcomers.filter((p) => turned.youth?.prospects[p.id]);
    expect(fromAcademy.length).toBeGreaterThan(0);
    expect(fromAcademy.every((p) => p.potential !== undefined && !developed.state.youth?.prospects[p.id])).toBe(true);
  });
});

describe("squads the market left short", () => {
  const stateOnly = Object.values(start.clubs).find((c) => c.division === null);
  if (!stateOnly) throw new Error("no state-only club");
  const keepTwelve = (clubId: string) => new Set(Object.values(start.players).filter((p) => p.clubId === clubId).sort((a, b) => b.strength - a.strength).slice(0, 12).map((p) => p.id));
  const kept = new Set([...keepTwelve(COACH), ...keepTwelve(stateOnly.id)]);
  const thinned: GameState = { ...start, players: Object.fromEntries(Object.entries(start.players).filter(([id, p]) => (p.clubId !== COACH && p.clubId !== stateOnly.id) || kept.has(id))) };
  const { state, events } = fillShortSquads(thinned);
  const squadOf = (clubId: string) => Object.values(state.players).filter((p) => p.clubId === clubId);

  it("tops every squad back up to 18, from the academy's teenagers where it has one", () => {
    expect(squadOf(COACH)).toHaveLength(18);
    expect(squadOf(stateOnly.id)).toHaveLength(18);
    const fromAcademy = squadOf(COACH).filter((p) => start.youth?.prospects[p.id]);
    expect(fromAcademy.length).toBeGreaterThan(0);
    expect(fromAcademy.every((p) => p.age >= 17 && p.age <= 19 && !state.youth?.prospects[p.id])).toBe(true);
    expect(events.filter((e) => e.type === "youthPromoted")).toHaveLength(12);
  });

  it("invents teenagers for a club without an academy, and leaves full squads alone", () => {
    expect(squadOf(stateOnly.id).filter((p) => !start.players[p.id]).every((p) => p.potential === undefined && p.wage > 0)).toBe(true);
    expect(fillShortSquads(start).state).toBe(start);
  });
});

describe("the coach's moves on his academy", () => {
  const kid = academyOf(start, COACH)[0];
  const otherKid = prospects.find((p) => p.clubId !== COACH);
  if (!kid || !otherKid) throw new Error("no kids");

  it("promotes a kid into his squad on a first contract and out of the academy", () => {
    const { state, refusal } = promoteProspect(start, kid.id);
    expect(refusal).toBeNull();
    const player = state.players[kid.id];
    expect(player).toMatchObject({ clubId: COACH, name: kid.name, strength: kid.strength, potential: kid.potential, age: kid.age });
    expect(player?.wage).toBeGreaterThan(0);
    expect((player?.contractUntil ?? "") > start.date).toBe(true);
    expect(state.youth?.prospects[kid.id]).toBeUndefined();
  });

  it("refuses a promotion when the squad is at the registration cap, and another club's kid", () => {
    const filler = Object.values(start.players).find((p) => p.clubId === COACH);
    if (!filler) throw new Error("no player");
    const crowded = { ...start.players };
    const size = Object.values(start.players).filter((p) => p.clubId === COACH).length;
    for (let i = size; i < SQUAD_CAP; i++) crowded[`extra-${i}`] = { ...filler, id: `extra-${i}` };
    expect(promoteProspect({ ...start, players: crowded }, kid.id).refusal).toBe("squadFull");
    expect(promoteProspect(start, otherKid.id).refusal).toBe("notYours");
  });

  it("releases a kid out of the game", () => {
    const { state } = releaseProspect(start, kid.id);
    expect(state.youth?.prospects[kid.id]).toBeUndefined();
    expect(state.players[kid.id]).toBeUndefined();
  });

  it("sells a kid to another club for a fee booked as a player sale", () => {
    const sold = sellProspect(start, kid.id);
    expect(sold.refusal).toBeNull();
    if (!sold.sale) throw new Error("no sale");
    expect(sold.sale.buyerId).not.toBe(COACH);
    expect(sold.sale.fee).toBeGreaterThan(0);
    expect(sold.state.players[kid.id]?.clubId).toBe(sold.sale.buyerId);
    expect(sold.state.finances[COACH]?.month.revenue.playerSales).toBe((start.finances[COACH]?.month.revenue.playerSales ?? 0) + sold.sale.fee);
    expect(sold.state.finances[sold.sale.buyerId]?.cash).toBe((start.finances[sold.sale.buyerId]?.cash ?? 0) - sold.sale.fee);
    expect(sold.state.youth?.prospects[kid.id]).toBeUndefined();
  });
});

describe("the Copinha", () => {
  const { state, events } = playCopinha(start);
  const copinha = state.youth?.copinha;

  it("plays a knockout of 64 academies to one champion, the coach's academy among them", () => {
    if (!copinha) throw new Error("no Copinha");
    expect(copinha.matches.length).toBe(63);
    expect(copinha.matches.filter((m) => m.round === 0).length).toBe(32);
    expect(events).toEqual([{ type: "copinhaPlayed", season: start.season, championId: copinha.championId }]);
    const run = copinhaRun(copinha, COACH);
    expect(run).not.toBeNull();
    expect(run?.isChampion).toBe(copinha.championId === COACH);
  });

  it("decides every level match on penalties", () => {
    expect(copinha?.matches.every((m) => (m.homeGoals === m.awayGoals) === (m.penaltyWinnerId !== undefined))).toBe(true);
  });

  it("leaves the senior game alone", () => {
    expect(state.rngState).toBe(start.rngState);
    expect(state.players).toBe(start.players);
  });
});
