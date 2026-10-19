import { humanClubIds } from "../coach/humanCoaches.js";
import type { CupAbroad, CupAbroadCompetition, Fixture, GameState, IsoDate, KnockoutStage, MatchResult, Stage } from "../gameState.js";
import { stageFixtures } from "../stageFixtures.js";
import { hasNationalCupExtraTime } from "../tieBreaks.js";
import { cupFinal, cupMatches, type ResultOnlyCup } from "../world/resultOnlyCup.js";
import { cupChampion, knockoutTie, leaguePhaseMatches, type LeaguePhaseCup, type SuperCup, superCupScore, superCupWinner } from "./uefaCups.js";

/** A human club's match the full tier played today, by `homeId|awayId|date`, which the result-only cup takes instead of its own draw. */
export type PlayedAbroad = ReadonlyMap<string, MatchResult>;

export const playedKey = (homeId: string, awayId: string, date: IsoDate): string => `${homeId}|${awayId}|${date}`;

/** Today's matches of the cups abroad the full tier played, for the result-only cups to take. */
export function playedAbroadOf(state: Pick<GameState, "competitions">, played: readonly Fixture[]): PlayedAbroad {
  const own = played.filter((f) => f.result && state.competitions[f.competitionId]?.kind === "cupAbroad");
  return new Map(own.map((f) => [playedKey(f.homeId, f.awayId, f.date), f.result as MatchResult]));
}

type TieBreak = CupAbroadCompetition["tieBreaks"][number];
type Round = { stage: Stage; tieBreak: TieBreak; fixtures: (stageIndex: number) => Fixture[]; name?: string };
type CupView = { id: string; cup: CupAbroad; country: string | null; season: number; rounds: Round[] };

const isAmong = (humans: ReadonlySet<string>, ...ids: string[]) => ids.some((id) => humans.has(id));

/** A knockout round's legs with the scores the result-only cup gave them, the deciding leg with its extra time or shootout. */
function knockoutFixtures(id: string, stage: KnockoutStage, resultOf: (tie: number, leg: Fixture) => MatchResult | null): (index: number) => Fixture[] {
  return (index) => stageFixtures(id, index, stage).map((fixture) => ({ ...fixture, result: resultOf(fixture.tie ?? 0, fixture) }));
}

/** A knockout tie's legs' results as the result-only cup decoded them, the last with its extra time and shootout winner. */
function tieLegResult(winnerId: string | null, onPenalties: boolean, isAfterExtraTime: boolean, isLast: boolean, result: MatchResult | null): MatchResult | null {
  if (!result || !isLast) return result;
  return { ...result, ...(isAfterExtraTime || onPenalties ? { isAfterExtraTime: true as const } : {}), ...(onPenalties && winnerId ? { penaltyWinnerId: winnerId } : {}) };
}

/** A UEFA cup's rounds the human clubs play: the league phase, a group a club, then each knockout round with their ties. */
function uefaView(cup: LeaguePhaseCup, humans: ReadonlySet<string>): CupView | null {
  const playing = cup.clubIds.filter((id) => humans.has(id));
  if (!playing.length) return null;
  const id = `${cup.cup}-${cup.season}`;
  const phase = leaguePhaseMatches(cup);
  const opponents = (clubId: string) => phase.flatMap((m) => (m.homeId === clubId ? [m.awayId] : m.awayId === clubId ? [m.homeId] : []));
  const rounds: Round[] = [
    {
      stage: { kind: "groups", groups: playing.map((clubId) => [clubId, ...opponents(clubId)]), legs: 1, dates: [...cup.dates] },
      tieBreak: "extraTime",
      name: "league-phase",
      fixtures: (index) =>
        phase.flatMap((m): Fixture[] => {
          if (!isAmong(humans, m.homeId, m.awayId)) return [];
          const group = playing.findIndex((clubId) => clubId === m.homeId || clubId === m.awayId);
          return [{ id: `${id}:${index}:${cup.dates.indexOf(m.date)}:${m.homeId}`, competitionId: id, stage: index, date: m.date, homeId: m.homeId, awayId: m.awayId, group, result: m.result }];
        }),
    },
  ];
  for (const round of cup.knockout) {
    const indexes = round.ties.flatMap((tie, i) => (isAmong(humans, ...tie) ? [i] : []));
    if (!indexes.length) continue;
    const stage: KnockoutStage = { kind: "knockout", ties: indexes.map((i): [string, string] => round.ties[i] ?? ["", ""]), dates: [...round.dates] };
    rounds.push({
      stage,
      tieBreak: "extraTime",
      name: round.name,
      fixtures: knockoutFixtures(id, stage, (tie, fixture) => {
        const decoded = knockoutTie(round, indexes[tie] ?? 0);
        const leg = decoded.legs.findIndex((l) => l.date === fixture.date);
        return tieLegResult(decoded.winnerId, decoded.onPenalties, decoded.isAfterExtraTime === true, leg === decoded.legs.length - 1, decoded.legs[leg]?.result ?? null);
      }),
    });
  }
  return { id, cup: cup.cup, country: null, season: cup.season, rounds };
}

/** The Super Cup as a one-round cup, when a human club plays it. guess: a level match goes straight to penalties, as the result-only cup plays it. */
function superCupView(superCup: SuperCup | null, humans: ReadonlySet<string>): CupView | null {
  if (!superCup || !isAmong(humans, ...superCup.clubIds)) return null;
  const id = `uefa-super-cup-${superCup.season}`;
  const stage = { kind: "knockout" as const, ties: [superCup.clubIds], dates: [superCup.date] };
  const score = superCupScore(superCup);
  const winnerId = superCupWinner(superCup);
  const result = score && (score.homeGoals === score.awayGoals && winnerId ? { ...score, penaltyWinnerId: winnerId } : score);
  return { id, cup: "uefa-super-cup", country: null, season: superCup.season, rounds: [{ stage, tieBreak: "penalties", fixtures: knockoutFixtures(id, stage, () => result), name: "super-cup" }] };
}

/** A country's cup's rounds a human club plays, one match each, once both clubs are known. */
function nationalCupView(country: string, cup: ResultOnlyCup, humans: ReadonlySet<string>): CupView | null {
  const rounds: Round[] = cupMatches(cup).flatMap((match): Round[] => {
    if (!match.homeId || !match.awayId || !isAmong(humans, match.homeId, match.awayId)) return [];
    const stage = { kind: "knockout" as const, ties: [[match.homeId, match.awayId] as [string, string]], dates: [cup.dates[match.round] ?? ""] };
    const isLevel = match.result !== null && match.result.homeGoals === match.result.awayGoals;
    const result = match.result && (isLevel && match.winnerId ? { ...match.result, penaltyWinnerId: match.winnerId } : match.result);
    const tieBreak = hasNationalCupExtraTime(country, match.round, cup.dates.length) ? "extraTime" : "penalties";
    return [{ stage, tieBreak, fixtures: knockoutFixtures(cup.id, stage, () => result) }];
  });
  return rounds.length ? { id: cup.id, cup: "national-cup", country, season: cup.season, rounds } : null;
}

/** Every cup abroad a human club plays this season, as the full tier sees it. */
function cupViews(state: GameState, humans: ReadonlySet<string>): CupView[] {
  const views: (CupView | null)[] = [...(state.europe?.cups ?? []).map((cup) => uefaView(cup, humans)), superCupView(state.europe?.superCup ?? null, humans)];
  for (const [country, { cup }] of Object.entries(state.world ?? {})) if (cup) views.push(nationalCupView(country, cup, humans));
  return views.filter((view): view is CupView => view !== null);
}

/**
 * The game with every cup abroad a human coach's club abroad plays (UEFA's, its country's cup) in the
 * full tier: the club's matches as fixtures, drawn as the result-only cups draw them, so they are played
 * live and open match pages; a match already among the fixtures keeps what the full tier recorded. The
 * same game when no human coach runs a club abroad, or nothing changed.
 */
export function syncCupsAbroad(state: GameState): GameState {
  const humans = new Set(humanClubIds(state).filter((id) => state.clubs[id]?.abroad));
  if (!humans.size) return state;
  const known = new Map(state.fixtures.map((f) => [f.id, f]));
  const competitions = { ...state.competitions };
  const added: Fixture[] = [];
  let isChanged = false;
  for (const view of cupViews(state, humans)) {
    const stages = view.rounds.map((round) => round.stage);
    const host = view.cup === "national-cup" ? undefined : state.hosts?.[view.id];
    const competition: CupAbroadCompetition = {
      id: view.id,
      kind: "cupAbroad",
      cup: view.cup,
      country: view.country,
      season: view.season,
      clubIds: [...new Set(stages.flatMap((stage) => (stage.kind === "groups" ? stage.groups.map((group) => group[0] ?? "") : stage.ties.flat())))],
      stages,
      stageDates: stages.map((stage) => stage.dates),
      drawOrder: [],
      tieBreaks: view.rounds.map((round) => round.tieBreak),
      ...(view.cup === "national-cup" ? {} : { stageNames: view.rounds.map((round) => round.name ?? "") }),
      ...(host ? { host } : {}),
    };
    const before = state.competitions[view.id];
    if (!before || JSON.stringify(before) !== JSON.stringify(competition)) {
      competitions[view.id] = competition;
      isChanged = true;
    }
    for (const fixture of view.rounds.flatMap((round, index) => round.fixtures(index))) if (!known.has(fixture.id)) added.push(fixture);
  }
  if (!isChanged && !added.length) return state;
  return { ...state, competitions, fixtures: added.length ? [...state.fixtures, ...added] : state.fixtures };
}

/** The cups abroad decided between the day's start (`before`) and its end, by key, whose champion plays in the full tier. */
function titlesWon(before: GameState, after: GameState): [string, string][] {
  const titles: [string, string][] = [];
  const isOurs = (clubId: string | null): clubId is string => clubId !== null && clubId in after.clubs;
  for (const cup of after.europe?.cups ?? []) {
    const was = before.europe?.cups.find((c) => c.cup === cup.cup && c.season === cup.season);
    const champion = cupChampion(cup);
    if (isOurs(champion) && (!was || cupChampion(was) === null)) titles.push([cup.cup, champion]);
  }
  const superCup = after.europe?.superCup ?? null;
  const superCupChampion = superCupWinner(superCup);
  if (superCup && isOurs(superCupChampion) && superCupWinner(before.europe?.superCup ?? null) === null) titles.push(["uefa-super-cup", superCupChampion]);
  for (const [id, country] of Object.entries(after.world ?? {})) {
    const cup = country.isFullTier ? country.cup : undefined;
    const was = before.world?.[id]?.cup;
    const champion = cup ? (cupFinal(cup)?.championId ?? null) : null;
    if (cup && isOurs(champion) && (was?.id !== cup.id || cupFinal(was) === null)) titles.push([`${id}-cup`, champion]);
  }
  return titles;
}

/**
 * The cups abroad decided today whose champion plays in the full tier, filed as a cup at home is: the
 * season's champion by its key, and the trophy of each human coach whose club won it.
 */
export function recordTitlesAbroad(before: GameState, after: GameState): GameState {
  const titles = titlesWon(before, after);
  if (!titles.length) return after;
  const { history } = after;
  const champions = { ...history.current.champions, ...Object.fromEntries(titles) };
  const trophyOf = (clubId: string | null) => titles.flatMap(([competition, champion]) => (champion === clubId ? [{ season: after.season, competition, clubId: champion }] : []));
  const waitingCoaches = after.waitingCoaches?.map((waiting) => {
    const won = trophyOf(waiting.clubId);
    return won.length ? { ...waiting, record: { ...waiting.record, trophies: [...waiting.record.trophies, ...won] } } : waiting;
  });
  return {
    ...after,
    ...(waitingCoaches ? { waitingCoaches } : {}),
    history: { ...history, current: { ...history.current, champions }, coach: { ...history.coach, trophies: [...history.coach.trophies, ...trophyOf(after.coachClubId)] } },
  };
}

/** Whether a cup abroad's result-only cup is still the one being played: its UEFA season, or its country's cup of the same id. */
export function isCupAbroadCurrent(state: Pick<GameState, "europe" | "world">, competition: CupAbroadCompetition): boolean {
  if (competition.cup === "national-cup") return state.world?.[competition.country ?? ""]?.cup?.id === competition.id;
  if (competition.cup === "uefa-super-cup") return state.europe?.superCup?.season === competition.season;
  return state.europe?.cups.some((cup) => cup.cup === competition.cup && cup.season === competition.season) ?? false;
}
