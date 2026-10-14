import type { ClubFinance, Fixture, GameState } from "../gameState.js";
import { clubMood } from "../morale/clubMood.js";
import { crowdTurnout } from "../morale/crowdTurnout.js";
import { bookMoney } from "./bookMoney.js";
import { SELLABLE_SHARE_OF_CAPACITY } from "./openingFinances.js";
import { tierOf } from "./tierOf.js";

// guess: football ticket demand is usually reported as inelastic, around -0.3 to -0.6; not checked
// against a Brazilian study.
const PRICE_ELASTICITY = -0.4;
// guess: a side on five straight wins draws 15% more than its usual crowd, one on five defeats 15% fewer.
const FORM_SWING = 0.15;
// guess: big visiting fanbases sell extra tickets, up to 30% more; small ones cost at most 10%.
const OPPONENT_PULL = { exponent: 0.1, min: 0.9, max: 1.3 };
const FORM_GAMES = 5;

const pointsFor = (scored: number, conceded: number) => (scored > conceded ? 3 : scored === conceded ? 1 : 0);

function withResult(finance: ClubFinance, points: number): ClubFinance {
  return {
    ...finance,
    recentPoints: [...finance.recentPoints, points].slice(-FORM_GAMES),
    month: { ...finance.month, points: finance.month.points + points, games: finance.month.games + 1 },
  };
}

/** Paying crowd for a home match, from the club's usual crowd, form, opponent, ticket price and fan mood. */
export function attendance(state: GameState, home: ClubFinance, homeId: string, awayId: string): number {
  const club = state.clubs[homeId];
  const visitor = state.clubs[awayId];
  if (!club) return 0;
  const form = home.recentPoints.length
    ? 1 + FORM_SWING * (home.recentPoints.reduce((sum, p) => sum + p, 0) / (3 * home.recentPoints.length) * 2 - 1)
    : 1;
  const pull = visitor && club.fanbase > 0 ? (visitor.fanbase / club.fanbase) ** OPPONENT_PULL.exponent : 1;
  const opponent = Math.min(OPPONENT_PULL.max, Math.max(OPPONENT_PULL.min, pull));
  const price = (home.ticketPrice / state.economy.matchday[tierOf(club)].price) ** PRICE_ELASTICITY;
  return Math.round(Math.min(SELLABLE_SHARE_OF_CAPACITY * club.capacity, home.baseCrowd * form * opponent * price * crowdTurnout(clubMood(state, homeId))));
}

/** Books the home club's gate and both clubs' form for a played fixture. */
export function recordMatchFinances(state: GameState, fixture: Fixture): GameState {
  const home = state.finances[fixture.homeId];
  const away = state.finances[fixture.awayId];
  if (!home || !away || !fixture.result) return state;
  const { homeGoals, awayGoals } = fixture.result;
  const gate = Math.round(attendance(state, home, fixture.homeId, fixture.awayId) * home.ticketPrice);
  const finances = {
    ...state.finances,
    [fixture.homeId]: withResult(home, pointsFor(homeGoals, awayGoals)),
    [fixture.awayId]: withResult(away, pointsFor(awayGoals, homeGoals)),
  };
  return bookMoney({ ...state, finances }, fixture.homeId, { revenue: "tickets", amount: gate });
}
