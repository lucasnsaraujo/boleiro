import { describe, expect, it } from "vitest";
import { CALIBRATED } from "../../engine/match.js";
import { randomStream } from "../../engine/random.js";
import type { SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { engineTeam } from "../players/matchSetup.js";
import type { MatchEvent } from "./matchTimeline.js";
import { playExtraTime, type ExtraTimeMatch } from "./playExtraTime.js";

const state = loadNewGame(5, { coachClubId: null });
const elevenOf = (clubId: string): SimPlayer[] => {
  const squad = Object.values(state.players)
    .filter((p) => p.clubId === clubId)
    .sort((a, b) => b.strength - a.strength);
  const keeper = squad.find((p) => p.group === "GK");
  if (!keeper) throw new Error(`${clubId} has a keeper`);
  return [keeper, ...squad.filter((p) => p.group !== "GK").slice(0, 10)];
};
const home = elevenOf("flamengo-rj");
const away = elevenOf("palmeiras-sp");
const NO_CARDS = { yellows: 0, reds: 0 };
const match: ExtraTimeMatch = {
  clubIds: { home: "flamengo-rj", away: "palmeiras-sp" },
  starters: { home, away },
  benches: { home: [], away: [] },
  aiSides: { home: false, away: false },
  penaltyTakers: { home: null, away: null },
  strength: (p) => p.strength,
  tiredness: () => 0,
  teams: { home: engineTeam("flamengo-rj", home, (p) => p.strength), away: engineTeam("palmeiras-sp", away, (p) => p.strength) },
  params: CALIBRATED,
  cardRates: { home: NO_CARDS, away: NO_CARDS, secondYellowShare: 0 },
  context: { date: state.date, pitch: "natural" },
};
const DRAWS = 10000;

function extraTimeGoals(events: readonly MatchEvent[]): { home: number; away: number } {
  const random = randomStream(7).next;
  const totals = { home: 0, away: 0 };
  for (let i = 0; i < DRAWS; i++) {
    for (const e of playExtraTime(match, events, random)) {
      if (e.type === "goal") totals[e.clubId === match.clubIds.home ? "home" : "away"]++;
    }
  }
  return totals;
}

describe("extra time after a red card in the ninety minutes", () => {
  it("costs the side down to ten a third of its goals and gives its opponent a quarter more, once", () => {
    const sentOff = home[5]?.id ?? "";
    const full = extraTimeGoals([]);
    const short = extraTimeGoals([{ type: "card", minute: 60, clubId: match.clubIds.home, playerId: sentOff, card: "red" }]);
    expect(short.home / full.home).toBeGreaterThan(0.61);
    expect(short.home / full.home).toBeLessThan(0.73);
    expect(short.away / full.away).toBeGreaterThan(1.15);
    expect(short.away / full.away).toBeLessThan(1.35);
  });
});
