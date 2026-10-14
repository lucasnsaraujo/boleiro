import { describe, expect, test } from "vitest";
import { pickLineup } from "@boleiro/engine/engine/match";
import type { GameState, SimPlayer } from "@boleiro/engine/sim/gameState";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { needsWindow, requestOptions } from "./coachRequests.js";

const COACH = "sport-pe";
const game = newGameFromFiles(5, { coachClubId: COACH }, bundledGameFiles);
const squadOf = (state: GameState, clubId: string) => Object.values(state.players).filter((p) => p.clubId === clubId);
const withPlayer = (state: GameState, player: SimPlayer): GameState => ({ ...state, players: { ...state.players, [player.id]: player } });
const labels = (state: GameState, playerId: string) => requestOptions(state, playerId).map((o) => o.label);

function firstOf(clubId: string, pick: (p: SimPlayer) => boolean = () => true): SimPlayer {
  const found = squadOf(game, clubId).find(pick);
  if (!found) throw new Error(`no player at ${clubId}`);
  return found;
}

/** A Série A reserve far from the end of his contract: Sport, in Série B, can buy him or ask for him on loan. */
const reserve = (() => {
  const squad = squadOf(game, "palmeiras-sp");
  const lineup = new Set(pickLineup([...squad]).map((p) => p.id));
  const found = squad.find((p) => !lineup.has(p.id));
  if (!found) throw new Error("no reserve");
  return { ...found, contractUntil: "2029-12-31" };
})();
const longContract = (state: GameState) => withPlayer(state, reserve);

describe("the requests the coach can make for a player", () => {
  test("a player at another club with years left is bought, and a bigger club's reserve can also be borrowed", () => {
    expect(requestOptions(longContract(game), reserve.id)).toEqual([
      { label: "Comprar", request: { kind: "sign", playerId: reserve.id } },
      { label: "Pedir empréstimo", request: { kind: "loanIn", playerId: reserve.id } },
    ]);
  });

  test("a club at the coach's own level does not lend, so only buying is offered", () => {
    const rival = { ...firstOf("ceara-ce"), contractUntil: "2029-12-31" };
    expect(labels(withPlayer(game, rival), rival.id)).toEqual(["Comprar"]);
  });

  test("a player in his contract's last six months gets a pre-contract", () => {
    const ending = { ...firstOf("vitoria-ba"), contractUntil: "2026-06-30" };
    expect(requestOptions(withPlayer(game, ending), ending.id)).toEqual([{ label: "Pré-contrato", request: { kind: "sign", playerId: ending.id } }]);
  });

  test("a free agent is signed", () => {
    const free = { ...firstOf("vitoria-ba"), id: "free-1" };
    const state = { ...game, market: { ...game.market, freeAgents: { [free.id]: free } } };
    expect(requestOptions(state, free.id)).toEqual([{ label: "Contratar", request: { kind: "sign", playerId: free.id } }]);
  });

  test("the coach's own player is renewed for the years asked, sold, or lent while young", () => {
    const young = { ...firstOf(COACH), age: 19 };
    expect(requestOptions(withPlayer(game, young), young.id, 3)).toEqual([
      { label: "Renovar", request: { kind: "renew", playerId: young.id, years: 3 } },
      { label: "Vender", request: { kind: "sell", playerId: young.id } },
      { label: "Emprestar", request: { kind: "loanOut", playerId: young.id } },
    ]);
    const veteran = { ...young, age: 30 };
    expect(labels(withPlayer(game, veteran), veteran.id)).toEqual(["Renovar", "Vender"]);
  });

  test("a player on loan here with a purchase clause can be bought", () => {
    const loanee = { ...firstOf("vitoria-ba"), clubId: COACH };
    const clause = { fromClubId: "vitoria-ba", until: "2026-06-30", lenderWageShare: 0.5, buyOption: 2_000_000 };
    const loans = { [loanee.id]: clause };
    const state = { ...withPlayer(game, loanee), market: { ...game.market, loans } };
    expect(requestOptions(state, loanee.id)).toEqual([{ label: "Comprar", request: { kind: "sign", playerId: loanee.id } }]);
    expect(requestOptions({ ...state, market: { ...state.market, loans: { [loanee.id]: { ...clause, buyOption: null } } } }, loanee.id)).toEqual([]);
  });

  test("an own player who signed a pre-contract elsewhere can't be renewed", () => {
    const leaving = { ...firstOf(COACH), age: 30 };
    const state = { ...withPlayer(game, leaving), market: { ...game.market, preContracts: { [leaving.id]: "palmeiras-sp" } } };
    expect(labels(state, leaving.id)).toEqual(["Vender"]);
  });

  test("nothing can be asked for a player on loan or one who already signed elsewhere", () => {
    const lent = firstOf("vitoria-ba");
    const loans = { [lent.id]: { fromClubId: "palmeiras-sp", until: "2026-06-30", lenderWageShare: 0.5, buyOption: null } };
    expect(requestOptions({ ...game, market: { ...game.market, loans } }, lent.id)).toEqual([]);
    const preContracts = { [lent.id]: "palmeiras-sp" };
    expect(requestOptions({ ...game, market: { ...game.market, preContracts } }, lent.id)).toEqual([]);
    expect(requestOptions(game, "nobody")).toEqual([]);
  });
});

describe("which requests wait for the transfer window", () => {
  test("buying, selling and loans need it; renewals, free agents and pre-contracts do not", () => {
    const own = firstOf(COACH);
    const ending = { ...firstOf("vitoria-ba"), contractUntil: "2026-06-30" };
    const free = { ...firstOf("vitoria-ba"), id: "free-1" };
    const state = { ...withPlayer(longContract(game), ending), market: { ...game.market, freeAgents: { [free.id]: free } } };
    expect(needsWindow(state, { kind: "sign", playerId: reserve.id })).toBe(true);
    expect(needsWindow(state, { kind: "loanIn", playerId: reserve.id })).toBe(true);
    expect(needsWindow(state, { kind: "sell", playerId: own.id })).toBe(true);
    expect(needsWindow(state, { kind: "loanOut", playerId: own.id })).toBe(true);
    expect(needsWindow(state, { kind: "renew", playerId: own.id, years: 2 })).toBe(false);
    expect(needsWindow(state, { kind: "sign", playerId: ending.id })).toBe(false);
    expect(needsWindow(state, { kind: "sign", playerId: free.id })).toBe(false);
  });
});
