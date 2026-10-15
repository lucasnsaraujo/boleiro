import type { Club } from "@boleiro/data/clubs";
import { attendance } from "@boleiro/engine/sim/finances/recordMatchFinances";
import { assistantTicketPrice, ticketPriceBounds } from "@boleiro/engine/sim/finances/setTicketPrice";
import type { Fixture, GameState, IsoDate, StadiumWorks } from "@boleiro/engine/sim/gameState";
import { clubMood } from "@boleiro/engine/sim/morale/clubMood";
import { rivalsOf } from "@boleiro/engine/sim/morale/rivalsOf";
import { boardAnswerToWorks, freeCash, withNewSeats, type WorksAnswer } from "@boleiro/engine/sim/stadium/stadiumWorks";
import { competitionName } from "@boleiro/game-client/format/competitionName";
import { clubMeters } from "../hub/hubSelectors.js";

export const STADIUM_KEYS = ["date", "coachClubId", "clubs", "finances", "mood", "fixtures", "competitions", "economy", "boards"] as const;
export type StadiumState = Pick<GameState, (typeof STADIUM_KEYS)[number]>;

/** Seats the coach can ask the board for, smallest first. */
export const WORKS_SIZES = [2_000, 5_000, 10_000] as const;

export type Forecast = { crowd: number; gate: number; share: number };
/** Which way a factor pushes the crowd from an ordinary game's. */
export type Push = "up" | "down" | "none";
export type Factor = { label: string; value: string; push: Push };
export type WorksOption = { answer: WorksAnswer; gainPerGame: number };

export type StadiumView = {
  club: Club;
  /** Other clubs that play at the same ground. */
  sharedWith: Club[];
  next: { fixture: Fixture; opponent: Club; competition: string; weight: string | null } | null;
  price: number;
  assistantPrice: number;
  bounds: { min: number; max: number };
  forecastAt: (price: number) => Forecast | null;
  /** What drives the next crowd besides the price. */
  factors: (price: number) => Factor[];
  lastGames: { date: IsoDate; opponent: Club | undefined; competition: string; price: number; crowd: number; gate: number; share: number }[];
  works: StadiumWorks | null;
  options: WorksOption[];
  board: { confidence: number; cash: number };
};

function nextHomeGame(state: StadiumState, clubId: string): Fixture | null {
  return state.fixtures.filter((f) => f.homeId === clubId && !f.result && f.date >= state.date).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

/** "Final", "Mata-mata", "Clássico" or null for an ordinary game. */
function weightOf(state: StadiumState, fixture: Fixture): string | null {
  const competition = state.competitions[fixture.competitionId];
  const isKnockout = competition?.kind === "cup" || competition?.stages[fixture.stage]?.kind === "knockout";
  if (competition && isKnockout) return fixture.stage === competition.stageDates.length - 1 ? "Final" : "Mata-mata";
  return rivalsOf(state.clubs).get(fixture.homeId)?.has(fixture.awayId) ? "Clássico" : null;
}

function formWord(points: readonly number[]): { value: string; push: Push } {
  if (!points.length) return { value: "Sem jogos", push: "none" };
  const wins = [...points].reverse().findIndex((p) => p !== 3);
  const streak = wins === -1 ? points.length : wins;
  if (streak >= 2) return { value: `${streak} vitórias`, push: "up" };
  const share = points.reduce((sum, p) => sum + p, 0) / (3 * points.length);
  return { value: `${Math.round(share * 100)}% dos pontos`, push: share > 0.5 ? "up" : share < 0.5 ? "down" : "none" };
}

/** The coach's stadium: the next home crowd at any price, the last gates and the works he can ask for; null without a club. */
export function stadiumView(state: StadiumState): StadiumView | null {
  const clubId = state.coachClubId;
  const club = clubId ? state.clubs[clubId] : undefined;
  const finance = clubId ? state.finances[clubId] : undefined;
  if (!clubId || !club || !finance) return null;
  const fixture = nextHomeGame(state, clubId);
  const opponent = fixture ? state.clubs[fixture.awayId] : undefined;
  const competition = fixture ? state.competitions[fixture.competitionId] : undefined;
  const assistantPrice = assistantTicketPrice(state, clubId);
  const capacity = club.capacity;

  const forecastIn = (seen: StadiumState, price: number): Forecast | null => {
    const own = seen.finances[clubId];
    if (!fixture || !own) return null;
    const crowd = attendance(seen, { ...own, ticketPrice: price }, clubId, fixture.awayId, fixture);
    return { crowd, gate: Math.round(crowd * price), share: crowd / (seen.clubs[clubId]?.capacity ?? capacity) };
  };

  const mood = clubMood(state, clubId);
  const form = formWord(finance.recentPoints);
  const weight = fixture ? weightOf(state, fixture) : null;

  return {
    club,
    sharedWith: Object.values(state.clubs).filter((other) => other.id !== clubId && other.stadium === club.stadium && other.division !== null),
    next: fixture && opponent && competition ? { fixture, opponent, competition: competitionName(competition), weight } : null,
    price: finance.ticketPrice,
    assistantPrice,
    bounds: ticketPriceBounds(state, clubId),
    forecastAt: (price) => forecastIn(state, price),
    factors: (price) => {
      const above = price / assistantPrice - 1;
      return [
        { label: "Peso do jogo", value: weight ?? "Normal", push: weight ? "up" : "none" },
        mood.closedDoorGames > 0
          ? { label: "Moral da torcida", value: "Portões fechados", push: "down" }
          : { label: "Moral da torcida", value: `${Math.round(mood.fans)}%`, push: mood.fans > 50 ? "up" : mood.fans < 50 ? "down" : "none" },
        { label: "Fase", ...form },
        { label: "Preço", value: above === 0 ? "Na média" : `${above > 0 ? "+" : "−"}${Math.round(Math.abs(above) * 100)}%`, push: above < 0 ? "up" : above > 0 ? "down" : "none" },
      ];
    },
    lastGames: (finance.homeGates ?? []).toReversed().map((game) => {
      const played = state.competitions[game.competitionId];
      return {
        ...game,
        opponent: state.clubs[game.opponentId],
        competition: played ? competitionName(played) : "",
        share: game.crowd / capacity,
      };
    }),
    works: finance.stadiumWorks ?? null,
    options: WORKS_SIZES.map((seats) => {
      const answer = boardAnswerToWorks(state, seats);
      const now = forecastIn(state, finance.ticketPrice);
      const after = forecastIn(withNewSeats(state, clubId, seats), finance.ticketPrice);
      return { answer, gainPerGame: now && after ? Math.max(0, after.gate - now.gate) : 0 };
    }),
    board: { confidence: clubMeters(state, clubId).board / 100, cash: freeCash(finance) },
  };
}
