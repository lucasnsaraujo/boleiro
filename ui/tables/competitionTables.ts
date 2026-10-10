import type { Competition, Fixture, GameState, KnockoutStage, SeasonCalendar, StateCompetition } from "../../src/sim/gameState.js";
import { COPA_DO_BRASIL } from "../../src/sim/copaDoBrasil.js";
import { continentalQualifiers } from "../../src/sim/finances/continentalQualifiers.js";
import { competitionKey } from "../../src/sim/history/history.js";
import { LEAGUE_FORMATS } from "../../src/sim/leagueFormats.js";
import { STATE_CHAMPIONSHIP } from "../../src/sim/stateChampionship.js";
import { standings, type StandingRow } from "../../src/sim/standings.js";
import { aggregate, tieResults } from "../../src/sim/tieResults.js";

export type ZoneKind = "libertadores" | "preLibertadores" | "sulAmericana" | "promotion" | "advance" | "relegation";
export type ZoneKey = { zone: ZoneKind; label: string };
export type TableRow = StandingRow & { position: number; zone: ZoneKind | null };
export type GroupTable = { label: string | null; rows: TableRow[] };

export type Leg = { fixtureId: string; date: string; homeId: string; awayId: string; homeGoals: number | null; awayGoals: number | null };
/** `aggregate` follows `clubIds`; the first club hosts the last leg. `isPlayoff` marks a tie for a place, not a step toward the final. */
export type TieView = {
  clubIds: [string, string];
  legs: Leg[];
  aggregate: [number, number] | null;
  winnerId: string | null;
  onPenalties: boolean;
  isPlayoff: boolean;
};
/** The Copa do Brasil's finalists once its final is played; they take the first continental places. */
export type CopaFinalists = { championId: string; runnerUpId: string } | null;
export type StageTab = { index: number; name: string; isDrawn: boolean };
export type Scorer = { playerId: string; name: string; clubId: string; goals: number };

const KIND_ORDER: Record<Competition["kind"], number> = { state: 0, league: 1, cup: 2 };

/** The tabs of the tables screen: what the coach's club plays this season, or the Série A and the cup without a club. */
export function coachCompetitions({ coachClubId, competitions, season }: Pick<GameState, "coachClubId" | "competitions" | "season">): Competition[] {
  const shown = (c: Competition) => (coachClubId ? c.clubIds.includes(coachClubId) : c.kind === "cup" || (c.kind === "league" && c.division === "A"));
  return Object.values(competitions)
    .filter((c) => c.season === season && shown(c))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

const CUP_ROUND_NAMES: Record<string, string> = {
  "phase-1": "1ª fase",
  "phase-2": "2ª fase",
  "phase-3": "3ª fase",
  "phase-4": "4ª fase",
  "phase-5": "5ª fase",
  "round-of-16": "Oitavas",
  "quarter-finals": "Quartas",
  "semi-finals": "Semifinal",
  final: "Final",
};
const KNOCKOUT_BY_CLUBS: Record<number, string> = { 16: "Oitavas", 8: "Quartas", 4: "Semifinal", 2: "Final" };
const LEAGUE_STAGE_NAMES: Record<string, readonly string[]> = {
  "serie-c": ["Primeira fase", "Quadrangular", "Final"],
  // The semi-finals share their stage with the quarter-final losers' playoffs.
  "serie-d": ["Grupos", "2ª fase", "3ª fase", "Oitavas", "Quartas", "Semifinal", "Final"],
};

function stageNames(competition: Competition, calendar: SeasonCalendar): string[] {
  switch (competition.kind) {
    case "cup":
      return Array.from({ length: COPA_DO_BRASIL.stageCount }, (_, i) => {
        const round = calendar.copaDoBrasilRounds[i]?.name ?? "";
        return CUP_ROUND_NAMES[round] ?? `${i + 1}ª fase`;
      });
    case "state":
      return STATE_CHAMPIONSHIP.stageSizes(competition.clubIds.length).map((clubs, i) => (i === 0 ? "Grupos" : (KNOCKOUT_BY_CLUBS[clubs] ?? `${i + 1}ª fase`)));
    case "league": {
      const count = LEAGUE_FORMATS[competition.format].stageSizes(competition.clubIds.length).length;
      const names = LEAGUE_STAGE_NAMES[competition.format] ?? [];
      return Array.from({ length: count }, (_, i) => names[i] ?? (count === 1 ? "Tabela" : `${i + 1}ª fase`));
    }
  }
}

/** Every stage of the competition by name, drawn or still to come. */
export function competitionStages(competition: Competition, calendar: SeasonCalendar): StageTab[] {
  return stageNames(competition, calendar).map((name, index) => ({ index, name, isDrawn: index < competition.stages.length }));
}

const clubsIn = (stage: Competition["stages"][number]) => (stage.kind === "groups" ? stage.groups.flat() : stage.ties.flat());

/** The stage the screen opens on: the latest one with the coach's club in it, else the latest drawn. */
export function defaultStage(competition: Competition, coachClubId: string | null): number {
  const withClub = coachClubId ? competition.stages.findLastIndex((stage) => clubsIn(stage).includes(coachClubId)) : -1;
  return withClub >= 0 ? withClub : Math.max(0, competition.stages.length - 1);
}

const ZONE_ORDER: readonly ZoneKind[] = ["libertadores", "preLibertadores", "sulAmericana", "promotion", "advance", "relegation"];

const ZONE_LABELS: Record<Exclude<ZoneKind, "advance">, string> = {
  libertadores: "Libertadores",
  preLibertadores: "Pré-Libertadores",
  sulAmericana: "Sul-Americana",
  promotion: "Acesso",
  relegation: "Rebaixamento",
};

// Série C 2026 relegates two; from 2027 it relegates six (src/sim/leagueFormats.ts, serieCRelegated).
const serieCRelegated = (season: number) => (season <= 2026 ? 2 : 6);
// Each Série C quadrangular promotes its top two (src/sim/leagueFormats.ts).
const QUADRANGULAR_PROMOTED = 2;

type Zoning = { zoneOf: (clubId: string, position: number, groupSize: number) => ZoneKind | null; advanceLabel: string };

const NO_ZONES: Zoning = { zoneOf: () => null, advanceLabel: "" };

function memberZones(zones: readonly [ZoneKind, readonly string[]][]): Zoning["zoneOf"] {
  return (clubId) => zones.find(([, ids]) => ids.includes(clubId))?.[0] ?? null;
}

/** State championship clubs ranked by group position, then by their record across all groups, as the draw seeds them. */
function stateRanking(competition: StateCompetition, groups: readonly string[][], stageFixtures: readonly Fixture[]): string[] {
  const overall = standings(competition.clubIds, stageFixtures, competition.drawOrder).map((row) => row.clubId);
  return groups
    .flatMap((group) => standings(group, stageFixtures, competition.drawOrder).map((row, position) => ({ id: row.clubId, position })))
    .sort((a, b) => a.position - b.position || overall.indexOf(a.id) - overall.indexOf(b.id))
    .map(({ id }) => id);
}

function zoning(competition: Competition, stage: number, groups: readonly string[][], stageFixtures: readonly Fixture[], copa: CopaFinalists): Zoning {
  if (competition.kind === "cup") return NO_ZONES;
  if (competition.kind === "state") {
    if (stage !== 0) return NO_ZONES;
    const through = STATE_CHAMPIONSHIP.stageSizes(competition.clubIds.length)[1] ?? 0;
    const qualified = stateRanking(competition, groups, stageFixtures).slice(0, through);
    return { zoneOf: memberZones([["advance", qualified]]), advanceLabel: "Mata-mata" };
  }
  const format = LEAGUE_FORMATS[competition.format];
  const sizes = format.stageSizes(competition.clubIds.length);
  if (sizes.length === 1) {
    const { promotedIds, relegatedIds } = format.outcome(competition, stageFixtures);
    const order = standings(competition.clubIds, stageFixtures, competition.drawOrder).map((row) => row.clubId);
    const continental = competition.division === "A" ? continentalQualifiers(order, copa) : null;
    return {
      zoneOf: memberZones([
        ["libertadores", continental?.libertadoresGroups ?? []],
        ["preLibertadores", continental?.libertadoresPreliminary ?? []],
        ["sulAmericana", continental?.sulAmericana ?? []],
        ["promotion", promotedIds],
        ["relegation", relegatedIds],
      ]),
      advanceLabel: "",
    };
  }
  if (competition.format === "serie-c" && stage === 0) {
    const through = sizes[1] ?? 0;
    const relegated = serieCRelegated(competition.season);
    return {
      zoneOf: (_, position, groupSize) => (position <= through ? "advance" : position > groupSize - relegated ? "relegation" : null),
      advanceLabel: "Quadrangular",
    };
  }
  if (competition.format === "serie-c" && stage === 1) return { zoneOf: (_, position) => (position <= QUADRANGULAR_PROMOTED ? "promotion" : null), advanceLabel: "" };
  if (competition.format === "serie-d" && stage === 0) {
    const through = (sizes[1] ?? 0) / Math.max(1, groups.length);
    return { zoneOf: (_, position) => (position <= through ? "advance" : "relegation"), advanceLabel: "2ª fase" };
  }
  return NO_ZONES;
}

const stageFixturesOf = (competition: Competition, stage: number, fixtures: readonly Fixture[]) =>
  fixtures.filter((f) => f.competitionId === competition.id && f.stage === stage);

const groupLetter = (index: number) => String.fromCharCode(65 + index);

/** A group stage's tables as they stand, each row in its zone if the stage ended now. */
export function groupTables(
  competition: Competition,
  stage: number,
  fixtures: readonly Fixture[],
  copa: CopaFinalists = null,
): { groups: GroupTable[]; zones: ZoneKey[] } {
  const shape = competition.stages[stage];
  if (shape?.kind !== "groups") return { groups: [], zones: [] };
  const stageFixtures = stageFixturesOf(competition, stage, fixtures);
  const { zoneOf, advanceLabel } = zoning(competition, stage, shape.groups, stageFixtures, copa);
  const groups = shape.groups.map((group, g) => ({
    label: shape.groups.length > 1 ? `Grupo ${groupLetter(g)}` : null,
    rows: standings(group, stageFixtures, competition.drawOrder).map((row, i) => ({ ...row, position: i + 1, zone: zoneOf(row.clubId, i + 1, group.length) })),
  }));
  const seen = new Set<ZoneKind>();
  const zones: ZoneKey[] = [];
  for (const row of groups.flatMap((g) => g.rows)) {
    if (!row.zone || seen.has(row.zone)) continue;
    seen.add(row.zone);
    zones.push({ zone: row.zone, label: row.zone === "advance" ? advanceLabel : ZONE_LABELS[row.zone] });
  }
  return { groups, zones: zones.sort((a, b) => ZONE_ORDER.indexOf(a.zone) - ZONE_ORDER.indexOf(b.zone)) };
}

// Série D's semi-final stage lists the two semi-finals first, then the quarter-final losers' playoffs (src/sim/leagueFormats.ts).
const SERIE_D_PLAYOFF_STAGE = 5;
const SERIE_D_SEMI_FINALS = 2;

const isPlayoff = (competition: Competition, stage: number, tie: number) =>
  competition.kind === "league" && competition.format === "serie-d" && stage === SERIE_D_PLAYOFF_STAGE && tie >= SERIE_D_SEMI_FINALS;

function tieView(stage: KnockoutStage, tie: number, clubIds: [string, string], stageFixtures: readonly Fixture[]): Omit<TieView, "isPlayoff"> {
  const legFixtures = stageFixtures.filter((f) => f.tie === tie).sort((a, b) => a.date.localeCompare(b.date));
  const played = legFixtures.filter((f) => f.result);
  const isOver = legFixtures.length > 0 && played.length === legFixtures.length;
  const [result] = isOver ? tieResults({ ...stage, ties: [clubIds] }, legFixtures.map((f) => ({ ...f, tie: 0 }))) : [];
  return {
    clubIds,
    legs: legFixtures.map((f) => ({
      fixtureId: f.id,
      date: f.date,
      homeId: f.homeId,
      awayId: f.awayId,
      homeGoals: f.result?.homeGoals ?? null,
      awayGoals: f.result?.awayGoals ?? null,
    })),
    aggregate: played.length > 0 ? [aggregate(clubIds[0], played), aggregate(clubIds[1], played)] : null,
    winnerId: result?.winnerId ?? null,
    onPenalties: legFixtures.some((f) => f.result?.penaltyWinnerId !== undefined),
  };
}

/** A knockout stage's ties with their legs, aggregates and, once decided, winners. */
export function knockoutTies(competition: Competition, stage: number, fixtures: readonly Fixture[]): TieView[] {
  const shape = competition.stages[stage];
  if (shape?.kind !== "knockout") return [];
  const stageFixtures = stageFixturesOf(competition, stage, fixtures);
  return shape.ties.map((clubIds, tie) => ({ ...tieView(shape, tie, clubIds, stageFixtures), isPlayoff: isPlayoff(competition, stage, tie) }));
}

/** The competition's top scorers this season, most goals first. */
export function topScorers(competition: Competition, { history, players }: Pick<GameState, "history" | "players">, limit: number): Scorer[] {
  const goals = history.current.goals[competitionKey(competition.id)] ?? {};
  return Object.entries(goals)
    .flatMap(([playerId, count]) => {
      const player = players[playerId];
      return player ? [{ playerId, name: player.name, clubId: player.clubId, goals: count }] : [];
    })
    .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, limit);
}
