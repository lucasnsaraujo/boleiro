import { describe, expect, it } from "vitest";
import { inMatchOrder } from "@boleiro/engine/sim/live/matchTimeline";
import { matchPageAt } from "./matchPageAt.js";
import type { MatchPage, PageSide } from "./matchPageOf.js";

const colours = { primary: "#000000", secondary: "#ffffff" };
const side = (id: string): PageSide => ({ club: { id, shortName: id, colours, stadium: `Estádio ${id}` }, formation: "4-4-2", starters: [], bench: [], place: null });
const page = (isLive: boolean): MatchPage => ({
  ref: "f",
  isLive,
  isRetold: false,
  label: "Copa do Brasil · Final",
  competition: "Copa do Brasil",
  date: "2026-12-06",
  home: side("fla"),
  away: side("pal"),
  penaltyWinnerId: null,
  isAfterExtraTime: true,
  events: inMatchOrder([
    { type: "goal", minute: 30, clubId: "fla", playerId: "f9" },
    { type: "goal", minute: 70, clubId: "pal", playerId: "p9" },
    { type: "goal", minute: 112, clubId: "fla", playerId: "f10" },
    { type: "halfTime", minute: 45 },
    { type: "fullTime", minute: 90 },
    { type: "extraHalfTime", minute: 105 },
    { type: "extraTimeEnd", minute: 120 },
  ]),
  play: null,
  ratings: {},
  names: {},
  venue: { stadium: null, crowd: null, gate: null },
  officials: { referee: null, hasVar: false },
  meetings: [],
  curiosities: [],
});

describe("the match page of a match that went to extra time", () => {
  it("follows the clock past ninety minutes, and is over only at 120", () => {
    const at100 = matchPageAt(page(true), 100);
    expect(at100).toMatchObject({ minute: 100, isOver: false, end: 120, score: { home: 1, away: 1 } });
    expect(matchPageAt(page(true), 120)).toMatchObject({ minute: 120, isOver: true, score: { home: 2, away: 1 } });
  });

  it("shows the whole 120 minutes once played", () => {
    expect(matchPageAt(page(false), 90)).toMatchObject({ minute: 120, isOver: true, end: 120, score: { home: 2, away: 1 } });
  });
});
