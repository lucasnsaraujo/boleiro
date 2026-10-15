import type { Competition, ContinentalCompetition, ContinentalCup, Fixture, IsoDate } from "../gameState.js";
import type { StageShape } from "../leagueFormats.js";
import { inSeason } from "../seasonCalendar.js";
import { groupStageAt, knockoutStageAt } from "../stageAt.js";
import { standings } from "../standings.js";
import { tieResults, type TieResult } from "../tieResults.js";

type CupStage = { name: string; dates: IsoDate[] };

// The 2026 formats (CONMEBOL regulations): the Libertadores has three two-leg preliminary stages,
// eight groups of four playing home and away, two-leg ties from the round of 16 and a single-match
// final; the Sul-Americana a first stage of national ties, eight groups of four, a play-off between
// its group runners-up and the Libertadores' group thirds, two-leg ties and a single-match final;
// the Recopa the two champions over two legs.
// guess: dates on the usual CONMEBOL weeks, the Libertadores on Tuesdays and the Sul-Americana and
// Recopa on Thursdays, days the Brazilian calendar never uses; the finals on a weekday too, though
// CONMEBOL plays them on a Saturday at a neutral ground, because a Saturday may hold a Série A round.
export const CUP_STAGES: Record<ContinentalCup, readonly CupStage[]> = {
  libertadores: [
    { name: "stage-1", dates: ["2026-02-03", "2026-02-10"] },
    { name: "stage-2", dates: ["2026-02-17", "2026-02-24"] },
    { name: "stage-3", dates: ["2026-03-03", "2026-03-10"] },
    { name: "groups", dates: ["2026-04-07", "2026-04-14", "2026-04-21", "2026-04-28", "2026-05-12", "2026-05-19"] },
    { name: "round-of-16", dates: ["2026-08-11", "2026-08-18"] },
    { name: "quarter-finals", dates: ["2026-09-15", "2026-09-22"] },
    { name: "semi-finals", dates: ["2026-10-20", "2026-10-27"] },
    { name: "final", dates: ["2026-11-24"] },
  ],
  // guess: the first stage's national ties are single matches at the better seed's ground.
  "sul-americana": [
    { name: "stage-1", dates: ["2026-03-19"] },
    { name: "groups", dates: ["2026-04-09", "2026-04-16", "2026-04-23", "2026-04-30", "2026-05-14", "2026-05-21"] },
    { name: "playoffs", dates: ["2026-07-16", "2026-07-23"] },
    { name: "round-of-16", dates: ["2026-08-13", "2026-08-20"] },
    { name: "quarter-finals", dates: ["2026-09-17", "2026-09-24"] },
    { name: "semi-finals", dates: ["2026-10-22", "2026-10-29"] },
    { name: "final", dates: ["2026-11-19"] },
  ],
  recopa: [{ name: "final", dates: ["2026-02-19", "2026-02-26"] }],
};

const GROUP_COUNT = 8;
const LIBERTADORES = { stage1: 0, stage2: 1, stage3: 2, groups: 3, roundOf16: 4 } as const;
const SUL_AMERICANA = { stage1: 0, groups: 1, playoffs: 2, roundOf16: 3 } as const;

/** What a cup's next draw reads besides its own stages: the season's competitions and every fixture so far. */
export type SeasonSoFar = { competitions: Readonly<Record<string, Competition>>; fixtures: readonly Fixture[] };

export function cupStageDates(cup: ContinentalCup, season: number): IsoDate[][] {
  return CUP_STAGES[cup].map((stage) => stage.dates.map((date) => inSeason(date, season)));
}

const fixturesOf = (competition: Competition, fixtures: readonly Fixture[], stage: number) =>
  fixtures.filter((f) => f.competitionId === competition.id && f.stage === stage);

function tiesOf(competition: Competition, fixtures: readonly Fixture[], stage: number): TieResult[] {
  return tieResults(knockoutStageAt(competition, stage), fixturesOf(competition, fixtures, stage));
}

/** Each group's clubs in table order, group by group. */
export function groupOrders(competition: Competition, fixtures: readonly Fixture[], stage: number): string[][] {
  const played = fixturesOf(competition, fixtures, stage);
  return groupStageAt(competition, stage).groups.map((group, index) =>
    standings(group, played.filter((f) => f.group === index), competition.drawOrder).map((row) => row.clubId),
  );
}

function drawn(competition: ContinentalCompetition, ids: readonly string[]): string[] {
  const order = new Map(competition.drawOrder.map((id, i) => [id, i]));
  return [...ids].sort((a, b) => (order.get(a) ?? -1) - (order.get(b) ?? -1));
}

const pairOff = (ids: readonly string[]): [string, string][] =>
  Array.from({ length: Math.floor(ids.length / 2) }, (_, i): [string, string] => [ids[2 * i] ?? "", ids[2 * i + 1] ?? ""]);

/**
 * Eight groups drawn from pots of eight in seeding order: each club goes to the first group, from a
 * place that moves with the draw, that still lacks a club of its pot and has none of its country.
 */
function drawGroups(competition: ContinentalCompetition, seeded: readonly string[]): string[][] {
  const groups: string[][] = Array.from({ length: GROUP_COUNT }, () => []);
  const countryOf = (id: string) => competition.countries[id] ?? id;
  for (let pot = 0; pot * GROUP_COUNT < seeded.length; pot++) {
    drawn(competition, seeded.slice(pot * GROUP_COUNT, (pot + 1) * GROUP_COUNT)).forEach((id, i) => {
      const order = groups.map((_, g) => (g + i) % GROUP_COUNT);
      const open = order.filter((g) => (groups[g]?.length ?? 0) === pot);
      const target = open.find((g) => !groups[g]?.some((other) => countryOf(other) === countryOf(id))) ?? open[0] ?? order[0] ?? 0;
      groups[target]?.push(id);
    });
  }
  return groups;
}

/** Each of `hosts` against one of `visitors`, in draw order, never two clubs of the same group; the host plays the second leg at home. */
function crossTies(competition: ContinentalCompetition, hosts: readonly string[], visitors: readonly string[], groupOf: (id: string) => number): [string, string][] {
  const left = drawn(competition, visitors);
  return drawn(competition, hosts).map((host): [string, string] => {
    const index = Math.max(0, left.findIndex((visitor) => groupOf(visitor) !== groupOf(host)));
    const [visitor = ""] = left.splice(index, 1);
    return [host, visitor];
  });
}

const groupIndexIn = (groups: readonly (readonly string[])[]) => (id: string) => groups.findIndex((group) => group.includes(id));

function libertadoresStage(competition: ContinentalCompetition, season: SeasonSoFar, index: number): StageShape {
  const { fixtures } = season;
  const winners = (stage: number) => tiesOf(competition, fixtures, stage).map((tie) => tie.winnerId);
  switch (index) {
    case LIBERTADORES.stage1:
      return { kind: "knockout", ties: pairOff(drawn(competition, competition.entries[index] ?? [])) };
    case LIBERTADORES.stage2:
      return { kind: "knockout", ties: pairOff(drawn(competition, [...winners(LIBERTADORES.stage1), ...(competition.entries[index] ?? [])])) };
    case LIBERTADORES.stage3:
      return { kind: "knockout", ties: pairOff(winners(LIBERTADORES.stage2)) };
    case LIBERTADORES.groups:
      return { kind: "groups", groups: drawGroups(competition, [...(competition.entries[index] ?? []), ...winners(LIBERTADORES.stage3)]), legs: 2 };
    case LIBERTADORES.roundOf16: {
      const orders = groupOrders(competition, fixtures, LIBERTADORES.groups);
      const groupOf = groupIndexIn(orders);
      return { kind: "knockout", ties: crossTies(competition, orders.map((o) => o[0] ?? ""), orders.map((o) => o[1] ?? ""), groupOf) };
    }
    default:
      return { kind: "knockout", ties: pairOff(winners(index - 1)) };
  }
}

/** The season's Libertadores, whose clubs drop into the Sul-Americana. */
function libertadoresOf(competition: ContinentalCompetition, season: SeasonSoFar): ContinentalCompetition | null {
  const found = Object.values(season.competitions).find((c) => c.kind === "continental" && c.cup === "libertadores" && c.season === competition.season);
  return found?.kind === "continental" ? found : null;
}

/** First seed against fourth and second against third within each country, in each country's seeding order. */
function nationalTies(competition: ContinentalCompetition, seeded: readonly string[]): [string, string][] {
  const byCountry = new Map<string, string[]>();
  for (const id of seeded) {
    const country = competition.countries[id] ?? id;
    byCountry.set(country, [...(byCountry.get(country) ?? []), id]);
  }
  return [...byCountry.values()].flatMap((ids) => {
    const half = Math.floor(ids.length / 2);
    return ids.slice(0, half).map((id, i): [string, string] => [id, ids[ids.length - 1 - i] ?? ""]);
  });
}

function sulAmericanaStage(competition: ContinentalCompetition, season: SeasonSoFar, index: number): StageShape {
  const { fixtures } = season;
  const libertadores = libertadoresOf(competition, season);
  const winners = (stage: number) => tiesOf(competition, fixtures, stage).map((tie) => tie.winnerId);
  switch (index) {
    case SUL_AMERICANA.stage1:
      return { kind: "knockout", ties: nationalTies(competition, competition.entries[index] ?? []) };
    case SUL_AMERICANA.groups: {
      const knockedOut = libertadores && libertadores.stages.length > LIBERTADORES.stage3 ? tiesOf(libertadores, fixtures, LIBERTADORES.stage3).map((t) => t.loserId) : [];
      return { kind: "groups", groups: drawGroups(competition, [...(competition.entries[index] ?? []), ...knockedOut, ...winners(SUL_AMERICANA.stage1)]), legs: 2 };
    }
    case SUL_AMERICANA.playoffs: {
      const orders = groupOrders(competition, fixtures, SUL_AMERICANA.groups);
      const thirds = libertadores && libertadores.stages.length > LIBERTADORES.groups ? groupOrders(libertadores, fixtures, LIBERTADORES.groups).map((o) => o[2] ?? "") : [];
      return { kind: "knockout", ties: crossTies(competition, thirds, orders.map((o) => o[1] ?? ""), () => -1) };
    }
    case SUL_AMERICANA.roundOf16: {
      const orders = groupOrders(competition, fixtures, SUL_AMERICANA.groups);
      return { kind: "knockout", ties: crossTies(competition, orders.map((o) => o[0] ?? ""), winners(SUL_AMERICANA.playoffs), () => -1) };
    }
    default:
      return { kind: "knockout", ties: pairOff(winners(index - 1)) };
  }
}

export const CONMEBOL_CUPS = {
  /** The draw of the cup's next stage, from its own results and, for the Sul-Americana, the Libertadores'. */
  nextStage(competition: ContinentalCompetition, season: SeasonSoFar): StageShape {
    const index = competition.stages.length;
    switch (competition.cup) {
      case "libertadores":
        return libertadoresStage(competition, season, index);
      case "sul-americana":
        return sulAmericanaStage(competition, season, index);
      case "recopa":
        return { kind: "knockout", ties: pairOff(competition.entries[0] ?? []) };
    }
  },

  /** Winner and runner-up once the final is played. */
  finalists(competition: ContinentalCompetition, fixtures: readonly Fixture[]): { championId: string; runnerUpId: string } | null {
    const last = competition.stageDates.length - 1;
    if (competition.stages.length <= last) return null;
    const final = fixturesOf(competition, fixtures, last);
    if (final.length === 0 || final.some((f) => !f.result)) return null;
    const [tie] = tiesOf(competition, fixtures, last);
    return tie ? { championId: tie.winnerId, runnerUpId: tie.loserId } : null;
  },
};
