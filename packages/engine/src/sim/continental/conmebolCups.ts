import { CONTINENTAL_CUPS, type Competition, type ContinentalCompetition, type ContinentalCup, type Fixture, type IsoDate } from "../gameState.js";
import { groupDates, knockoutDates, REALISTA, type Formats } from "../formats.js";
import type { StageShape } from "../leagueFormats.js";
import { inSeason } from "../seasonCalendar.js";
import { groupStageAt, knockoutStageAt } from "../stageAt.js";
import { standings } from "../standings.js";
import { tieResults, type TieResult } from "../tieResults.js";
import { CLUB_WORLD_CUP_STAGES, clubWorldCupStage } from "./clubWorldCup.js";
import { INTERCONTINENTAL_CUP_STAGES, intercontinentalCupStage, isIntercontinentalStageReady, type LaterEntrants } from "./intercontinentalCup.js";

type CupStage = { name: string; dates: IsoDate[] };

// The 2026 formats (CONMEBOL regulations): the Libertadores has three two-leg preliminary stages,
// eight groups of four playing home and away, two-leg ties from the round of 16 and a single-match
// final; the Sul-Americana a first stage of national ties, eight groups of four, a play-off between
// its group runners-up and the Libertadores' group thirds, two-leg ties and a single-match final;
// the Recopa the two champions over two legs.
// guess: dates on the usual CONMEBOL weeks, the Libertadores on Tuesdays and the Sul-Americana and
// Recopa on Thursdays, days the Brazilian calendar never uses, and clear of the weeks of the Copa do
// Brasil's fixed Wednesdays; the finals on a weekday too, though CONMEBOL plays them on a Saturday at
// a neutral ground, because a Saturday may hold a Série A round.
export const CUP_STAGES: Record<ContinentalCup, readonly CupStage[]> = {
  libertadores: [
    { name: "stage-1", dates: ["2026-02-03", "2026-02-10"] },
    { name: "stage-2", dates: ["2026-02-17", "2026-02-24"] },
    { name: "stage-3", dates: ["2026-03-03", "2026-03-10"] },
    { name: "groups", dates: ["2026-04-07", "2026-04-14", "2026-04-28", "2026-05-05", "2026-05-19", "2026-05-26"] },
    { name: "round-of-16", dates: ["2026-08-11", "2026-08-18"] },
    { name: "quarter-finals", dates: ["2026-09-15", "2026-09-22"] },
    { name: "semi-finals", dates: ["2026-10-13", "2026-10-20"] },
    { name: "final", dates: ["2026-11-24"] },
  ],
  // guess: the first stage's national ties are single matches at the better seed's ground.
  "sul-americana": [
    { name: "stage-1", dates: ["2026-03-19"] },
    { name: "groups", dates: ["2026-04-09", "2026-04-16", "2026-04-30", "2026-05-07", "2026-05-21", "2026-05-28"] },
    { name: "playoffs", dates: ["2026-07-16", "2026-07-23"] },
    { name: "round-of-16", dates: ["2026-08-13", "2026-08-20"] },
    { name: "quarter-finals", dates: ["2026-09-17", "2026-09-24"] },
    { name: "semi-finals", dates: ["2026-10-15", "2026-10-22"] },
    { name: "final", dates: ["2026-11-19"] },
  ],
  recopa: [{ name: "final", dates: ["2026-02-19", "2026-02-26"] }],
  "club-world-cup": CLUB_WORLD_CUP_STAGES,
  "intercontinental-cup": INTERCONTINENTAL_CUP_STAGES,
};

const GROUP_COUNT = 8;
const LIBERTADORES = { stage1: 0, stage2: 1, stage3: 2, groups: 3, roundOf16: 4 } as const;
const SUL_AMERICANA = { stage1: 0, groups: 1, playoffs: 2, roundOf16: 3 } as const;

/** What a cup's next draw reads besides its own stages: the season's competitions, every fixture so far and the latest Champions League winner. */
export type SeasonSoFar = { competitions: Readonly<Record<string, Competition>>; fixtures: readonly Fixture[]; championsLeague?: string | null };

/** The dates `formats` plays of a stage's real `dates`: some of the group days, or one match for a knockout round. */
export const stageDatesIn = (name: string, dates: readonly IsoDate[], formats: Formats): IsoDate[] =>
  name === "groups" ? groupDates(dates, formats) : knockoutDates(name, dates, formats);

export function cupStageDates(cup: ContinentalCup, season: number, formats: Formats = REALISTA): IsoDate[][] {
  return CUP_STAGES[cup].map((stage) => stageDatesIn(stage.name, stage.dates, formats).map((date) => inSeason(date, season)));
}

/**
 * Every date of the season's CONMEBOL cups and, when `playsClubWorldCup`, the Club World Cup's. The
 * Intercontinental Cup's are left out: they fall on days its clubs' leagues already keep clear.
 */
export function conmebolDates(season: number, formats: Formats, playsClubWorldCup: boolean): IsoDate[] {
  return CONTINENTAL_CUPS.filter((cup) => cup !== "intercontinental-cup" && (playsClubWorldCup || cup !== "club-world-cup")).flatMap((cup) => cupStageDates(cup, season, formats).flat());
}

const FULL_GROUP_DAYS = 6;
/** Groups of four meet once when their stage has three match days, twice with six. */
const groupLegs = (competition: ContinentalCompetition, index: number): 1 | 2 => ((competition.stageDates[index]?.length ?? FULL_GROUP_DAYS) < FULL_GROUP_DAYS ? 1 : 2);

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

/**
 * Each of `hosts` against one of `visitors`, in draw order, never two clubs of the same group; the host
 * plays the second leg at home. When picking each host's first eligible visitor would leave the last
 * host its own group's club, the draw starts again from the next visitor, as a redrawn pot would.
 */
function crossTies(competition: ContinentalCompetition, hosts: readonly string[], visitors: readonly string[], groupOf: (id: string) => number): [string, string][] {
  const drawnHosts = drawn(competition, hosts);
  const drawnVisitors = drawn(competition, visitors);
  const attempt = (start: number): [string, string][] => {
    const left = [...drawnVisitors.slice(start), ...drawnVisitors.slice(0, start)];
    return drawnHosts.map((host): [string, string] => {
      const index = Math.max(0, left.findIndex((visitor) => groupOf(visitor) !== groupOf(host)));
      const [visitor = ""] = left.splice(index, 1);
      return [host, visitor];
    });
  };
  const isApart = (ties: readonly [string, string][]) => ties.every(([host, visitor]) => groupOf(host) < 0 || groupOf(host) !== groupOf(visitor));
  const attempts = drawnVisitors.map((_, start) => attempt(start));
  return attempts.find(isApart) ?? attempt(0);
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
      return { kind: "groups", groups: drawGroups(competition, [...(competition.entries[index] ?? []), ...winners(LIBERTADORES.stage3)]), legs: groupLegs(competition, index) };
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
      return { kind: "groups", groups: drawGroups(competition, [...(competition.entries[index] ?? []), ...knockedOut, ...winners(SUL_AMERICANA.stage1)]), legs: groupLegs(competition, index) };
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

/** The season's Libertadores winner once its final is played, and the latest Champions League one. */
function laterEntrants(competition: ContinentalCompetition, season: SeasonSoFar): LaterEntrants {
  const libertadores = libertadoresOf(competition, season);
  const fixtures = libertadores ? season.fixtures.filter((f) => f.competitionId === libertadores.id) : [];
  return { libertadores: (libertadores && CONMEBOL_CUPS.finalists(libertadores, fixtures)?.championId) ?? null, championsLeague: season.championsLeague ?? null };
}

export const CONMEBOL_CUPS = {
  /** Whether the cup's next stage can be drawn: the Intercontinental Cup's Derby of the Americas waits for the Libertadores' final. */
  isNextStageReady(competition: ContinentalCompetition, season: SeasonSoFar): boolean {
    return competition.cup !== "intercontinental-cup" || isIntercontinentalStageReady(competition, laterEntrants(competition, season));
  },

  /** The draw of the cup's next stage, from its own results and, for the Sul-Americana, the Libertadores'; FIFA's cups' too. */
  nextStage(competition: ContinentalCompetition, season: SeasonSoFar): StageShape {
    const index = competition.stages.length;
    switch (competition.cup) {
      case "libertadores":
        return libertadoresStage(competition, season, index);
      case "sul-americana":
        return sulAmericanaStage(competition, season, index);
      case "recopa":
        return { kind: "knockout", ties: pairOff(competition.entries[0] ?? []) };
      case "club-world-cup":
        return clubWorldCupStage(competition, season.fixtures);
      case "intercontinental-cup":
        return intercontinentalCupStage(competition, season.fixtures, laterEntrants(competition, season));
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
