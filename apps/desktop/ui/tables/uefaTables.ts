import { aggregateOf, knockoutTie, leaguePhaseMatches, type KnockoutRound, type LeaguePhaseCup } from "@boleiro/engine/sim/continental/uefaCups";
import { standings } from "@boleiro/engine/sim/standings";
import { recentForm, zoneKeys, type BracketRound, type GroupTable, type TieView, type ZoneKey, type ZoneKind } from "./competitionTables.js";

// The league phase's top eight go to the round of 16, 9th to 24th to the knockout play-offs.
const ROUND_OF_16_PLACES = 8;
const PLAYOFF_PLACES = 24;

const zoneAt = (position: number): ZoneKind | null => (position <= ROUND_OF_16_PLACES ? "advance" : position <= PLAYOFF_PLACES ? "playoff" : null);

/** The league phase as one table of 36, each row in the zone its place leads to. */
export function uefaLeaguePhase(cup: LeaguePhaseCup): { groups: GroupTable[]; zones: ZoneKey[] } {
  const matches = leaguePhaseMatches(cup);
  const rows = standings(cup.clubIds, matches, cup.drawOrder).map((row, i) => ({
    ...row,
    position: i + 1,
    zone: zoneAt(i + 1),
    form: recentForm(row.clubId, matches),
    movement: 0,
  }));
  const groups = [{ label: null, rows }];
  return { groups, zones: zoneKeys(groups, "Oitavas") };
}

function tieViews(cup: LeaguePhaseCup, round: KnockoutRound): TieView[] {
  return round.ties.map((_, index) => {
    const { clubIds, legs, winnerId, onPenalties } = knockoutTie(round, index);
    const isStarted = legs.some((leg) => leg.result);
    return {
      clubIds,
      legs: legs.map((leg, i) => ({
        fixtureId: `${cup.cup}-${cup.season}-${round.name}-${index}-${i}`,
        date: leg.date,
        homeId: leg.homeId,
        awayId: leg.awayId,
        homeGoals: leg.result?.homeGoals ?? null,
        awayGoals: leg.result?.awayGoals ?? null,
      })),
      aggregate: isStarted ? aggregateOf(clubIds, legs) : null,
      winnerId,
      onPenalties,
      isPlayoff: false,
    };
  });
}

/** The knockout play-offs' ties, empty before the league phase ends. */
export function uefaPlayoffs(cup: LeaguePhaseCup): TieView[] {
  const round = cup.knockout.find((r) => r.name === "playoffs");
  return round ? tieViews(cup, round) : [];
}

const BRACKET_ROUNDS = [
  { name: "round-of-16", label: "Oitavas", ties: 8 },
  { name: "quarter-finals", label: "Quartas", ties: 4 },
  { name: "semi-finals", label: "Semifinal", ties: 2 },
  { name: "final", label: "Final", ties: 1 },
] as const;

/** The bracket from the round of 16 to the final, a null place for each tie not drawn yet; empty before the round of 16 is. */
export function uefaBracket(cup: LeaguePhaseCup): BracketRound[] {
  if (!cup.knockout.some((round) => round.name === "round-of-16")) return [];
  return BRACKET_ROUNDS.map(({ name, label, ties }, i) => {
    const round = cup.knockout.find((r) => r.name === name);
    const drawn = round ? tieViews(cup, round) : [];
    return { stage: i, name: label, dates: round?.dates ?? [], ties: Array.from({ length: ties }, (_, tie) => drawn[tie] ?? null) };
  });
}
