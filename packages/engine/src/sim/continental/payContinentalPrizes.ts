import type { CompetitionMoney } from "@boleiro/data/competition-money";
import type { ContinentalCompetition, Economy, Fixture, GameState } from "../gameState.js";
import { bookMoney } from "../finances/bookMoney.js";
import type { PrizePaid } from "../finances/payCopaPrizes.js";
import { OPENING_EUR_BRL } from "../transfers/openingMarket.js";
import { tieResults } from "../tieResults.js";
import { clubWorldCupPrizes } from "./clubWorldCup.js";
import { intercontinentalCupPrizes } from "./intercontinentalCup.js";
import { CONMEBOL_CUPS, CUP_STAGES } from "./conmebolCups.js";
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
const GROUP_DRAW = "group-draw";
/** A cup's prize for the clubs a knockout round puts out, as FIFA's Intercontinental Cup pays by place. */
const knockedOutIn = (stage: string) => `knocked-out:${stage}`;

/** The cup's prizes for the club in USD by stage: CONMEBOL's table, the Club World Cup's, whose participation goes by confederation, or the Intercontinental Cup's by place. */
function prizesFor(stages: NonNullable<Economy["continentalStages"]>, competition: ContinentalCompetition, clubId: string): Record<string, number> {
  switch (competition.cup) {
    case "club-world-cup":
      return clubWorldCupPrizes(competition, clubId);
    case "intercontinental-cup":
      return intercontinentalCupPrizes();
    case "recopa":
      return {};
    default:
      return stages[competition.cup];
  }
}

/** CONMEBOL's prizes in USD by stage, as the economy keeps them for a game that plays the cups. */
export function continentalStagesOf(money: CompetitionMoney): NonNullable<Economy["continentalStages"]> {
  const byStage = ({ stages }: CompetitionMoney["libertadores"]) => Object.fromEntries(stages.map((s) => [s.stage, s.prizeUsd]));
  return { libertadores: byStage(money.libertadores), "sul-americana": byStage(money.sulAmericana) };
}

/**
 * Pays today's CONMEBOL and FIFA prizes, in BRL at today's rate (the dollar moves with the market's
 * euro): a club's prize for a stage on its first match in it, the group stage's bonus for each win
 * (guess: CONMEBOL pays it per group win) and, at the Club World Cup, each draw, the Intercontinental
 * Cup's to each round's loser, and the final's prizes once the final is played. Only clubs with
 * finances, Brazil's and a full-tier country's, are paid.
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
    const prizesOf = (clubId: string) => prizesFor(stages, competition, clubId);
    const stage = competition.stages[fixture.stage];
    const name = CUP_STAGES[competition.cup][fixture.stage]?.name ?? "";
    if (!stage) continue;
    const isFirstMatch = (clubId: string) =>
      !state.fixtures.some((f) => f.competitionId === competition.id && f.stage === fixture.stage && f.result && f.id !== fixture.id && (f.homeId === clubId || f.awayId === clubId));
    for (const clubId of [fixture.homeId, fixture.awayId]) if (isFirstMatch(clubId)) pay(clubId, competition.id, prizesOf(clubId)[PRIZE_OF_STAGE[name] ?? ""]);
    if (stage.kind === "groups") {
      const { homeGoals, awayGoals } = fixture.result;
      // On shorter groups a result stands for the real games its group day stands for.
      const bonus = (clubId: string, line: string) => {
        const prize = prizesOf(clubId)[line];
        return prize === undefined ? undefined : prize * (competition.gameScales?.[fixture.stage] ?? 1);
      };
      if (homeGoals !== awayGoals) {
        const winnerId = homeGoals > awayGoals ? fixture.homeId : fixture.awayId;
        pay(winnerId, competition.id, bonus(winnerId, GROUP_WIN));
      } else for (const clubId of [fixture.homeId, fixture.awayId]) pay(clubId, competition.id, bonus(clubId, GROUP_DRAW));
    }
    if (stage.kind !== "knockout" || fixture.tie === undefined || fixture.date !== stage.dates.at(-1)) continue;
    if (fixture.stage === competition.stageDates.length - 1) {
      const [final] = tieResults(stage, [fixture]);
      if (!final) continue;
      pay(final.winnerId, competition.id, prizesOf(final.winnerId).champion);
      pay(final.loserId, competition.id, prizesOf(final.loserId)["runner-up"]);
    } else {
      const tie = tieResults(stage, next.fixtures.filter((f) => f.competitionId === competition.id && f.stage === fixture.stage))[fixture.tie];
      if (tie) pay(tie.loserId, competition.id, prizesOf(tie.loserId)[knockedOutIn(name)]);
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

/** The CONMEBOL and FIFA prizes the club earned in the season's cups so far, in BRL at today's rate: each stage it played, its group results, the round it went out at and the final's prize. */
export function continentalPrizesEarned(state: GameState, clubId: string): number {
  const stages = state.economy.continentalStages;
  if (!stages) return 0;
  const brl = (usd: number) => Math.round(usd * state.economy.continental.usdBrl * (state.market.eurBrl / OPENING_EUR_BRL));
  let usd = 0;
  for (const competition of Object.values(state.competitions)) {
    if (competition.kind !== "continental" || competition.cup === "recopa" || competition.season !== state.season) continue;
    const prizes = prizesFor(stages, competition, clubId);
    const played = state.fixtures.filter((f) => f.competitionId === competition.id && f.result && (f.homeId === clubId || f.awayId === clubId));
    for (const stage of new Set(played.map((f) => f.stage))) {
      const name = CUP_STAGES[competition.cup][stage]?.name ?? "";
      usd += prizes[PRIZE_OF_STAGE[name] ?? ""] ?? 0;
      const knockout = competition.stages[stage];
      const isOut = knockout?.kind === "knockout" && stage < competition.stageDates.length - 1 && played.filter((f) => f.stage === stage).length === knockout.dates.length;
      if (isOut && tieResults(knockout, state.fixtures.filter((f) => f.competitionId === competition.id && f.stage === stage)).some((tie) => tie.loserId === clubId)) usd += prizes[knockedOutIn(name)] ?? 0;
    }
    for (const f of played) {
      const result = f.result;
      if (!result || competition.stages[f.stage]?.kind !== "groups") continue;
      const scored = f.homeId === clubId ? result.homeGoals : result.awayGoals;
      const conceded = f.homeId === clubId ? result.awayGoals : result.homeGoals;
      if (scored > conceded) usd += prizes[GROUP_WIN] ?? 0;
      if (scored === conceded) usd += prizes[GROUP_DRAW] ?? 0;
    }
    const finalists = CONMEBOL_CUPS.finalists(competition, state.fixtures.filter((f) => f.competitionId === competition.id));
    if (finalists?.championId === clubId) usd += prizes.champion ?? 0;
    if (finalists?.runnerUpId === clubId) usd += prizes["runner-up"] ?? 0;
  }
  return brl(usd);
}
