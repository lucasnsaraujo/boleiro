import { CUP_STAGES } from "@boleiro/engine/sim/continental/conmebolCups";
import { CONTINENTAL_CUPS, type Competition, type Fixture, type GameState, type GroupStage, type KnockoutStage, type SeasonCalendar, type StateCompetition } from "@boleiro/engine/sim/gameState";
import { COPA_DO_BRASIL } from "@boleiro/engine/sim/copaDoBrasil";
import { continentalQualifiers } from "@boleiro/engine/sim/finances/continentalQualifiers";
import { competitionKey } from "@boleiro/engine/sim/history/history";
import { LEAGUE_FORMATS } from "@boleiro/engine/sim/leagueFormats";
import { STATE_CHAMPIONSHIP } from "@boleiro/engine/sim/stateChampionship";
import { standings, type StandingRow } from "@boleiro/engine/sim/standings";
import { aggregate, tieResults } from "@boleiro/engine/sim/tieResults";
import { continentalPlaces } from "@boleiro/engine/sim/world/continentalPlaces";
import { cupFinal } from "@boleiro/engine/sim/world/resultOnlyCup";
import { leagueMatches } from "@boleiro/engine/sim/world/resultOnlyLeague";
import { worldMatchRef } from "@boleiro/game-client/matchPage/matchPageOf";
import { uefaPlaces } from "@boleiro/engine/sim/world/uefaPlaces";

export type ZoneKind = "libertadores" | "preLibertadores" | "sulAmericana" | "championsLeague" | "europaLeague" | "promotion" | "advance" | "playoff" | "relegation";
export type ZoneKey = { zone: ZoneKind; label: string };
export type Outcome = "win" | "draw" | "loss";
/** `form` is the club's last five results, oldest first; `movement` the places it gained (negative: lost) in the last round. */
/** `formRefs` are the match pages of `form`'s games, in its order; a table whose games have no page leaves them out. */
export type TableRow = StandingRow & { position: number; zone: ZoneKind | null; form: Outcome[]; formRefs?: string[]; movement: number };
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

const KIND_ORDER: Record<Competition["kind"], number> = { state: 0, league: 1, cup: 2, continental: 3 };
const cupOrder = (c: Competition) => (c.kind === "continental" ? CONTINENTAL_CUPS.indexOf(c.cup) : 0);
const byKind = (a: Competition, b: Competition) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || cupOrder(a) - cupOrder(b);

const clubsIn = (stage: Competition["stages"][number]) => (stage.kind === "groups" ? stage.groups.flat() : stage.ties.flat());

/** Whether the club plays the competition: entered in it, or drawn into one of its stages, as a Libertadores club dropping into the Sul-Americana. */
const isPlaying = (c: Competition, clubId: string) => c.clubIds.includes(clubId) || c.stages.some((stage) => clubsIn(stage).includes(clubId));

/** What the coach's club plays this season, state championship first, or the Série A and the cup without a club. */
export function coachCompetitions({ coachClubId, competitions, season }: Pick<GameState, "coachClubId" | "competitions" | "season">): Competition[] {
  const shown = (c: Competition) => (coachClubId ? isPlaying(c, coachClubId) : c.kind === "cup" || (c.kind === "league" && c.division === "A"));
  return Object.values(competitions)
    .filter((c) => c.season === season && shown(c))
    .sort(byKind);
}

const DIVISION_ORDER = ["A", "B", "C", "D"] as const;

/** The tables open on the competition of the coach's next match, else on the first his club plays this season. */
export function openingCompetitionId(state: Pick<GameState, "coachClubId" | "competitions" | "season">, nextCompetitionId: string | undefined): string | undefined {
  return nextCompetitionId ?? coachCompetitions(state)[0]?.id;
}

/**
 * The tables screen's tabs: the four national divisions, the cup, the Libertadores and Sul-Americana (and the Recopa
 * when the coach's club plays it) and the state championship the coach's club plays. Every other state championship
 * waits behind "Outras ligas", with South America's leagues.
 */
export function tableTabs(state: Pick<GameState, "coachClubId" | "competitions" | "season">): { tabs: Competition[]; otherStates: StateCompetition[] } {
  const thisSeason = Object.values(state.competitions).filter((c) => c.season === state.season);
  const brazil = DIVISION_ORDER.flatMap((division) => thisSeason.filter((c) => c.kind === "league" && c.division === division));
  // Leagues abroad in the full tier, a country's levels top first; the coach's own come before Brazil's.
  const abroad = thisSeason.flatMap((c) => (c.kind === "league" && c.abroad ? [c] : [])).sort((a, b) => (a.abroad?.country ?? "").localeCompare(b.abroad?.country ?? "") || (a.abroad?.level ?? 0) - (b.abroad?.level ?? 0));
  const isCoachAbroad = state.coachClubId !== null && abroad.some((c) => isPlaying(c, state.coachClubId ?? ""));
  const leagues = isCoachAbroad ? [...abroad, ...brazil] : [...brazil, ...abroad];
  const cups = thisSeason.filter((c) => c.kind === "cup");
  const isShownCup = (c: Competition) => c.kind === "continental" && (c.cup !== "recopa" || (state.coachClubId !== null && isPlaying(c, state.coachClubId)));
  const continental = thisSeason.filter(isShownCup).sort(byKind);
  const ownState = coachCompetitions(state).filter((c): c is StateCompetition => c.kind === "state");
  const otherStates = thisSeason.filter((c): c is StateCompetition => c.kind === "state" && !ownState.includes(c));
  return { tabs: [...leagues, ...cups, ...continental, ...ownState], otherStates };
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
const CONTINENTAL_STAGE_NAMES: Record<string, string> = {
  "stage-1": "1ª fase",
  "stage-2": "2ª fase",
  "stage-3": "3ª fase",
  groups: "Grupos",
  playoffs: "Playoffs",
  "round-of-16": "Oitavas",
  "quarter-finals": "Quartas",
  "semi-finals": "Semifinal",
  final: "Final",
};
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
    case "continental":
      return CUP_STAGES[competition.cup].map((stage, i) => CONTINENTAL_STAGE_NAMES[stage.name] ?? `${i + 1}ª fase`);
  }
}

/** Every stage of the competition by name, drawn or still to come. */
export function competitionStages(competition: Competition, calendar: SeasonCalendar): StageTab[] {
  return stageNames(competition, calendar).map((name, index) => ({ index, name, isDrawn: index < competition.stages.length }));
}

/** The stage the screen opens on: the latest one with the coach's club in it, else the latest drawn. */
export function defaultStage(competition: Competition, coachClubId: string | null): number {
  const withClub = coachClubId ? competition.stages.findLastIndex((stage) => clubsIn(stage).includes(coachClubId)) : -1;
  return withClub >= 0 ? withClub : Math.max(0, competition.stages.length - 1);
}

const ZONE_ORDER: readonly ZoneKind[] = ["libertadores", "preLibertadores", "sulAmericana", "championsLeague", "europaLeague", "promotion", "advance", "playoff", "relegation"];

const ZONE_LABELS: Record<Exclude<ZoneKind, "advance">, string> = {
  libertadores: "Libertadores",
  preLibertadores: "Pré-Libertadores",
  sulAmericana: "Sul-Americana",
  championsLeague: "Champions League",
  europaLeague: "Europa League",
  promotion: "Acesso",
  playoff: "Playoffs",
  relegation: "Rebaixamento",
};

// Série C 2026 relegates two; from 2027 it relegates six (packages/engine/src/sim/leagueFormats.ts, serieCRelegated).
const serieCRelegated = (season: number) => (season <= 2026 ? 2 : 6);
// Each Série C quadrangular promotes its top two (packages/engine/src/sim/leagueFormats.ts).
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

// A Libertadores group sends two to the round of 16 and its third to the Sul-Americana's play-offs; a
// Sul-Americana group its winner to the round of 16 and its runner-up to the play-offs.
const CONTINENTAL_GROUP_ZONES: Record<string, Zoning> = {
  libertadores: { zoneOf: (_, position) => (position <= 2 ? "advance" : position === 3 ? "sulAmericana" : null), advanceLabel: "Oitavas" },
  "sul-americana": { zoneOf: (_, position) => (position <= 2 ? "advance" : null), advanceLabel: "Mata-mata" },
};

function zoning(competition: Competition, stage: number, groups: readonly string[][], stageFixtures: readonly Fixture[], copa: CopaFinalists): Zoning {
  if (competition.kind === "cup") return NO_ZONES;
  if (competition.kind === "continental") return CONTINENTAL_GROUP_ZONES[competition.cup] ?? NO_ZONES;
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

/** The round of a group-stage game, counted from 1; 0 when its date is not one of the stage's rounds. */
const roundOf = (shape: GroupStage, fixture: Fixture) => shape.dates.indexOf(fixture.date) + 1;

const latestRound = (shape: GroupStage, stageFixtures: readonly Fixture[]) => Math.max(0, ...stageFixtures.filter((f) => f.result).map((f) => roundOf(shape, f)));

/** The latest round of a group stage with a game played, 0 before the first. */
export function playedRounds(competition: Competition, stage: number, fixtures: readonly Fixture[]): number {
  const shape = competition.stages[stage];
  return shape?.kind === "groups" ? latestRound(shape, stageFixturesOf(competition, stage, fixtures)) : 0;
}

const FORM_LENGTH = 5;

function outcomeFor(clubId: string, { homeId, result }: Pick<Fixture, "homeId" | "result">): Outcome | null {
  if (!result) return null;
  const [scored, conceded] = homeId === clubId ? [result.homeGoals, result.awayGoals] : [result.awayGoals, result.homeGoals];
  return scored > conceded ? "win" : scored === conceded ? "draw" : "loss";
}

function lastPlayed<F extends Pick<Fixture, "homeId" | "awayId" | "date" | "result">>(clubId: string, fixtures: readonly F[]): F[] {
  return fixtures
    .filter((f) => f.result && (f.homeId === clubId || f.awayId === clubId))
    .toSorted((a, b) => a.date.localeCompare(b.date))
    .slice(-FORM_LENGTH);
}

/** The club's last five results in these games, oldest first. */
export function recentForm(clubId: string, stageFixtures: readonly Pick<Fixture, "homeId" | "awayId" | "date" | "result">[]): Outcome[] {
  return lastPlayed(clubId, stageFixtures).flatMap((f) => outcomeFor(clubId, f) ?? []);
}

/** The ids of the games `recentForm` reads, in its order. */
function recentRefs(clubId: string, stageFixtures: readonly Pick<Fixture, "id" | "homeId" | "awayId" | "date" | "result">[]): string[] {
  return lastPlayed(clubId, stageFixtures).map((f) => f.id);
}

const groupLetter = (index: number) => String.fromCharCode(65 + index);

/** A group stage's tables as they stand, each row in its zone if the stage ended now. */
export function groupTables(
  competition: Competition,
  stage: number,
  fixtures: readonly Fixture[],
  copa: CopaFinalists = null,
  throughRound: number | null = null,
): { groups: GroupTable[]; zones: ZoneKey[] } {
  const shape = competition.stages[stage];
  if (shape?.kind !== "groups") return { groups: [], zones: [] };
  const stageFixtures = stageFixturesOf(competition, stage, fixtures).filter((f) => throughRound === null || roundOf(shape, f) <= throughRound);
  const { zoneOf, advanceLabel } = zoning(competition, stage, shape.groups, stageFixtures, copa);
  const lastRound = latestRound(shape, stageFixtures);
  const beforeLastRound = stageFixtures.filter((f) => roundOf(shape, f) < lastRound);
  const groups = shape.groups.map((group, g) => {
    // Before the first round every club is level, so the first round moves nobody.
    const placesBefore = lastRound > 1 ? standings(group, beforeLastRound, competition.drawOrder).map((row) => row.clubId) : [];
    return {
      label: shape.groups.length > 1 ? `Grupo ${groupLetter(g)}` : null,
      rows: standings(group, stageFixtures, competition.drawOrder).map((row, i) => ({
        ...row,
        position: i + 1,
        zone: zoneOf(row.clubId, i + 1, group.length),
        form: recentForm(row.clubId, stageFixtures),
        formRefs: recentRefs(row.clubId, stageFixtures),
        movement: lastRound > 1 ? placesBefore.indexOf(row.clubId) - i : 0,
      })),
    };
  });
  return { groups, zones: zoneKeys(groups, advanceLabel) };
}

/** The zones the tables' rows fall in, each once, in the zones' order; `advanceLabel` names where "advance" leads. */
export function zoneKeys(groups: readonly GroupTable[], advanceLabel = ""): ZoneKey[] {
  const seen = new Set<ZoneKind>();
  const zones: ZoneKey[] = [];
  for (const row of groups.flatMap((g) => g.rows)) {
    if (!row.zone || seen.has(row.zone)) continue;
    seen.add(row.zone);
    zones.push({ zone: row.zone, label: row.zone === "advance" ? advanceLabel : ZONE_LABELS[row.zone] });
  }
  return zones.sort((a, b) => ZONE_ORDER.indexOf(a.zone) - ZONE_ORDER.indexOf(b.zone));
}

// Série D's semi-final stage lists the two semi-finals first, then the quarter-final losers' playoffs (packages/engine/src/sim/leagueFormats.ts).
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

/** A continental guest's player, `<club>#<n>`, as his club's history names him. */
function guestScorer(history: GameState["history"], playerId: string): { name: string; clubId: string } | null {
  const [clubId = ""] = playerId.split("#");
  const name = history.players[clubId]?.[playerId]?.name;
  return name ? { name, clubId } : null;
}

/** The competition's top scorers this season, most goals first. */
export function topScorers(competition: Competition, { history, players }: Pick<GameState, "history" | "players">, limit: number): Scorer[] {
  const goals = history.current.goals[competitionKey(competition.id)] ?? {};
  return Object.entries(goals)
    .flatMap(([playerId, count]) => {
      const player = players[playerId] ?? guestScorer(history, playerId);
      return player ? [{ playerId, name: player.name, clubId: player.clubId, goals: count }] : [];
    })
    .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, limit);
}

const PLACE_ZONES: Record<string, ZoneKind> = {
  libertadoresGroups: "libertadores",
  libertadoresStage2: "preLibertadores",
  libertadoresStage1: "preLibertadores",
  sulAmericanaGroups: "sulAmericana",
  sulAmericanaStage1: "sulAmericana",
  "champions-league": "championsLeague",
  "europa-league": "europaLeague",
};

/** A result-only country's league tables as they stand, top level first, each row in its CONMEBOL or UEFA place, promotion or relegation. */
export function worldLeagueTables(state: Pick<GameState, "world">, countryId: string): GroupTable[] {
  const country = state.world?.[countryId];
  if (!country) return [];
  return country.leagues.map((league, level) => {
    const structure = country.structure.levels[level];
    const fixtures: Fixture[] = leagueMatches(league).map((match, i) => ({ ...match, id: worldMatchRef(countryId, level, i), competitionId: league.id, stage: 0 }));
    const order = standings(league.clubIds, fixtures, league.drawOrder);
    const ids = order.map((row) => row.clubId);
    const { uefa } = country.structure;
    const places =
      level > 0
        ? new Map<string, string[]>()
        : uefa
          ? new Map(Object.entries(uefaPlaces(uefa, ids, country.cup ? cupFinal(country.cup) : null)))
          : continentalPlaces(country.structure.continental, ids, null);
    const promoted = level > 0 ? ids.slice(0, structure?.promoted ?? 0) : [];
    const relegated = ids.slice(ids.length - (structure?.relegated ?? 0));
    const zoneOf = (clubId: string): ZoneKind | null => {
      for (const [entry, clubIds] of places) if (clubIds.includes(clubId)) return PLACE_ZONES[entry] ?? null;
      return promoted.includes(clubId) ? "promotion" : relegated.includes(clubId) ? "relegation" : null;
    };
    return {
      label: structure?.name ?? league.id,
      rows: order.map((row, i) => ({ ...row, position: i + 1, zone: zoneOf(row.clubId), form: recentForm(row.clubId, fixtures), formRefs: recentRefs(row.clubId, fixtures), movement: 0 })),
    };
  });
}

/** A knockout round of a bracket: a tie per place, null where the round is not drawn yet. */
export type BracketRound = { stage: number; name: string; dates: string[]; ties: (TieView | null)[] };

/**
 * A continental cup's bracket from its round of 16 to its final once the round of 16 is drawn, each
 * round half the ties of the one before; empty before then and for any other competition.
 */
export function knockoutBracket(competition: Competition, fixtures: readonly Fixture[]): BracketRound[] {
  if (competition.kind !== "continental") return [];
  const stages = CUP_STAGES[competition.cup];
  const first = stages.findIndex((stage) => stage.name === "round-of-16");
  if (first < 0 || competition.stages.length <= first) return [];
  return stages.slice(first).map((stage, i) => {
    const index = first + i;
    const drawn = knockoutTies(competition, index, fixtures);
    const places = 8 / 2 ** i;
    return { stage: index, name: CONTINENTAL_STAGE_NAMES[stage.name] ?? stage.name, dates: competition.stageDates[index] ?? [], ties: Array.from({ length: places }, (_, tie) => drawn[tie] ?? null) };
  });
}
