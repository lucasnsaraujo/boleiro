import { describe, expect, it } from "vitest";
import type { GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { openDraft } from "./movePlayer.js";
import { signFromAbroad } from "./signFromAbroad.js";
import { squadNeeds, REPLACEMENT_BAND } from "./squadNeeds.js";
import { isBrazilian } from "./willingToJoin.js";
import { REALISTA } from "../formats.js";
import { loadEurope } from "../world/loadEurope.js";
import { loadSouthAmerica } from "../world/loadSouthAmerica.js";

const start = loadNewGame(5, { coachClubId: null });
const BUYER = "bahia-ba";
const squadOf = (state: GameState, clubId: string) => Object.values(state.players).filter((p) => p.clubId === clubId);

/** A market day on which only `BUYER` can sign, with money for anyone, its squad made to `squad`. */
function marketDay(squad: (players: SimPlayer[]) => SimPlayer[]): GameState {
  const kept = squad(squadOf(start, BUYER));
  const players = Object.fromEntries([...Object.values(start.players).filter((p) => p.clubId !== BUYER), ...kept].map((p) => [p.id, p]));
  const finance = start.finances[BUYER];
  if (!finance) throw new Error("no buyer");
  return { ...start, date: "2026-01-10", players, finances: { [BUYER]: { ...finance, cash: 1e12, transferBudget: 1e12, wageCap: 1e12 } } };
}

/** The players the buyer signs from abroad on that day, every draw at its lowest (so he always looks and the player always says yes). */
function signed(state: GameState): SimPlayer[] {
  let serial = 0;
  const day = signFromAbroad(openDraft(state), () => 0, () => `abroad-${serial++}`);
  return day.events.flatMap((e) => (e.toClubId === BUYER ? [day.state.players[e.playerId]].filter((p): p is SimPlayer => !!p) : []));
}

const withForeigners = (count: number) => (players: SimPlayer[]) => {
  const brazilians = players.filter((p) => isBrazilian(p.nationalities));
  const foreign = players.filter((p) => !isBrazilian(p.nationalities)).slice(0, count);
  const extra = brazilians.slice(0, Math.max(0, count - foreign.length)).map((p) => ({ ...p, nationalities: ["Uruguay"] }));
  return [...brazilians.slice(extra.length), ...foreign, ...extra];
};

describe("signing from abroad", () => {
  it("brings a Série A club with fewer than nine foreigners a foreigner, from where Série A's foreigners come", () => {
    const [player] = signed(marketDay(withForeigners(3)));
    expect(player).toBeDefined();
    expect(isBrazilian(player?.nationalities ?? [])).toBe(false);
    expect(["Argentina", "Uruguay", "Colombia", "Paraguay", "Ecuador"]).toContain(player?.nationalities[0]);
  });

  it("brings a Série A club with nine foreigners, the most it can name for a match, a Brazilian coming home", () => {
    const [player] = signed(marketDay(withForeigners(9)));
    expect(player?.nationalities).toEqual(["Brazil"]);
  });

  it("keeps the nine-foreigner rule to Série A: a top club abroad still brings home Brazilians", () => {
    const english = loadNewGame(1, { coachClubId: "tm-11", world: [...loadSouthAmerica(2026), ...loadEurope(2026)], formats: REALISTA });
    const club = Object.values(english.clubs).find((c) => c.abroad?.level === 0 && c.id !== "tm-11" && english.finances[c.id]);
    const finance = club && english.finances[club.id];
    if (!club || !finance) throw new Error("no AI club in England's top flight");
    const day: GameState = { ...english, date: "2026-07-20", finances: { [club.id]: { ...finance, cash: 1e12, transferBudget: 1e12, wageCap: 1e12 } } };
    let serial = 0;
    const done = signFromAbroad(openDraft(day), () => 0, () => `abroad-${serial++}`);
    const [moved] = done.events;
    expect(moved?.toClubId).toBe(club.id);
    expect(done.state.players[moved?.playerId ?? ""]?.nationalities).toEqual(["Brazil"]);
  });

  it("brings a short squad a replacement for its thinnest group near the middle of its squad, as a signing at home would be", () => {
    const short = (players: SimPlayer[]) => withForeigners(3)(players).sort((a, b) => b.strength - a.strength).slice(0, 24);
    const state = marketDay(short);
    const needs = squadNeeds(squadOf(state, BUYER), "A");
    expect(needs.short).toBeGreaterThan(0);
    const [player] = signed(state);
    expect(player?.group).toBe(needs.thinnest);
    expect(player?.strength).toBeGreaterThanOrEqual(needs.middle - REPLACEMENT_BAND.below);
    expect(player?.strength).toBeLessThanOrEqual(needs.middle + REPLACEMENT_BAND.above);
  });
});
