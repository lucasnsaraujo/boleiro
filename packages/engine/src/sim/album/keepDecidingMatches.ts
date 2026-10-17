import { humanClubIds } from "../coach/humanCoaches.js";
import { neutralGround } from "../continental/neutralGrounds.js";
import { attendance } from "../finances/recordMatchFinances.js";
import type { Competition, Fixture, GameState, SimPlayer } from "../gameState.js";
import { competitionKey, type CoachRecord } from "../history/history.js";
import type { MatchSheets } from "../history/recordMatches.js";
import type { LiveMatch } from "../live/liveDay.js";
import { matchRatings } from "../live/matchRatings.js";
import { matchOfficials } from "../referees/matchOfficials.js";
import { standings } from "../standings.js";
import type { KeptMatch, KeptPlayer, PlayedFixture } from "./album.js";

const isPlayed = (fixture: Fixture): fixture is PlayedFixture => fixture.result !== null;

/** Whether `clubId` has won a single table with `fixtures`' results: it leads, and nobody can reach its points with the games they have left. */
function hasWonTable(clubIds: readonly string[], fixtures: readonly Fixture[], drawOrder: readonly string[], clubId: string): boolean {
  const [leader, ...rest] = standings(clubIds, fixtures.filter(isPlayed), drawOrder);
  if (leader?.clubId !== clubId) return false;
  const left = new Map<string, number>();
  for (const f of fixtures) if (!f.result) for (const id of [f.homeId, f.awayId]) left.set(id, (left.get(id) ?? 0) + 1);
  return rest.every((row) => row.points + 3 * (left.get(row.clubId) ?? 0) < leader.points);
}

/** What today's match decided for a human coach's club in it: a final (won or lost), a league won, or nothing. */
function decided(state: GameState, competition: Competition, fixture: PlayedFixture, clubId: string): Pick<KeptMatch, "kind" | "isWon" | "firstLeg"> | null {
  const last = competition.stageDates.length - 1;
  const stage = competition.stages[fixture.stage];
  if (fixture.stage !== last || !stage) return null;
  const own = state.fixtures.filter((f) => f.competitionId === competition.id && f.stage === last);
  if (stage.kind === "knockout") {
    const legs = own.filter((f) => f.tie === fixture.tie);
    const championId = state.history.current.champions[competitionKey(competition.id)];
    if (!championId || !legs.every(isPlayed) || ![fixture.homeId, fixture.awayId].includes(championId)) return null;
    const firstLeg = legs.find((f): f is PlayedFixture => f.id !== fixture.id && f.date < fixture.date && isPlayed(f)) ?? null;
    return { kind: "final", isWon: championId === clubId, firstLeg };
  }
  const [table] = stage.groups;
  if (stage.groups.length !== 1 || !table) return null;
  const before = own.map((f) => (f.date === fixture.date ? { ...f, result: null } : f));
  if (!hasWonTable(table, own, competition.drawOrder, clubId) || hasWonTable(table, before, competition.drawOrder, clubId)) return null;
  return { kind: "league", isWon: true, firstLeg: null };
}

function kept(state: GameState, competition: Competition, fixture: PlayedFixture, clubId: string, sheet: MatchSheets[string], match: LiveMatch, decision: Pick<KeptMatch, "kind" | "isWon" | "firstLeg">): KeptMatch {
  const cameOn = new Set(match.events.flatMap((e) => (e.type === "substitution" ? [e.playerId] : [])));
  const side = (id: string, played: readonly SimPlayer[]) => ({ clubId: id, starters: played.filter((p) => !cameOn.has(p.id)), bench: played.filter((p) => cameOn.has(p.id)) });
  const home = side(fixture.homeId, sheet.home);
  const away = side(fixture.awayId, sheet.away);
  const rated = matchRatings({ home, away }, match.events, match.play);
  const everyone = [...home.starters, ...away.starters, ...home.bench, ...away.bench];
  const ground = neutralGround(competition, fixture);
  const finance = state.finances[fixture.homeId];
  return {
    ...decision,
    season: competition.season,
    clubId,
    fixture,
    formations: match.formations,
    players: everyone.map((p): KeptPlayer => [p.id, p.name, p.group, Math.round(p.strength), p.clubId]),
    starters: [...home.starters, ...away.starters].map((p) => p.id),
    events: match.events,
    ratings: Object.fromEntries([...rated.home, ...rated.away].map((r) => [r.playerId, Math.round(r.rating * 10) / 10])),
    stadium: ground ?? (state.clubs[fixture.homeId]?.stadium || null),
    crowd: ground || !finance ? null : attendance(state, finance, fixture.homeId, fixture.awayId, fixture),
    referee: matchOfficials(state.seed, competition, fixture).referee?.name ?? null,
  };
}

const keptBy = (record: CoachRecord, match: KeptMatch): CoachRecord => ({ ...record, keptMatches: [...(record.keptMatches ?? []), match] });

/**
 * Keeps whole, in the album of the human coach whose club played it, each of today's matches that
 * decided something for him: the deciding leg of a final, won or lost, and the match that won his club
 * a league with nobody left able to catch it. Run it after recordMatches has named today's champions,
 * before the gate is booked.
 */
export function keepDecidingMatches(state: GameState, played: readonly Fixture[], sheets: MatchSheets, matches: readonly LiveMatch[]): GameState {
  const humans = new Set(humanClubIds(state));
  let next = state;
  for (const fixture of played) {
    const competition = state.competitions[fixture.competitionId];
    const sheet = sheets[fixture.id];
    const match = matches.find((m) => m.fixtureId === fixture.id);
    if (!competition || !sheet || !match || !isPlayed(fixture)) continue;
    for (const clubId of [fixture.homeId, fixture.awayId]) {
      if (!humans.has(clubId)) continue;
      const decision = decided(state, competition, fixture, clubId);
      if (!decision) continue;
      const keptMatch = kept(state, competition, fixture, clubId, sheet, match, decision);
      next =
        clubId === next.coachClubId
          ? { ...next, history: { ...next.history, coach: keptBy(next.history.coach, keptMatch) } }
          : { ...next, waitingCoaches: next.waitingCoaches?.map((waiting) => (waiting.clubId === clubId ? { ...waiting, record: keptBy(waiting.record, keptMatch) } : waiting)) };
    }
  }
  return next;
}
