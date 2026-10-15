import type { Club, State } from "@boleiro/data/clubs";
import type { Division } from "@boleiro/data/players";
import type { Formation } from "../engine/formations.js";
import type { Player } from "../engine/match.js";
import type { Board } from "./coach/boardExpectations.js";
import type { Coach } from "./coach/coach.js";
import type { WaitingCoach } from "./coach/humanCoaches.js";
import type { Discipline, MatchCards } from "./discipline/discipline.js";
import type { Friendly } from "./friendlies/friendlies.js";
import type { History } from "./history/history.js";
import type { ClubMood } from "./morale/clubMood.js";
import type { PlayerProfile } from "./players/playerProfile.js";
import type { TransferMarket } from "./transfers/transferMarket.js";
import type { EuropeanCups } from "./continental/uefaCups.js";
import type { World } from "./world/world.js";
import type { Formats } from "./formats.js";

export type IsoDate = string;

/** A club's formation and the players it starts when they are fit. */
export type UsualLineup = { formation: Formation; starters: string[] };

/** `wage` is the monthly wage in BRL; the contract runs to the end of `contractUntil`. */
export type SimPlayer = Player & { id: string; clubId: string; wage: number; contractUntil: IsoDate } & PlayerProfile;

export type MatchResult = {
  homeGoals: number;
  awayGoals: number;
  penaltyWinnerId?: string;
  cards?: MatchCards;
};

export type Fixture = {
  id: string;
  competitionId: string;
  stage: number;
  date: IsoDate;
  homeId: string;
  awayId: string;
  group?: number;
  tie?: number;
  result: MatchResult | null;
};

export type GroupStage = {
  kind: "groups";
  groups: string[][];
  legs: 1 | 2;
  dates: IsoDate[];
};

export type KnockoutStage = {
  kind: "knockout";
  ties: [string, string][];
  dates: IsoDate[];
};

export type Stage = GroupStage | KnockoutStage;

export type LeagueFormatId = `serie-${Lowercase<Division>}`;

type CompetitionBase = {
  id: string;
  season: number;
  clubIds: string[];
  stages: Stage[];
  stageDates: IsoDate[][];
  drawOrder: string[];
  /** Each stage's games in its real format over its games in this game's (`formats.gameScales`); absent when they are the same. */
  gameScales?: number[];
};

/** `legs` 1 when the game's formats play the league's round robin once. */
export type LeagueCompetition = CompetitionBase & { kind: "league"; format: LeagueFormatId; division: Division; legs?: 1 };

/** `clubIds` is the seeding order, best first. */
export type StateCompetition = CompetitionBase & { kind: "state"; state: State };

/** `clubIds` is the ranking order, best first; `entries[stage]` are the clubs that join at that stage. */
export type CupCompetition = CompetitionBase & { kind: "cup"; entries: string[][] };

/** CONMEBOL's club cups the game plays. */
export const CONTINENTAL_CUPS = ["libertadores", "sul-americana", "recopa"] as const;
export type ContinentalCup = (typeof CONTINENTAL_CUPS)[number];

/**
 * A CONMEBOL cup: `entries[stage]` are the clubs that join at that stage, best seed first, and
 * `countries` names each club's country ("br", "ar", ...), which the draws keep apart.
 */
export type ContinentalCompetition = CompetitionBase & { kind: "continental"; cup: ContinentalCup; entries: string[][]; countries: Record<string, string> };

export type Competition = LeagueCompetition | StateCompetition | CupCompetition | ContinentalCompetition;

export type SeasonCalendar = {
  season: number;
  stateChampionshipDates: IsoDate[];
  copaDoBrasilRounds: { name: string; dates: IsoDate[] }[];
  leagueDates: Record<Division, IsoDate[]>;
  /** The unified calendar's match days, which every league's rounds follow from the first; a real calendar has none. */
  leagueGrid?: IsoDate[];
};

/** Where a club plays: its national division, or only its state championship. */
export type Tier = Division | "state";

export const REVENUE_LINES = ["tickets", "tv", "membership", "sponsorship", "otherIncome", "prizes", "playerSales", "friendlies"] as const;
export const COST_LINES = ["wages", "transferFees", "signingFees", "agentFees", "infrastructure", "interest", "fines", "friendlies", "bonuses"] as const;
export type RevenueLine = (typeof REVENUE_LINES)[number];
export type CostLine = (typeof COST_LINES)[number];

/** Money in and out over a period, in BRL. */
export type Ledger = { revenue: Record<RevenueLine, number>; costs: Record<CostLine, number> };

/** One club's money in BRL. Yearly lines are per year; `wageCap` is per month. */
export type ClubFinance = {
  cash: number;
  /** Board loans taken in the game; they accrue interest. */
  loans: number;
  /** Net debt from the 2025 accounts. Not serviced in the game; kept for the board's judgement. */
  legacyDebt: number;
  /** Wages the club failed to pay; paid back first when cash comes in. */
  wagesOwed: number;
  /** Monthly closings in a row that ended with wages owed. Morale (#12) reads it. */
  lateWageMonths: number;
  ticketPrice: number;
  /** Crowd the club draws at its division's average ticket price, before form and opponent. */
  baseCrowd: number;
  tv: number;
  sponsorship: number;
  membership: number;
  /** Membership the club settles back to; membership drifts around it with results. */
  membershipAnchor: number;
  /** State championship, continental and commercial income the game does not simulate, net of `prizesOutOfOtherIncome`. */
  otherIncome: number;
  infrastructure: number;
  /** Ticket money the board expects over a season, for its budget. */
  expectedTickets: number;
  /** Copa do Brasil and continental prize money the board expects over a season, for its budget. */
  expectedPrizes: number;
  /** The part of `expectedPrizes` taken out of `otherIncome` (it can't go below zero); the next renewal adds it back. */
  prizesOutOfOtherIncome: number;
  transferBudget: number;
  wageCap: number;
  /** Points of the last five matches in any competition, newest last. */
  recentPoints: number[];
  month: Ledger & { points: number; games: number };
  season: Ledger;
  lastSeason: Ledger | null;
  /** The last monthly closing: the month as `YYYY-MM`, its ledger and the cash it ended with. */
  lastClosing: { month: string; ledger: Ledger; cash: number } | null;
  /** New seats the board is building, if any; saves from before stadium works have none. */
  stadiumWorks?: StadiumWorks;
  /** The coach's club's last home games, newest last; saves from before kept none. */
  homeGates?: HomeGate[];
  /** The coach's fixed-term bank loan, if one is running; saves from before bank loans have none. */
  bankLoan?: BankLoan;
};

/** A bank loan repaid in fixed monthly instalments at the monthly closing; `balance` is what is still owed. */
export type BankLoan = { amount: number; balance: number; monthlyRate: number; instalment: number; instalmentsLeft: number; takenOn: IsoDate };

/** Seats under construction, paid for in monthly instalments booked as infrastructure. */
export type StadiumWorks = { seats: number; cost: number; paid: number; startedOn: IsoDate; opensOn: IsoDate };

/** One home game at the gate: the ticket price then, the paying crowd and the money it brought. */
export type HomeGate = { date: IsoDate; competitionId: string; opponentId: string; price: number; crowd: number; gate: number };

/** Division-level money rules, copied into the save so a data rebuild does not change a running game. */
export type Economy = {
  serieATv: { pool: number; shares: { equal: number; performance: number; audience: number }; perClubMin: number; perClubMax: number };
  tvPerClub: Record<Tier, number>;
  matchday: Record<Tier, { attendance: number; price: number }>;
  /** Typical yearly revenue without player sales, used to rescale a club that changes division. */
  typicalRevenue: Record<Tier, number>;
  /** Highest yearly revenue without player sales in the division's data; richer clubs drift back. */
  revenueCeiling: Record<Tier, number>;
  /** Copa do Brasil prize per club for playing each stage before the final, then the final's two prizes. */
  copaDoBrasil: { stagePrizes: { prize: number; prizeLowerDivisions: number | null }[]; runnerUp: number; champion: number };
  /**
   * CONMEBOL money for taking part, in USD: the Libertadores group stage or preliminary phase and the
   * Sul-Americana group stage. `usdBrl` is the dollar rate when the market's euro rate was its opening one.
   */
  continental: { usdBrl: number; libertadoresGroups: number; libertadoresPreliminary: number; sulAmericanaGroups: number };
  /**
   * CONMEBOL's prize for each stage a club plays, in USD by stage name ("group-stage", "champion"),
   * when the game plays the cups; a game without South America has none.
   */
  continentalStages?: Record<"libertadores" | "sul-americana", Record<string, number>>;
};

export type GameState = {
  version: 4;
  /** The data pack the career started from (`DataPack.packVersion`); it keeps it for life. */
  packVersion: string;
  seed: number;
  rngState: number;
  date: IsoDate;
  season: number;
  coachClubId: string | null;
  clubs: Record<string, Club>;
  players: Record<string, SimPlayer>;
  calendar: SeasonCalendar;
  competitions: Record<string, Competition>;
  fixtures: Fixture[];
  economy: Economy;
  finances: Record<string, ClubFinance>;
  mood: Record<string, ClubMood>;
  coach: Coach;
  /** Each national club's board for the season; state-only clubs have none. */
  boards: Record<string, Board>;
  /** Yellows and bans per competition; standings read each match's cards from its result. */
  discipline: Discipline;
  /** Champions, records, idols and the coach's career, kept across seasons. */
  history: History;
  market: TransferMarket;
  /**
   * Each club's usual formation and starters, from its last real match when the data has it; the AI
   * coach picks in that formation. Saves from before positions have none until loaded (withPackPositions).
   */
  usualLineups?: Record<string, UsualLineup>;
  /** Countries played result-only, outside the full tier; a game of Brazil alone has none. */
  world?: World;
  /** UEFA's cups, played result-only when all of Europe is in the world; a game without it, or saved before it, has none. */
  europe?: EuropeanCups;
  /** False when the game was started without the estaduais (a new-game option); left out, they are played. */
  playsStateChampionships?: false;
  /** The coach's club's friendlies, booked and lately played; saves from before friendlies have none. */
  friendlies?: Friendly[];
  /** The name of the coach in the seat, in a hot-seat game; a one-coach game keeps none. */
  coachName?: string;
  /** The other human coaches of a hot-seat game, in turn order after the one in the seat; a one-coach game has none. */
  waitingCoaches?: WaitingCoach[];
  /** Each coach's market time per transfer window, in seconds; a game without the market clock has none. */
  marketClockSeconds?: number;
  /** The calendar and formats chosen at new game; a game on Realista's, or saved before them, has none. */
  formats?: Formats;
};
