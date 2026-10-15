import type { CompetitionMoney } from "@boleiro/data/competition-money";
import type { Economy, Fixture, GameState } from "../gameState.js";
import { bookMoney } from "../finances/bookMoney.js";
import type { PrizePaid } from "../finances/payCopaPrizes.js";
import { OPENING_EUR_BRL } from "../transfers/openingMarket.js";
import { tieResults } from "../tieResults.js";
import { CUP_STAGES } from "./conmebolCups.js";
import type { ContinentalField } from "./continentalField.js";

// The game's stage names against competition-money's (CONMEBOL's 2026 prize table); a stage it
// lists no prize for, as the Sul-Americana's first stage and the Recopa, pays nothing.
const PRIZE_OF_STAGE: Record<string, string> = {
  "stage-1": "preliminary-1",
  "stage-2": "preliminary-2",
  "stage-3": "preliminary-3",
  groups: "group-stage",
  playoffs: "knockout-playoff",
  "round-of-16": "round-of-16",
  "quarter-finals": "quarter-final",
  "semi-finals": "semi-final",
};
const GROUP_WIN = "group-win";

/** CONMEBOL's prizes in USD by stage, as the economy keeps them for a game that plays the cups. */
export function continentalStagesOf(money: CompetitionMoney): NonNullable<Economy["continentalStages"]> {
  const byStage = ({ stages }: CompetitionMoney["libertadores"]) => Object.fromEntries(stages.map((s) => [s.stage, s.prizeUsd]));
  return { libertadores: byStage(money.libertadores), "sul-americana": byStage(money.sulAmericana) };
}

/**
 * Pays today's CONMEBOL prizes, in BRL at today's rate (the dollar moves with the market's euro):
 * a club's prize for a stage on its first match in it, the group stage's bonus for each win
 * (guess: CONMEBOL pays it per group win), and the final's prizes once the final is played.
 * Only clubs with finances, Brazil's, are paid.
 */
export function payContinentalPrizes(state: GameState, played: readonly Fixture[]): { state: GameState; events: PrizePaid[] } {
  const stages = state.economy.continentalStages;
  const events: PrizePaid[] = [];
  if (!stages) return { state, events };
  const brl = (usd: number) => Math.round(usd * state.economy.continental.usdBrl * (state.market.eurBrl / OPENING_EUR_BRL));
  let next = state;
  const pay = (clubId: string, competitionId: string, usd: number | undefined) => {
    if (!usd || !next.finances[clubId]) return;
    const amount = brl(usd);
    next = bookMoney(next, clubId, { revenue: "prizes", amount });
    events.push({ type: "prizePaid", clubId, competitionId, amount });
  };
  for (const fixture of played) {
    const competition = state.competitions[fixture.competitionId];
    if (competition?.kind !== "continental" || competition.cup === "recopa" || !fixture.result) continue;
    const prizes = stages[competition.cup];
    const stage = competition.stages[fixture.stage];
    const name = CUP_STAGES[competition.cup][fixture.stage]?.name ?? "";
    if (!stage) continue;
    const isFirstMatch = (clubId: string) =>
      !state.fixtures.some((f) => f.competitionId === competition.id && f.stage === fixture.stage && f.result && f.id !== fixture.id && (f.homeId === clubId || f.awayId === clubId));
    for (const clubId of [fixture.homeId, fixture.awayId]) if (isFirstMatch(clubId)) pay(clubId, competition.id, prizes[PRIZE_OF_STAGE[name] ?? ""]);
    if (stage.kind === "groups") {
      const { homeGoals, awayGoals } = fixture.result;
      if (homeGoals !== awayGoals) pay(homeGoals > awayGoals ? fixture.homeId : fixture.awayId, competition.id, prizes[GROUP_WIN]);
    }
    if (stage.kind === "knockout" && fixture.stage === competition.stageDates.length - 1 && fixture.date === stage.dates.at(-1)) {
      const [final] = tieResults(stage, [fixture]);
      if (!final) continue;
      pay(final.winnerId, competition.id, prizes.champion);
      pay(final.loserId, competition.id, prizes["runner-up"]);
    }
  }
  return { state: next, events };
}

/**
 * The opening finances with the CONMEBOL money each Brazilian entrant's board expects (its entry
 * stage's prize, as renewFinances counts it at every later season turn) taken out of its other
 * income, which the 2025 accounts it comes from already hold; the cups then pay it match by match.
 */
export function withExpectedContinentalPrizes(state: GameState, field: ContinentalField): GameState {
  const { usdBrl, libertadoresGroups, libertadoresPreliminary, sulAmericanaGroups } = state.economy.continental;
  const brl = (usd: number) => Math.round(usd * usdBrl * (state.market.eurBrl / OPENING_EUR_BRL));
  const expected = new Map<string, number>([
    ...(field.sulAmericana[1] ?? []).map((id): [string, number] => [id, brl(sulAmericanaGroups)]),
    ...(field.libertadores[1] ?? []).map((id): [string, number] => [id, brl(libertadoresPreliminary)]),
    ...(field.libertadores[3] ?? []).map((id): [string, number] => [id, brl(libertadoresGroups)]),
  ]);
  const finances = { ...state.finances };
  for (const [id, prize] of expected) {
    const finance = finances[id];
    if (!finance) continue;
    const taken = Math.min(finance.otherIncome, prize);
    finances[id] = {
      ...finance,
      otherIncome: finance.otherIncome - taken,
      prizesOutOfOtherIncome: finance.prizesOutOfOtherIncome + taken,
      expectedPrizes: finance.expectedPrizes + prize,
    };
  }
  return { ...state, finances };
}
