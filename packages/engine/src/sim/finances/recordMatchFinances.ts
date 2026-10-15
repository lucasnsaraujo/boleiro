import { copyRecord } from "../copyRecord.js";
import type { ClubFinance, Fixture, GameState, HomeGate } from "../gameState.js";
import { clubMood } from "../morale/clubMood.js";
import { crowdTurnout } from "../morale/crowdTurnout.js";
import { rivalsOf } from "../morale/rivalsOf.js";
import { bookMoneyInDraft } from "./bookMoney.js";
import { SELLABLE_SHARE_OF_CAPACITY } from "./openingFinances.js";
import { tierOf } from "./tierOf.js";
import { isHumanClub } from "../coach/humanCoaches.js";

// guess: football ticket demand is usually reported as inelastic, around -0.3 to -0.6; not checked
// against a Brazilian study.
const PRICE_ELASTICITY = -0.4;
// guess: above the division's average price fans drop away faster and faster, so a club earns most
// at about 1.3 times the average (the gate peaks where 0.6 / r = 2 * PRICE_CHOKE * (r - 1)) and at
// three times the average it takes a fraction of the usual gate.
const PRICE_CHOKE = 0.77;
// guess: a derby sells a fifth more tickets; a knockout tie a tenth more and a final a quarter more,
// near Brasfoot's lift of 15% of the seats for a knockout game.
const DERBY_LIFT = 1.2;
const KNOCKOUT_LIFT = 1.1;
const FINAL_LIFT = 1.25;
// guess: a side on five straight wins draws 15% more than its usual crowd, one on five defeats 15% fewer.
const FORM_SWING = 0.15;
// guess: big visiting fanbases sell extra tickets, up to 30% more; small ones cost at most 10%.
const OPPONENT_PULL = { exponent: 0.1, min: 0.9, max: 1.3 };
const FORM_GAMES = 5;
const HOME_GATES_KEPT = 5;

const pointsFor = (scored: number, conceded: number) => (scored > conceded ? 3 : scored === conceded ? 1 : 0);

function withResult(finance: ClubFinance, points: number): ClubFinance {
  return {
    ...finance,
    recentPoints: [...finance.recentPoints, points].slice(-FORM_GAMES),
    month: { ...finance.month, points: finance.month.points + points, games: finance.month.games + 1 },
  };
}

/** Share of the usual crowd that pays `ratio` times the division's average price. */
function priceDemand(ratio: number): number {
  const steady = ratio ** PRICE_ELASTICITY;
  return ratio <= 1 ? steady : steady * Math.exp(-PRICE_CHOKE * (ratio - 1) ** 2);
}

/** How much the game's weight lifts the crowd: a knockout tie, more for a final; league and group games 1. */
function stakesLift(state: GateState, fixture: GameWeight | undefined): number {
  const competition = fixture && state.competitions[fixture.competitionId];
  if (!fixture || !competition) return 1;
  const isKnockout = competition.kind === "cup" || competition.stages[fixture.stage]?.kind === "knockout";
  if (!isKnockout) return 1;
  return fixture.stage === competition.stageDates.length - 1 ? FINAL_LIFT : KNOCKOUT_LIFT;
}

/** What the gate reads of the game. */
export type GateState = Pick<GameState, "clubs" | "economy" | "competitions" | "mood">;

/** Where a game sits in its competition, which sets its weight. */
export type GameWeight = Pick<Fixture, "competitionId" | "stage">;

/**
 * Paying crowd for a home match, from the club's usual crowd, form, opponent, rivalry, ticket price,
 * fan mood and seats; given the fixture, also from the game's weight.
 */
export function attendance(state: GateState, home: ClubFinance, homeId: string, awayId: string, fixture?: GameWeight): number {
  const club = state.clubs[homeId];
  const visitor = state.clubs[awayId];
  if (!club) return 0;
  const form = home.recentPoints.length
    ? 1 + FORM_SWING * (home.recentPoints.reduce((sum, p) => sum + p, 0) / (3 * home.recentPoints.length) * 2 - 1)
    : 1;
  const pull = visitor && club.fanbase > 0 ? (visitor.fanbase / club.fanbase) ** OPPONENT_PULL.exponent : 1;
  const opponent = Math.min(OPPONENT_PULL.max, Math.max(OPPONENT_PULL.min, pull));
  const price = priceDemand(home.ticketPrice / state.economy.matchday[tierOf(club)].price);
  const derby = rivalsOf(state.clubs).get(homeId)?.has(awayId) ? DERBY_LIFT : 1;
  const demand = home.baseCrowd * form * opponent * derby * stakesLift(state, fixture) * price * crowdTurnout(clubMood(state, homeId));
  return Math.round(Math.min(SELLABLE_SHARE_OF_CAPACITY * club.capacity, demand));
}

/** The coach's club keeps its last home games at the gate for the stadium screen. */
function withGate(finance: ClubFinance, fixture: Fixture, crowd: number, gate: number): ClubFinance {
  const game: HomeGate = { date: fixture.date, competitionId: fixture.competitionId, opponentId: fixture.awayId, price: finance.ticketPrice, crowd, gate };
  return { ...finance, homeGates: [...(finance.homeGates ?? []), game].slice(-HOME_GATES_KEPT) };
}

/** How many real games a game of this stage stands for in the season's money (`Competition.gameScales`). */
export const gameScaleOf = (state: Pick<GameState, "competitions">, fixture: GameWeight): number => state.competitions[fixture.competitionId]?.gameScales?.[fixture.stage] ?? 1;

/**
 * Books the home club's gate and both clubs' form for each fixture played today, in one copy of the
 * finances map. On shorter formats a game's gate counts for the real games it stands for.
 */
export function recordMatchFinances(state: GameState, played: readonly Fixture[]): GameState {
  if (!played.length) return state;
  const draft: GameState = { ...state, finances: copyRecord(state.finances) };
  const { finances } = draft;
  // A continental guest from abroad keeps no accounts; its Brazilian opponent books its side alone.
  const isGuest = (clubId: string) => !state.clubs[clubId];
  for (const fixture of played) {
    const home = finances[fixture.homeId];
    const away = finances[fixture.awayId];
    if (!fixture.result || (!home && !isGuest(fixture.homeId)) || (!away && !isGuest(fixture.awayId))) continue;
    const { homeGoals, awayGoals } = fixture.result;
    if (home) {
      const crowd = attendance(draft, home, fixture.homeId, fixture.awayId, fixture);
      const gate = Math.round(crowd * home.ticketPrice * gameScaleOf(state, fixture));
      const kept = isHumanClub(state, fixture.homeId) ? withGate(home, fixture, crowd, gate) : home;
      finances[fixture.homeId] = withResult(kept, pointsFor(homeGoals, awayGoals));
      bookMoneyInDraft(finances, fixture.homeId, { revenue: "tickets", amount: gate });
    }
    if (away) finances[fixture.awayId] = withResult(away, pointsFor(awayGoals, homeGoals));
  }
  return draft;
}
