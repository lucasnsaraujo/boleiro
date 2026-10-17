import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { matchPageAt } from "@boleiro/game-client/matchPage/matchPageAt";
import type { MatchPage, PageSide } from "@boleiro/game-client/matchPage/matchPageOf";
import { MatchSheet } from "./MatchSheet.js";

afterEach(cleanup);

const side = (id: string, shortName: string): PageSide => ({
  club: { id, shortName, colours: { primary: "#000000", secondary: "#ffffff" }, stadium: `${shortName} Arena` },
  formation: "4-4-2",
  starters: [],
  bench: [],
  place: null,
});

function pageWith(eggs: MatchPage["eggs"]): MatchPage {
  return {
    ref: "f1",
    isLive: false,
    isRetold: false,
    label: "Série A · 14ª rodada",
    competition: "Série A",
    date: "2026-07-12",
    home: side("fla", "Flamengo"),
    away: side("pal", "Palmeiras"),
    penaltyWinnerId: null,
    isAfterExtraTime: false,
    events: [],
    play: null,
    ratings: {},
    names: {},
    venue: { stadium: "Maracanã", crowd: null, gate: null },
    officials: { referee: null, hasVar: false },
    meetings: [],
    curiosities: ["Flamengo chega invicto há 5 jogos."],
    eggs,
  };
}

const show = (page: MatchPage) => render(<MatchSheet page={page} view={matchPageAt(page, 90)} isLeaving={false} onBack={() => undefined} onClose={() => undefined} />);

test("the ficha's summary tapes the match's eggs under Almanaque, ahead of its curiosities", () => {
  const ghost = { eggId: "sobrenatural", title: "Sobrenatural de Almeida", rarity: "rare" as const, look: "sticker" as const, text: "Três bolas na trave do Flamengo." };
  show(pageWith([ghost]));
  const notes = screen.getByRole("complementary", { name: "Curiosidades" });
  const almanac = within(notes).getByRole("note", { name: "Almanaque: Sobrenatural de Almeida" });
  expect(almanac.textContent).toContain("Três bolas na trave do Flamengo.");
  expect(within(notes).getAllByRole("note")[0]).toBe(almanac);
});

test("a match without eggs keeps its curiosities alone", () => {
  show(pageWith([]));
  expect(within(screen.getByRole("complementary", { name: "Curiosidades" })).queryByRole("note", { name: /^Almanaque/ })).toBeNull();
});
