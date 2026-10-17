import { describe, expect, it } from "vitest";
import type { GoalKind } from "@boleiro/engine/sim/live/goalDetails";
import type { MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import { matchPageAt } from "@boleiro/game-client/matchPage/matchPageAt";
import type { MatchPage, PageSide } from "@boleiro/game-client/matchPage/matchPageOf";
import { clockLabel } from "./matchFileParts.js";
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
    isAfterExtraTime: false,
    events,
    play: null,
    ratings: {},
    names: { pedro: "Pedro", arrasca: "Arrascaeta", roque: "Vitor Roque", bh: "Bruno Henrique" },
    venue: { stadium: "Maracanã", crowd: 61233, gate: 4_800_000 },
    officials: { referee: null, hasVar: false },
    meetings: [],
    curiosities: [],
    eggs: [],
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

  it("calls a two-goal win comfortable, leaving the beaten side and the score to the report beneath", () => {
    const page = pageOf([goal(10, "pal", "roque"), goal(20, "pal", "x")]);
    expect(story(page).headline).toBe("Palmeiras vence com folga fora de casa");
    expect(story(page).report[0]).toBe("Palmeiras vence Flamengo por 2 a 0 no Maracanã.");
  });

  it("credits a draw to whoever scored its last goal, and leaves the score to the report", () => {
    const page = pageOf([goal(3, "pal", "roque"), goal(72, "fla", "pedro")]);
    expect(story(page).headline).toBe("Pedro garante o empate");
    expect(story(page).report[0]).toBe("Flamengo e Palmeiras empatam em 1 a 1 no Maracanã.");
    expect(story(pageOf([])).report[0]).toBe("Nenhum gol no Maracanã.");
  });

  it("tells the goals in order, with their minutes, kinds and passes, and the table move", () => {
    const { report } = story(pageOf([goal(23, "fla", "pedro", "header", "arrasca"), goal(51, "pal", "roque", "penalty"), goal(88, "fla", "bh")]));
    expect(report).toEqual([
      "Flamengo vence Palmeiras por 2 a 1 no Maracanã e sobe do 5º para o 3º lugar.",
      "Pedro abriu o placar aos 23', de cabeça, depois de passe de Arrascaeta. Vitor Roque empatou aos 51', de pênalti. Bruno Henrique fez o gol da vitória aos 88'.",
    ]);
  });

  it("says a match was won in extra time, or went through it to penalties", () => {
    const whistles: MatchEvent[] = [{ type: "extraHalfTime", minute: 105 }, { type: "extraTimeEnd", minute: 120 }];
    const wonLate = pageOf([goal(30, "fla", "pedro"), goal(70, "pal", "roque"), goal(112, "fla", "bh"), ...whistles], { isAfterExtraTime: true });
    expect(story(wonLate).headline).toBe("Bruno Henrique decide na prorrogação");
    expect(story(wonLate).report[0]).toBe("Flamengo vence Palmeiras por 2 a 1 na prorrogação no Maracanã e sobe do 5º para o 3º lugar.");
    const shootout = pageOf([goal(30, "fla", "pedro"), goal(70, "pal", "roque"), ...whistles], { isAfterExtraTime: true, penaltyWinnerId: "pal" });
    expect(story(shootout).report[0]).toBe("Flamengo e Palmeiras empatam em 1 a 1 no Maracanã depois da prorrogação, e Palmeiras passa nos pênaltis.");
    expect(clockLabel(wonLate, matchPageAt(wonLate, 120))).toBe("Encerrado · prorrogação");
    expect(clockLabel(shootout, matchPageAt(shootout, 120))).toBe("Encerrado · prorrogação e pênaltis");
  });
});
