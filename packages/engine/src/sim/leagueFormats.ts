import type { State } from "@boleiro/data/clubs";
import type { Fixture, GroupStage, KnockoutStage, LeagueCompetition, LeagueFormatId } from "./gameState.js";
import { seededTies } from "./seededTies.js";
import { groupStageAt, knockoutStageAt } from "./stageAt.js";
import { standings, type StandingRow } from "./standings.js";
import { tieResults } from "./tieResults.js";
import { roundsOf } from "./world/resultOnlyLeague.js";

export type LeagueOutcome = {
  championId: string;
  promotedIds: string[];
  relegatedIds: string[];
};

export type StageShape = Omit<GroupStage, "dates"> | Omit<KnockoutStage, "dates">;

export type LeagueFormat = {
  /** `legs` is how often the game's formats let a round robin meet: a straight table's, MLS's conferences, Liga MX's liguilla ties. */
  stageDateCounts: (clubCount: number, legs: 1 | 2) => number[];
  /** Clubs playing each stage. */
  stageSizes: (clubCount: number) => number[];
  nextStage: (competition: LeagueCompetition, fixtures: readonly Fixture[], clubStates: Record<string, State>) => StageShape;
  outcome: (competition: LeagueCompetition, fixtures: readonly Fixture[]) => LeagueOutcome;
  /** The season's final order, champion first, when it is not the table of every match (a league with play-offs). */
  finalOrder?: (competition: LeagueCompetition, fixtures: readonly Fixture[]) => string[];
};

const stageOf = (fixtures: readonly Fixture[], index: number) => fixtures.filter((f) => f.stage === index);

const table = (competition: LeagueCompetition, clubIds: readonly string[], fixtures: readonly Fixture[]) =>
  standings(clubIds, fixtures, competition.drawOrder).map((row) => row.clubId);

function only<T>(values: readonly T[], what: string): T {
  const [value] = values;
  if (value === undefined || values.length !== 1) throw new Error(`expected exactly one ${what}`);
  return value;
}

const knockoutWinner = (competition: LeagueCompetition, fixtures: readonly Fixture[], index: number) =>
  only(tieResults(knockoutStageAt(competition, index), stageOf(fixtures, index)), "final").winnerId;

function singleTable(relegated: number, promoted: number): LeagueFormat {
  return {
    stageDateCounts: (clubCount, legs) => [(clubCount - 1) * legs],
    stageSizes: (clubCount) => [clubCount],
    nextStage: (competition) => ({ kind: "groups", groups: [competition.clubIds], legs: competition.legs ?? 2 }),
    outcome: (competition, fixtures) => {
      const order = table(competition, competition.clubIds, fixtures);
      return {
        championId: order[0] ?? "",
        promotedIds: order.slice(0, promoted),
        relegatedIds: relegated ? order.slice(-relegated) : [],
      };
    },
  };
}

// Série C 2026: single round robin, top 8 to two quadrangulars of 1st/4th/5th/8th and 2nd/3rd/6th/7th
// (home and away), top 2 of each promoted, group winners play a two-leg final, bottom 2 relegated
// (NSC Total, https://www.nsctotal.com.br/?p=7670657; Band, https://www.band.com.br/nacional/brasil/ponte-preta-e-guarani-entenda-os-regulamentos-das-series-b-e-c-de-2026).
// From 2027 the league has 24 clubs and relegates 6, as many as Série D promotes (Diario de Pernambuco,
// https://www.diariodepernambuco.com.br/esportes-dp/santa-cruz/2025/10/11698141-santa-cruz-na-disputa-entenda-as-mudancas-no-regulamento-da-serie-c.html).
const QUADRANGULAR_SEEDS = [[0, 3, 4, 7], [1, 2, 5, 6]];
const serieCRelegated = (season: number) => (season <= 2026 ? 2 : 6);

const serieC: LeagueFormat = {
  stageDateCounts: (clubCount) => [clubCount - 1, 6, 2],
  stageSizes: (clubCount) => [clubCount, 8, 2],
  nextStage: (competition, fixtures) => {
    if (competition.stages.length === 0) return { kind: "groups", groups: [competition.clubIds], legs: 1 };
    if (competition.stages.length === 1) {
      const order = table(competition, competition.clubIds, stageOf(fixtures, 0));
      return { kind: "groups", groups: QUADRANGULAR_SEEDS.map((seeds) => seeds.map((seed) => order[seed] ?? "")), legs: 2 };
    }
    const quadrangulars = stageOf(fixtures, 1);
    const winners = groupStageAt(competition, 1).groups.map((group) => table(competition, group, quadrangulars)[0] ?? "");
    const [best = "", other = ""] = table(competition, winners, quadrangulars);
    return { kind: "knockout", ties: [[best, other]] };
  },
  outcome: (competition, fixtures) => {
    const firstPhase = table(competition, competition.clubIds, stageOf(fixtures, 0));
    const quadrangulars = stageOf(fixtures, 1);
    return {
      championId: knockoutWinner(competition, fixtures, 2),
      promotedIds: groupStageAt(competition, 1).groups.flatMap((group) => table(competition, group, quadrangulars).slice(0, 2)),
      relegatedIds: firstPhase.slice(-serieCRelegated(competition.season)),
    };
  },
};

// Série D 2026: 96 clubs in 16 regional groups of six (home and away), top 4 to two-leg knockouts from
// 64 clubs to the final. Semi-finalists are promoted, and the four quarter-final losers play two-leg
// playoffs for two more places (Diario de Pernambuco,
// https://www.diariodepernambuco.com.br/esportes-dp/nacional/2025/10/11697172-com-as-mudancas-da-cbf-entenda-como-vai-ficar-a-serie-d.html).
// Clubs knocked out before the third phase (the last 32) leave Série D.
const REGION_ORDER: State[] = [
  "RR", "AM", "AC", "RO", "AP", "PA", "TO", "MA", "PI", "CE", "RN", "PB", "PE", "AL", "SE", "BA",
  "MT", "MS", "GO", "DF", "MG", "ES", "RJ", "SP", "PR", "SC", "RS",
];
const D_GROUP_SIZE = 6;
const D_QUALIFIERS_PER_GROUP = 4;
const D_STAGES = { groups: 0, lastThirtyTwo: 2, semiFinals: 5, final: 6 } as const;

function serieDSeeds(competition: LeagueCompetition, fixtures: readonly Fixture[]): string[] {
  const groupFixtures = stageOf(fixtures, 0);
  const placed: { row: StandingRow; position: number }[] = groupStageAt(competition, 0).groups.flatMap((group) =>
    standings(group, groupFixtures, competition.drawOrder)
      .slice(0, D_QUALIFIERS_PER_GROUP)
      .map((row, position) => ({ row, position })),
  );
  const ranked = standings(placed.map((p) => p.row.clubId), groupFixtures, competition.drawOrder).map((row) => row.clubId);
  return placed
    .sort((a, b) => a.position - b.position || ranked.indexOf(a.row.clubId) - ranked.indexOf(b.row.clubId))
    .map((p) => p.row.clubId);
}

// guess: best remaining seed meets the worst remaining seed from another group; CBF's real pairings are regional.
function crossGroupTies(rankedIds: readonly string[], groups: readonly string[][]): [string, string][] {
  const groupOf = new Map(groups.flatMap((group, g) => group.map((id) => [id, g])));
  const remaining = [...rankedIds];
  const ties: [string, string][] = [];
  while (remaining.length > 0) {
    const best = remaining.shift() ?? "";
    const reversed = [...remaining].reverse();
    const opponent = reversed.find((id) => groupOf.get(id) !== groupOf.get(best)) ?? reversed[0] ?? "";
    remaining.splice(remaining.indexOf(opponent), 1);
    ties.push([best, opponent]);
  }
  return ties;
}

const serieD: LeagueFormat = {
  stageDateCounts: () => [10, 2, 2, 2, 2, 2, 2],
  // Semi-finals and the quarter-final losers' playoffs share a stage.
  stageSizes: (clubCount) => {
    const lastSixtyFour = (clubCount / D_GROUP_SIZE) * D_QUALIFIERS_PER_GROUP;
    return [clubCount, lastSixtyFour, lastSixtyFour / 2, lastSixtyFour / 4, lastSixtyFour / 8, lastSixtyFour / 8, 2];
  },
  nextStage: (competition, fixtures, clubStates) => {
    const index = competition.stages.length;
    if (index === 0) {
      const byRegion = [...competition.clubIds].sort(
        (a, b) => REGION_ORDER.indexOf(clubStates[a] ?? "SP") - REGION_ORDER.indexOf(clubStates[b] ?? "SP") || a.localeCompare(b),
      );
      const groups = Array.from({ length: byRegion.length / D_GROUP_SIZE }, (_, g) => byRegion.slice(g * D_GROUP_SIZE, (g + 1) * D_GROUP_SIZE));
      return { kind: "groups", groups, legs: 2 };
    }
    const seeds = serieDSeeds(competition, fixtures);
    const bySeed = (ids: string[]) => ids.sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b));
    if (index === 1) return { kind: "knockout", ties: crossGroupTies(seeds, groupStageAt(competition, 0).groups) };
    const previous = tieResults(knockoutStageAt(competition, index - 1), stageOf(fixtures, index - 1));
    if (index === D_STAGES.semiFinals) {
      const semiFinals = seededTies(bySeed(previous.map((r) => r.winnerId)));
      const playoffs = seededTies(bySeed(previous.map((r) => r.loserId)));
      return { kind: "knockout", ties: [...semiFinals, ...playoffs] };
    }
    if (index === D_STAGES.final) return { kind: "knockout", ties: seededTies(bySeed(previous.slice(0, 2).map((r) => r.winnerId))) };
    return { kind: "knockout", ties: seededTies(bySeed(previous.map((r) => r.winnerId))) };
  },
  outcome: (competition, fixtures) => {
    const semiStage = knockoutStageAt(competition, D_STAGES.semiFinals);
    const semiResults = tieResults(semiStage, stageOf(fixtures, D_STAGES.semiFinals));
    const promotedIds = [...semiStage.ties.slice(0, 2).flat(), ...semiResults.slice(2).map((r) => r.winnerId)];
    const survivors = new Set(knockoutStageAt(competition, D_STAGES.lastThirtyTwo).ties.flat());
    return {
      championId: knockoutWinner(competition, fixtures, D_STAGES.final),
      promotedIds,
      relegatedIds: competition.clubIds.filter((id) => !survivors.has(id)),
    };
  },
};

// Série A and B 2026: 20 clubs, double round robin of 38 rounds; A relegates 4; B promotes 4 and
// relegates 4 (Band, https://www.band.com.br/nacional/brasil/ponte-preta-e-guarani-entenda-os-regulamentos-das-series-b-e-c-de-2026).
// A league abroad in the full tier: a straight round robin (SPEC §6), with as many clubs going up
// and down as its country's pyramid moves (`LeagueCompetition.abroad`).
const roundRobin: LeagueFormat = {
  stageDateCounts: (clubCount, legs) => [roundsOf(clubCount, legs)],
  stageSizes: (clubCount) => [clubCount],
  nextStage: (competition) => ({ kind: "groups", groups: [competition.clubIds], legs: competition.legs ?? 2 }),
  outcome: (competition, fixtures) => {
    const order = table(competition, competition.clubIds, fixtures);
    const { level = 0, promoted = 0, relegated = 0 } = competition.abroad ?? {};
    return { championId: order[0] ?? "", promotedIds: level > 0 ? order.slice(0, promoted) : [], relegatedIds: relegated ? order.slice(-relegated) : [] };
  },
};


// MLS 2026: 30 clubs in an Eastern and a Western Conference of 15, the Supporters' Shield to the best
// record, conference play-offs to the MLS Cup at the finalist with more points (MLS, https://www.mlssoccer.com/competition/).
// The game plays it shorter: each conference a double round robin (28 games, against the real 34 with
// some across conferences), then its top eight in single-match quarter-finals (1st hosts 8th), semi-finals
// and final, without MLS's wild-card games and best-of-three first round. The conferences meet twice
// whatever the game's formats, as MLS's result-only round robin of all 30 already meets once.
const MLS_EAST = new Set([
  "tm-51663", "tm-78435", "tm-432", "tm-51772", "tm-813", "tm-2440", "tm-69261", "tm-4078",
  "tm-63966", "tm-626", "tm-40058", "tm-623", "tm-45604", "tm-25467", "tm-11141",
]);
const PLAYOFF_PLACES = 8;
const MLS_STAGES = { conferences: 0, final: 4 } as const;

const conferencesOf = (clubIds: readonly string[]) => [clubIds.filter((id) => MLS_EAST.has(id)), clubIds.filter((id) => !MLS_EAST.has(id))];

/** Each conference's table after its round robin, East first. */
function conferenceTables(competition: LeagueCompetition, fixtures: readonly Fixture[]): string[][] {
  const played = stageOf(fixtures, MLS_STAGES.conferences);
  return groupStageAt(competition, MLS_STAGES.conferences).groups.map((group) => table(competition, group, played));
}

const placeIn = (order: readonly string[]) => (a: string, b: string) => order.indexOf(a) - order.indexOf(b);

/** The round's winners paired in bracket order (first tie's winner against the last's), the better seed first. */
function bracketTies(winners: readonly string[], seeds: readonly string[]): [string, string][] {
  const half = winners.length / 2;
  return winners.slice(0, half).map((id, i): [string, string] => {
    const pair = [id, winners[winners.length - 1 - i] ?? ""].sort(placeIn(seeds));
    return [pair[0] ?? "", pair[1] ?? ""];
  });
}

const mls: LeagueFormat = {
  stageDateCounts: (clubCount) => [roundsOf(Math.ceil(clubCount / 2), 2), 1, 1, 1, 1],
  stageSizes: (clubCount) => [clubCount, 2 * PLAYOFF_PLACES, PLAYOFF_PLACES, 4, 2],
  nextStage: (competition, fixtures) => {
    const index = competition.stages.length;
    if (index === MLS_STAGES.conferences) return { kind: "groups", groups: conferencesOf(competition.clubIds), legs: 2 };
    const conferences = conferenceTables(competition, fixtures);
    if (index === 1) return { kind: "knockout", ties: conferences.flatMap((order) => seededTies(order.slice(0, PLAYOFF_PLACES))) };
    const winners = tieResults(knockoutStageAt(competition, index - 1), stageOf(fixtures, index - 1)).map((r) => r.winnerId);
    if (index === MLS_STAGES.final) {
      const overall = table(competition, competition.clubIds, stageOf(fixtures, MLS_STAGES.conferences));
      const [first = "", second = ""] = [...winners].sort(placeIn(overall));
      return { kind: "knockout", ties: [[first, second]] };
    }
    const perConference = winners.length / 2;
    return {
      kind: "knockout",
      ties: conferences.flatMap((order, c) => bracketTies(winners.slice(c * perConference, (c + 1) * perConference), order)),
    };
  },
  outcome: (competition, fixtures) => ({ championId: knockoutWinner(competition, fixtures, MLS_STAGES.final), promotedIds: [], relegatedIds: [] }),
  finalOrder: (competition, fixtures) => {
    const champion = knockoutWinner(competition, fixtures, MLS_STAGES.final);
    const overall = table(competition, competition.clubIds, stageOf(fixtures, MLS_STAGES.conferences));
    return [champion, ...overall.filter((id) => id !== champion)];
  },
};

// Liga MX 2026: 18 clubs play two tournaments a year, the Clausura from January and the Apertura from
// July, each a single round robin and a liguilla of two-leg ties to its own champion; relegation is
// suspended (Liga MX, https://ligamx.net/cancha/reglamento). The game plays the liguilla of the top eight
// (1st against 8th, reseeded semi-finals), without the play-in for 7th to 10th; a quarter- or
// semi-final level on aggregate sends the better seed through, a final goes to extra time (tieBreaks.ts). It files the Apertura's
// champion as the season's. With the league met once, each liguilla tie is one match.
const LIGA_MX_TOURNAMENT = 4;

function ligaMxStage(competition: LeagueCompetition, fixtures: readonly Fixture[]): StageShape {
  const index = competition.stages.length;
  const tournament = index < LIGA_MX_TOURNAMENT ? 0 : LIGA_MX_TOURNAMENT;
  const round = index - tournament;
  if (round === 0) {
    const order = tournament === 0 ? competition.clubIds : [...competition.clubIds].reverse();
    return { kind: "groups", groups: [order], legs: 1 };
  }
  const seeds = table(competition, competition.clubIds, stageOf(fixtures, tournament));
  if (round === 1) return { kind: "knockout", ties: seededTies(seeds.slice(0, PLAYOFF_PLACES)) };
  const winners = tieResults(knockoutStageAt(competition, index - 1), stageOf(fixtures, index - 1)).map((r) => r.winnerId);
  return { kind: "knockout", ties: seededTies([...winners].sort(placeIn(seeds))) };
}

const ligaMx: LeagueFormat = {
  stageDateCounts: (clubCount, legs) => {
    const tournament = roundsOf(clubCount, 1);
    return [tournament, legs, legs, legs, tournament, legs, legs, legs];
  },
  stageSizes: (clubCount) => [clubCount, PLAYOFF_PLACES, 4, 2, clubCount, PLAYOFF_PLACES, 4, 2],
  nextStage: ligaMxStage,
  outcome: (competition, fixtures) => ({ championId: knockoutWinner(competition, fixtures, 2 * LIGA_MX_TOURNAMENT - 1), promotedIds: [], relegatedIds: [] }),
  finalOrder: (competition, fixtures) => {
    const champion = knockoutWinner(competition, fixtures, 2 * LIGA_MX_TOURNAMENT - 1);
    const tournaments = fixtures.filter((f) => f.stage === 0 || f.stage === LIGA_MX_TOURNAMENT);
    return [champion, ...table(competition, competition.clubIds, tournaments).filter((id) => id !== champion)];
  },
};

export const LEAGUE_FORMATS: Record<LeagueFormatId, LeagueFormat> = {
  "round-robin": roundRobin,
  "serie-a": singleTable(4, 0),
  "serie-b": singleTable(4, 4),
  "serie-c": serieC,
  "serie-d": serieD,
  mls,
  "liga-mx": ligaMx,
};

/** The league's final order, champion first: its format's, or the table of all its matches. */
export function finalOrderOf(competition: LeagueCompetition, fixtures: readonly Fixture[]): string[] {
  const { finalOrder } = LEAGUE_FORMATS[competition.format];
  return finalOrder ? finalOrder(competition, fixtures) : table(competition, competition.clubIds, fixtures);
}

