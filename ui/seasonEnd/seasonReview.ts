import type { Division } from "../../src/data/players.js";
import type { DayEvent } from "../hub/inboxLines.js";
import type { Expectation } from "../../src/sim/coach/boardExpectations.js";
import type { Coach } from "../../src/sim/coach/coach.js";
import { COPA_DO_BRASIL } from "../../src/sim/copaDoBrasil.js";
import { continentalQualifiers } from "../../src/sim/finances/continentalQualifiers.js";
import type { ClubFinance, GameState } from "../../src/sim/gameState.js";
import type { CompetitionKey, History } from "../../src/sim/history/history.js";

/** The last day of the season, before the turn: it still holds the season's competitions. */
export type SeasonEnded = Pick<GameState, "coachClubId" | "competitions" | "fixtures"> & { coach: Pick<Coach, "reputation"> };
/** The first day of the next season: the season is filed in the history and the money renewed. */
export type SeasonStarted = {
  history: Pick<History, "seasons">;
  coach: Pick<Coach, "reputation" | "contract">;
  finances: Readonly<Record<string, Pick<ClubFinance, "lastSeason" | "month">>>;
};

export type Placing = { division: Division; position: number; tableSize: number; move: "promoted" | "relegated" | null };
export type ContinentalPlace = "libertadores" | "preLibertadores" | "sulAmericana";
export type ContractVerdict = { kind: "renewed"; untilSeason: number } | { kind: "ended" } | { kind: "running"; untilSeason: number };
export type BoardVerdict = {
  expectation: Expectation;
  targetPosition: number;
  /** The board's position: the league's first phase, as judged all season. */
  position: number;
  hasMetTarget: boolean;
  contract: ContractVerdict;
  reputationBefore: number;
  reputationAfter: number;
};

export type SeasonReview = {
  season: number;
  /** The coach's club when the season ended, or null if he had none. */
  clubId: string | null;
  placing: Placing | null;
  titles: CompetitionKey[];
  continental: ContinentalPlace | null;
  /** Copa do Brasil prizes over the season plus the continental money paid at the turn, in BRL. */
  prizeMoney: number;
  verdict: BoardVerdict | null;
  champions: Record<CompetitionKey, string>;
};

const DIVISIONS: readonly Division[] = ["A", "B", "C", "D"];

function placingOf(record: History["seasons"][number], clubId: string): Placing | null {
  for (const division of DIVISIONS) {
    const table = record.tables[division];
    const position = table.indexOf(clubId) + 1;
    if (!position) continue;
    const move = record.promoted[division].includes(clubId) ? "promoted" : record.relegated[division].includes(clubId) ? "relegated" : null;
    return { division, position, tableSize: table.length, move };
  }
  return null;
}

function continentalOf(ended: SeasonEnded, serieATable: readonly string[], clubId: string): ContinentalPlace | null {
  const cup = Object.values(ended.competitions).find((c) => c.kind === "cup");
  const copa = cup?.kind === "cup" ? COPA_DO_BRASIL.finalists(cup, ended.fixtures.filter((f) => f.competitionId === cup.id)) : null;
  const places = continentalQualifiers(serieATable, copa);
  if (places.libertadoresGroups.includes(clubId)) return "libertadores";
  if (places.libertadoresPreliminary.includes(clubId)) return "preLibertadores";
  if (places.sulAmericana.includes(clubId)) return "sulAmericana";
  return null;
}

function verdictOf(events: readonly DayEvent[], ended: SeasonEnded, started: SeasonStarted, clubId: string): BoardVerdict | null {
  const review = events.find((e) => e.type === "coachSeasonReviewed" && e.clubId === clubId);
  if (review?.type !== "coachSeasonReviewed") return null;
  const renewed = events.find((e) => e.type === "contractRenewed" && e.clubId === clubId);
  const contract: ContractVerdict =
    renewed?.type === "contractRenewed"
      ? { kind: "renewed", untilSeason: renewed.untilSeason }
      : events.some((e) => e.type === "contractEnded" && e.clubId === clubId) || !started.coach.contract
        ? { kind: "ended" }
        : { kind: "running", untilSeason: started.coach.contract.untilSeason };
  return {
    expectation: review.expectation,
    targetPosition: review.targetPosition,
    position: review.position,
    hasMetTarget: review.position <= review.targetPosition,
    contract,
    reputationBefore: ended.coach.reputation,
    reputationAfter: started.coach.reputation,
  };
}

/** The season the turn just filed, as the coach's club lived it: the day's events carry the board's verdict. */
export function seasonReview(ended: SeasonEnded, started: SeasonStarted, events: readonly DayEvent[]): SeasonReview {
  const record = started.history.seasons.at(-1);
  if (!record) throw new Error("no season has been filed yet");
  const clubId = ended.coachClubId;
  const champions = record.champions;
  if (!clubId) return { season: record.season, clubId, placing: null, titles: [], continental: null, prizeMoney: 0, verdict: null, champions };
  const finance = started.finances[clubId];
  // On the turn day the month holds only what the turn paid: the continental money.
  const prizeMoney = (finance?.lastSeason?.revenue.prizes ?? 0) + (finance?.month.revenue.prizes ?? 0);
  return {
    season: record.season,
    clubId,
    placing: placingOf(record, clubId),
    titles: Object.entries(champions).flatMap(([key, championId]) => (championId === clubId ? [key] : [])),
    continental: continentalOf(ended, record.tables.A, clubId),
    prizeMoney,
    verdict: verdictOf(events, ended, started, clubId),
    champions,
  };
}
