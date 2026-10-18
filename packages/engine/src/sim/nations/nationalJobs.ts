import { addDays } from "../dates.js";
import type { GameState, IsoDate, SimPlayer } from "../gameState.js";
import { CALL_UP_PLACES, CALL_UP_SIZE, OUTSIDER_MARK, nationalsByTeam, pickCallUp, roleOf } from "./callUps.js";
import type { NationalCompetition, NationalMatch, Nations } from "./nations.js";

export type NationalJobOffered = { type: "nationalJobOffered"; teamId: string; expiresOn: IsoDate };
export type NationalJobTaken = { type: "nationalJobTaken"; teamId: string };
export type NationalCoachFired = { type: "nationalCoachFired"; teamId: string };
export type NationalJobEvent = NationalJobOffered | NationalJobTaken | NationalCoachFired;

// guess: a federation waits two weeks for the coach's answer, as a club does (offerJobs).
const OFFER_DAYS = 14;
// guess: the reputation a federation asks of its coach, by its team's place in the ranking: a top-10 team wants
// a coach of the biggest clubs' standing, a team outside the top 60 one of a mid-table club's.
const REPUTATION_BY_RANK: [number, number][] = [[10, 80], [30, 65], [60, 50], [Infinity, 35]];
// guess: a federation changes coach when its team goes out of a final tournament before the quarter-finals (as
// Brazil did after its 2022 quarter-final; here a round earlier), and fires the game's coach for the same.
const EARLY_EXIT_ROUNDS = new Set(["group", "round-of-32", "round-of-16"]);
// Federations judge their coaches on the final tournaments, not on a Nations League.
const JOB_DECIDING_KINDS = new Set<NationalCompetition["kind"]>(["world-cup", "continental-cup"]);
// guess: reputation a title is worth to the coach who won it.
const TITLE_REPUTATION: Record<NationalCompetition["kind"], number> = { "world-cup": 15, "continental-cup": 10, "nations-league": 5, qualifiers: 0, friendlies: 0 };

/** A team's place in the ranking among every team the game knows. */
export function rankOf(nations: Nations, teamId: string): number {
  const points = nations.teams[teamId]?.points ?? 0;
  return 1 + Object.values(nations.teams).filter((t) => t.points > points).length + nations.ranked.filter((r) => r.points > points).length;
}

/** The reputation a team's federation asks of its coach. */
export function reputationFor(nations: Nations, teamId: string): number {
  const rank = rankOf(nations, teamId);
  return REPUTATION_BY_RANK.find(([top]) => rank <= top)?.[1] ?? 35;
}

/** The furthest round a team played in a competition: "group", or its last knockout round. */
function lastRoundOf(matches: readonly NationalMatch[], competitionId: string, teamId: string): string {
  return matches.filter((m) => m.competitionId === competitionId && (m.homeId === teamId || m.awayId === teamId)).map((m) => m.round).at(-1) ?? "group";
}

/**
 * National jobs after a competition ends today: the game's coach's reputation up for a title; and after a final
 * tournament (a World Cup or a continental cup) the coach fired when his team went out early, and the
 * federations whose teams went out early offering him their job when his reputation reaches it (the best-ranked
 * of them; one offer at a time; none in a hot-seat game).
 */
export function nationalJobsAfter(state: GameState, competition: NationalCompetition, today: IsoDate): { state: GameState; events: NationalJobEvent[] } {
  const nations = state.nations;
  if (!nations) return { state, events: [] };
  const decidesJobs = JOB_DECIDING_KINDS.has(competition.kind);
  const events: NationalJobEvent[] = [];
  let next = nations;
  let coach = state.coach;
  const teams = Object.values(competition.groups).flat();
  const isEarlyOut = (teamId: string) => EARLY_EXIT_ROUNDS.has(lastRoundOf(nations.matches, competition.id, teamId));
  const job = nations.job;
  if (job && teams.includes(job.teamId)) {
    if (competition.winnerId === job.teamId) coach = { ...coach, reputation: Math.min(100, coach.reputation + TITLE_REPUTATION[competition.kind]) };
    else if (decidesJobs && isEarlyOut(job.teamId)) {
      next = { ...next };
      delete next.job;
      delete next.picks;
      events.push({ type: "nationalCoachFired", teamId: job.teamId });
    }
  }
  // A hot-seat game's coaches would share one national job: the federations leave them to their clubs. A retired coach hears from none.
  if (decidesJobs && !next.offer && !state.waitingCoaches?.length && !state.coach.retiredOn) {
    const open = teams.filter((id) => isEarlyOut(id) && id !== next.job?.teamId && reputationFor(nations, id) <= coach.reputation).sort((a, b) => rankOf(nations, a) - rankOf(nations, b));
    const best = open[0];
    if (best) {
      const offer = { teamId: best, expiresOn: addDays(today, OFFER_DAYS) };
      next = { ...next, offer };
      events.push({ type: "nationalJobOffered", ...offer });
    }
  }
  return { state: { ...state, coach, nations: next }, events };
}

/** The offer left on the table after `date`: an expired one goes. */
export function withLiveOffer(nations: Nations, date: IsoDate): Nations {
  if (!nations.offer || nations.offer.expiresOn >= date) return nations;
  const rest = { ...nations };
  delete rest.offer;
  return rest;
}

/** The coach takes the national job on offer: he runs that team from today, with his club if he has one. */
export function acceptNationalOffer(state: GameState): { state: GameState; event: NationalJobTaken } {
  const offer = state.nations?.offer;
  if (!state.nations || !offer) throw new Error("no national team is offering its job");
  const nations = { ...state.nations, job: { teamId: offer.teamId, since: state.date } };
  delete nations.offer;
  delete nations.picks;
  return { state: { ...state, nations }, event: { type: "nationalJobTaken", teamId: offer.teamId } };
}

/** The coach turns the national job down. */
export function declineNationalOffer(state: GameState): GameState {
  if (!state.nations?.offer) throw new Error("no national team is offering its job");
  const nations = { ...state.nations };
  delete nations.offer;
  return { ...state, nations };
}

/** The players a coach may call up for his national team: his pool, the game's own and the outsiders, as call-up refs. */
export function poolOf(state: GameState, teamId: string): string[] {
  const nations = state.nations;
  if (!nations) return [];
  const own = (nationalsByTeam(state.players, nations.teams).get(teamId) ?? []).map((p) => p.id);
  const outsiders = (nations.outsiders[teamId]?.names ?? []).map((_, row) => `${OUTSIDER_MARK}${row}`);
  return [...own, ...outsiders];
}

/** The coach's own call-up for his next window: at most 26 of his pool, a goalkeeper at least. It replaces his assistant's. */
export function setCallUp(state: GameState, refs: readonly string[]): GameState {
  const nations = state.nations;
  const teamId = nations?.job?.teamId;
  if (!nations || !teamId) throw new Error("the coach runs no national team");
  const pool = new Set(poolOf(state, teamId));
  const unknown = refs.filter((ref) => !pool.has(ref));
  if (unknown.length) throw new Error(`not in ${teamId}'s pool: ${unknown.join(", ")}`);
  if (new Set(refs).size !== refs.length || refs.length > CALL_UP_SIZE) throw new Error(`a call-up takes at most ${CALL_UP_SIZE} different players`);
  const isKeeper = (ref: string) => (ref.startsWith(OUTSIDER_MARK) ? nations.outsiders[teamId]?.roles[Number(ref.slice(1))] === "g" : state.players[ref] && roleOf(state.players[ref]) === "goleiro");
  if (!refs.some(isKeeper)) throw new Error("a call-up needs a goalkeeper");
  return { ...state, nations: { ...nations, picks: [...refs] } };
}

/**
 * The call-up the coach's team makes on `date`: his own picks, those fit, filled from his assistant's by position;
 * another team's coach picks his own. `nationals` are the game's players by national team, when already sorted.
 */
export function callUpRefsOf(state: GameState, nations: Nations, teamId: string, date: IsoDate, nationals: ReadonlyMap<string, readonly SimPlayer[]> = nationalsByTeam(state.players, nations.teams)): string[] {
  const assistant = pickCallUp(nationals.get(teamId) ?? [], nations.outsiders[teamId], date);
  if (nations.job?.teamId !== teamId || !nations.picks) return assistant;
  const isFit = (ref: string) => ref.startsWith(OUTSIDER_MARK) || (state.players[ref] && !(state.players[ref].condition.injuredUntil && date < state.players[ref].condition.injuredUntil));
  const own = nations.picks.filter(isFit);
  const roleOfRef = (ref: string) => (ref.startsWith(OUTSIDER_MARK) ? nations.outsiders[teamId]?.roles[Number(ref.slice(1))] : state.players[ref] && roleOf(state.players[ref]).charAt(0));
  const places = Object.entries(CALL_UP_PLACES);
  const missing = places.flatMap(([role, count]) => {
    const letter = role.charAt(0);
    const short = Math.max(0, Math.min(count, nations.picks?.filter((ref) => roleOfRef(ref) === letter).length ?? 0) - own.filter((ref) => roleOfRef(ref) === letter).length);
    return assistant.filter((ref) => roleOfRef(ref) === letter && !own.includes(ref)).slice(0, short);
  });
  return [...own, ...missing].slice(0, CALL_UP_SIZE);
}
