import { describe, expect, it } from "vitest";
import type { GoalKind } from "@boleiro/engine/sim/live/goalDetails";
import type { MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import { matchPageAt } from "@boleiro/game-client/matchPage/matchPageAt";
import type { MatchPage, PageSide } from "@boleiro/game-client/matchPage/matchPageOf";
import { headlineOf, reportOf } from "./matchStory.js";

const side = (id: string, shortName: string, place: PageSide["place"] = null): PageSide => ({
  club: { id, shortName, colours: { primary: "#000000", secondary: "#ffffff" }, stadium: `${shortName} Arena` },
  formation: "4-4-2",
  starters: [],
  bench: [],
  place,
});
const goal = (minute: number, clubId: string, playerId: string, kind: GoalKind = "openPlay", assistId?: string): MatchEvent => ({
  type: "goal",
  minute,
  clubId,
  playerId,
  kind,
  ...(assistId ? { assistId } : {}),
});

function pageOf(events: MatchEvent[], change: Partial<MatchPage> = {}): MatchPage {
  return {
    ref: "f1",
    isLive: false,
    isRetold: false,
    label: "Série A · 14ª rodada",
    competition: "Série A",
    date: "2026-07-12",
    home: side("fla", "Flamengo", { before: 5, after: 3 }),
    away: side("pal", "Palmeiras", { before: 2, after: 2 }),
    penaltyWinnerId: null,
    events,
    play: null,
    ratings: {},
    names: { pedro: "Pedro", arrasca: "Arrascaeta", roque: "Vitor Roque", bh: "Bruno Henrique" },
    venue: { stadium: "Maracanã", crowd: 61233, gate: 4_800_000 },
    meetings: [],
    curiosities: [],
    ...change,
  };
}

const story = (page: MatchPage) => ({ headline: headlineOf(page, matchPageAt(page, 90)), report: reportOf(page, matchPageAt(page, 90)) });

describe("the newspaper's account of a match", () => {
  it("credits a one-goal win to whoever scored the goal that won it, and how he scored it", () => {
    const page = pageOf([goal(23, "fla", "pedro", "header", "arrasca"), goal(51, "pal", "roque", "penalty"), goal(88, "fla", "bh")]);
    expect(story(page).headline).toBe("Bruno Henrique decide");
    const header = pageOf([goal(23, "fla", "pedro", "header", "arrasca")]);
    expect(story(header).headline).toBe("Pedro decide de cabeça");
  });

  it("calls a win by three or more a rout, and a goalless draw by its score", () => {
    expect(story(pageOf([goal(10, "pal", "roque"), goal(20, "pal", "roque"), goal(30, "pal", "roque"), goal(40, "pal", "roque")])).headline).toBe("Vitor Roque faz quatro");
    expect(story(pageOf([goal(10, "pal", "roque"), goal(20, "pal", "x"), goal(30, "pal", "y")])).headline).toBe("Palmeiras goleia Flamengo fora de casa");
    expect(story(pageOf([])).headline).toBe("Flamengo e Palmeiras ficam no 0 a 0");
  });

  it("tells the goals in order, with their minutes, kinds and passes, and the table move", () => {
    const { report } = story(pageOf([goal(23, "fla", "pedro", "header", "arrasca"), goal(51, "pal", "roque", "penalty"), goal(88, "fla", "bh")]));
    expect(report).toEqual([
      "Flamengo vence Palmeiras por 2 a 1 no Maracanã e sobe do 5º para o 3º lugar.",
      "Pedro abriu o placar aos 23', de cabeça, depois de passe de Arrascaeta. Vitor Roque empatou aos 51', de pênalti. Bruno Henrique fez o gol da vitória aos 88'.",
    ]);
  });
});
