import type { Division } from "@boleiro/data/players";
import { advanceDay, type DayEvent } from "../sim/advanceDay.js";
import { clubStatures } from "../sim/coach/clubStatures.js";
import type { GameState } from "../sim/gameState.js";
import { loadNewGame } from "../sim/loadNewGame.js";

export type CareerLine = { season: number; date: string; text: string };
export type CareerRun = {
  lines: CareerLine[];
  /** Board firings during the league per season and division, every club included. */
  firings: { season: number; division: Division; count: number; clubs: number }[];
  final: GameState;
};

/** The auto-coach takes the open offer from the biggest club, if it is bigger than his own. */
function bestOffer(state: GameState): string | undefined {
  const statures = clubStatures(state);
  const current = state.coachClubId ? (statures.get(state.coachClubId) ?? 0) : -1;
  const [best] = [...state.coach.offers].sort((a, b) => (statures.get(b.clubId) ?? 0) - (statures.get(a.clubId) ?? 0));
  return best && (statures.get(best.clubId) ?? 0) > current ? best.clubId : undefined;
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
const nameOf = (state: GameState, clubId: string) => state.clubs[clubId]?.shortName ?? clubId;

function describe(state: GameState, event: DayEvent): string | null {
  switch (event.type) {
    case "coachHired": {
      const club = state.clubs[event.clubId];
      return `hired by ${nameOf(state, event.clubId)} (Série ${club?.division ?? "-"}), R$ ${event.salary.toLocaleString("pt-BR")}/month to ${event.untilSeason}`;
    }
    case "coachFired":
      return event.isYou ? `FIRED by ${nameOf(state, event.clubId)}: ${ordinal(event.position)}, target ${ordinal(event.targetPosition)}` : null;
    case "coachSeasonReviewed":
      return `${event.season} at ${nameOf(state, event.clubId)}: ${event.expectation} (target ${ordinal(event.targetPosition)}), finished ${ordinal(event.position)}${event.won ? ", champion" : ""}${event.promoted ? ", promoted" : ""}; reputation ${event.reputation}`;
    case "contractRenewed":
      return `contract renewed at ${nameOf(state, event.clubId)} to ${event.untilSeason}`;
    case "contractEnded":
      return `contract at ${nameOf(state, event.clubId)} not renewed`;
    default:
      return null;
  }
}

/** Plays a career-mode game for `seasons` seasons with an auto-coach that always takes the best offer. */
export function runCareer(seed: number, seasons: number): CareerRun {
  let state = loadNewGame(seed, { coachClubId: null, careerMode: true });
  const lines: CareerLine[] = [];
  const firings: CareerRun["firings"] = [];
  const lastSeason = state.season + seasons;
  while (state.season < lastSeason) {
    const season = state.season;
    const divisionOf = new Map(Object.values(state.clubs).map((club) => [club.id, club.division]));
    const count: Partial<Record<Division, number>> = {};
    while (state.season === season) {
      const day = advanceDay(state, { acceptOffer: bestOffer(state) });
      for (const event of day.events) {
        const text = describe(day.state, event);
        if (text) lines.push({ season, date: state.date, text });
        const division = event.type === "coachFired" ? divisionOf.get(event.clubId) : null;
        if (division) count[division] = (count[division] ?? 0) + 1;
      }
      state = day.state;
    }
    for (const division of ["A", "B", "C", "D"] as const) {
      const clubs = [...divisionOf.values()].filter((d) => d === division).length;
      firings.push({ season, division, count: count[division] ?? 0, clubs });
    }
  }
  return { lines, firings, final: state };
}
