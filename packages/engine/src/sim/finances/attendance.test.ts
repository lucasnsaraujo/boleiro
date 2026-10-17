import { describe, expect, it } from "vitest";
import type { ClubFinance, Fixture, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { rivalsOf } from "../morale/rivalsOf.js";
import { attendance } from "./recordMatchFinances.js";
import { tierOf } from "./tierOf.js";

const start = loadNewGame(4, { coachClubId: null });

function present<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`no ${what}`);
  return value;
}

const HOST = "flamengo-rj";
const rival = [...(rivalsOf(start.clubs).get(HOST) ?? [])][0];
if (!rival) throw new Error(`${HOST} has no rivals`);
const stranger = Object.values(start.clubs).find((c) => c.division === "A" && c.state !== start.clubs[HOST]?.state);
if (!stranger) throw new Error("no Série A club from another state");

/** The host with a stadium big enough that the crowd never hits the seats. */
const host = present(start.clubs[HOST], HOST);
const roomy: GameState = { ...start, clubs: { ...start.clubs, [HOST]: { ...host, capacity: 10_000_000 } } };
const finance = present(roomy.finances[HOST], `${HOST} finances`);
const average = roomy.economy.matchday[tierOf(host)].price;
const at = (price: number): ClubFinance => ({ ...finance, ticketPrice: price });
const gate = (price: number) => attendance(roomy, at(price), HOST, stranger.id) * price;

describe("the crowd at a home game", () => {
  it("pays most at a price a little above the division's average, not at the highest price", () => {
    const ratios = Array.from({ length: 51 }, (_, i) => 0.5 + i * 0.05);
    const best = ratios.reduce((top, ratio) => (gate(average * ratio) > gate(average * top) ? ratio : top));
    expect(best).toBeGreaterThanOrEqual(1.2);
    expect(best).toBeLessThanOrEqual(1.4);
    expect(gate(average * 3)).toBeLessThan(gate(average) / 2);
  });

  it("comes in bigger numbers when tickets are cheaper", () => {
    expect(attendance(roomy, at(average / 2), HOST, stranger.id)).toBeGreaterThan(attendance(roomy, at(average), HOST, stranger.id));
  });

  it("never fills more than the seats it can sell", () => {
    expect(attendance(start, { ...finance, ticketPrice: 1 }, HOST, stranger.id)).toBeLessThanOrEqual(host.capacity);
  });

  it("grows for a derby against a rival of the same size as a stranger", () => {
    const twin: GameState = { ...roomy, clubs: { ...roomy.clubs, [stranger.id]: { ...stranger, fanbase: present(roomy.clubs[rival], rival).fanbase } } };
    expect(attendance(twin, finance, HOST, rival)).toBeGreaterThan(attendance(twin, finance, HOST, stranger.id));
  });

  it("grows more for a bigger derby: the Derby Paulista outdraws Palmeiras' Clássico da Saudade with Santos", () => {
    const palmeiras = present(roomy.clubs["palmeiras-sp"], "palmeiras-sp");
    const corinthians = present(roomy.clubs["corinthians-sp"], "corinthians-sp");
    const santos = present(roomy.clubs["santos-sp"], "santos-sp");
    const twins: GameState = { ...roomy, clubs: { ...roomy.clubs, "palmeiras-sp": { ...palmeiras, capacity: 10_000_000 }, "santos-sp": { ...santos, fanbase: corinthians.fanbase } } };
    const home = present(twins.finances["palmeiras-sp"], "palmeiras-sp finances");
    expect(attendance(twins, home, "palmeiras-sp", "corinthians-sp")).toBeGreaterThan(attendance(twins, home, "palmeiras-sp", "santos-sp"));
  });

  it("grows for a knockout tie and more for a final", () => {
    const cup = Object.values(roomy.competitions).find((c) => c.kind === "cup");
    if (!cup) throw new Error("no cup in the game");
    const lastStage = cup.stageDates.length - 1;
    const game = (stage: number): Fixture => ({ id: "x", competitionId: cup.id, stage, date: roomy.date, homeId: HOST, awayId: stranger.id, result: null });
    const league = attendance(roomy, finance, HOST, stranger.id);
    const knockout = attendance(roomy, finance, HOST, stranger.id, game(0));
    const final = attendance(roomy, finance, HOST, stranger.id, game(lastStage));
    expect(knockout).toBeGreaterThan(league);
    expect(final).toBeGreaterThan(knockout);
  });
});
