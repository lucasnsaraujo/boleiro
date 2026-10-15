import type { Division } from "@boleiro/data/players";
import type { DayEvent } from "../hub/inboxLines.js";
import type { Expectation } from "@boleiro/engine/sim/coach/boardExpectations";
import { COPA_DO_BRASIL } from "@boleiro/engine/sim/copaDoBrasil";
import { continentalPrizesEarned } from "@boleiro/engine/sim/continental/payContinentalPrizes";
import { continentalQualifiers } from "@boleiro/engine/sim/finances/continentalQualifiers";
import { payCopaPrizes } from "@boleiro/engine/sim/finances/payCopaPrizes";
import type { ClubFinance, GameState } from "@boleiro/engine/sim/gameState";
import type { CompetitionKey, History } from "@boleiro/engine/sim/history/history";

/** The last day of the season, before the turn: it still holds the season's competitions and fixtures. */
export type SeasonEnded = GameState;
/** The first day of the next season: the season is filed in the history and the money renewed. */
export type SeasonStarted = {
  history: Pick<History, "seasons">;
  coach: Pick<GameState["coach"], "reputation" | "contract">;
  finances: Readonly<Record<string, Pick<ClubFinance, "month">>>;
  /** The new season's competitions; in a game that plays CONMEBOL's cups, they hold the places just won. */
  competitions?: GameState["competitions"];
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
  /** Copa do Brasil prizes over the season plus the continental money: paid at the turn, or earned in the cups when the game plays them; in BRL. */
  prizeMoney: number;
  verdict: BoardVerdict | null;
  champions: Record<CompetitionKey, string>;
  /** The board let his contract end at the turn: he starts the new season without a club. */
  hasLostJob: boolean;
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

/** Where the club enters next season's CONMEBOL cups the turn drew, when the game plays them; undefined when it doesn't. */
function drawnPlaceOf(started: SeasonStarted, season: number, clubId: string): ContinentalPlace | null | undefined {
  const cups = Object.values(started.competitions ?? {}).flatMap((c) => (c.kind === "continental" && c.season === season ? [c] : []));
  if (cups.length === 0) return undefined;
  const libertadores = cups.find((c) => c.cup === "libertadores");
  const stage = libertadores?.entries.findIndex((ids) => ids.includes(clubId)) ?? -1;
  if (stage >= 0) return stage === libertadores?.entries.findLastIndex((ids) => ids.length > 0) ? "libertadores" : "preLibertadores";
  return cups.some((c) => c.cup === "sul-americana" && c.clubIds.includes(clubId)) ? "sulAmericana" : null;
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

/**
 * The Copa do Brasil prizes the club earned over the season, paid again on a copy of the last day. The
 * season's ledger can't tell them apart: it also holds the continental money paid on the 1 January it began.
 */
function copaPrizesOf(ended: SeasonEnded, clubId: string): number {
  const cupFixtures = ended.fixtures.filter((f) => f.result && ended.competitions[f.competitionId]?.kind === "cup" && (f.homeId === clubId || f.awayId === clubId));
  return payCopaPrizes(ended, cupFixtures).events.reduce((sum, e) => sum + (e.clubId === clubId ? e.amount : 0), 0);
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
  if (!clubId) return { season: record.season, clubId, placing: null, titles: [], continental: null, prizeMoney: 0, verdict: null, champions, hasLostJob: false };
  // December closed on the turn day and the month started over, so its prizes are the continental money the turn paid.
  const continentalMoney = started.finances[clubId]?.month.revenue.prizes ?? 0;
  const prizeMoney = copaPrizesOf(ended, clubId) + continentalMoney + continentalPrizesEarned(ended, clubId);
  const drawn = drawnPlaceOf(started, record.season + 1, clubId);
  return {
    season: record.season,
    clubId,
    placing: placingOf(record, clubId),
    titles: Object.entries(champions).flatMap(([key, championId]) => (championId === clubId ? [key] : [])),
    continental: drawn === undefined ? continentalOf(ended, record.tables.A, clubId) : drawn,
    prizeMoney,
    verdict: verdictOf(events, ended, started, clubId),
    champions,
    hasLostJob: events.some((e) => e.type === "contractEnded" && e.clubId === clubId),
  };
}
