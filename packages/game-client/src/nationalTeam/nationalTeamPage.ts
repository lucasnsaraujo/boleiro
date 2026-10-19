import type { Confederation } from "@boleiro/data/nationalFootball";
import type { Role } from "@boleiro/data/players";
import type { GameState, IsoDate } from "@boleiro/engine/sim/gameState";
import { CALL_UP_PLACES, nationalsByTeam, OUTSIDER_MARK, pickCallUp, roleOf } from "@boleiro/engine/sim/nations/callUps";
import { fifaWindowsOf, type FifaWindow } from "@boleiro/engine/sim/nations/fifaCalendar";
import { daysBetween } from "@boleiro/engine/sim/dates";
import { TOURNAMENT_CAMP_DAYS } from "@boleiro/engine/sim/nations/nationsDay";
import { CONFEDERATIONS_WITH_QUALIFIERS, groupTable, throughNow } from "@boleiro/engine/sim/nations/nationalCompetitions";
import type { NationalCompetition, NationalMatch, Nations } from "@boleiro/engine/sim/nations/nations";
import { poolOf } from "@boleiro/engine/sim/nations/nationalJobs";
import { nationalFixtureId } from "@boleiro/engine/sim/nations/nationalFixtures";
import { nationalTeamName } from "../format/nationalTeamName.js";
import { compareText } from "@boleiro/engine/sim/compareText";
import type { EditionHost, Hosts } from "@boleiro/engine/sim/hosts/venue";
import { editionKeyOf } from "../format/competitionEdition.js";

/** A player of a call-up as the album shows him: the game's own (`clubId` set) or one of the pool's from abroad; `crestId` names his club's crest. */
export type NationalPlayerCard = { ref: string; name: string; role: Role; strength: number; club: string; clubId: string | null; crestId: string | null; age: number | null; isCoachClub: boolean };

/** A call-up's places of one position and who fills them. */
export type CallUpGroup = { role: Role; places: number; players: NationalPlayerCard[] };

/** A national match as the screen lists it; `pageRef` opens its match page once it is played. */
export type NationalFixtureRow = {
  id: string;
  pageRef: string | null;
  date: IsoDate;
  competition: string;
  round: string;
  homeId: string;
  awayId: string;
  home: string;
  away: string;
  result: { home: number; away: number; penaltyWinnerId?: string; isAfterExtraTime?: true } | null;
};

/** A table's row; `isThrough` when the team would go on as the tables stand. */
export type NationalTableRow = { teamId: string; name: string; code: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number; isThrough: boolean };

/** A competition the team plays: its groups (its own first), its knockout rounds so far, and the team's own matches in it by date. */
export type NationalCompetitionView = {
  id: string;
  name: string;
  kind: NationalCompetition["kind"];
  /** A final tournament's hosts and grounds (hosts/drawHosts.ts); none for qualifiers or a Nations League. */
  host: EditionHost | null;
  groups: { name: string; rows: NationalTableRow[] }[];
  knockout: { round: string; matches: NationalFixtureRow[] }[];
  matches: NationalFixtureRow[];
  winnerId: string | null;
};

/** A coming World Cup, Copa América or Euro and where it is played: its edition's id, name and season, its hosts by name. */
export type HostedEditionView = { id: string; key: "world-cup" | "copa-america" | "euro"; name: string; season: number; host: EditionHost; hostNames: string[] };

export type RankingRowView = { rank: number; teamId: string | null; name: string; code: string | null; points: number };

/** The coach's club's players a call-up takes: who, for which team and until when. */
export type LeavingPlayer = { id: string; name: string; role: Role; age: number; strength: number; teamId: string; team: string; until: IsoDate };

export type NationalTeamPage = {
  /** `qualifiesByRanking` when the game leaves its confederation's World Cup qualifiers out: its places go by the ranking. */
  team: { id: string; name: string; code: string; colours: { primary: string; secondary: string }; rank: number; points: number; confederation: Confederation; qualifiesByRanking: boolean };
  /** Every national team, by name, to pick another, with its code and colours for its crest. */
  teams: { id: string; name: string; code: string; colours: { primary: string; secondary: string } }[];
  /** Since when the human coach runs this team; null when he doesn't. */
  coach: { since: IsoDate } | null;
  /** The window under way or the next one: its days, and the tournament it leads into when the team plays one. */
  window: { from: IsoDate; until: IsoDate; tournament: string | null } | null;
  fixtures: NationalFixtureRow[];
  /** The call-up of the window under way; between windows, the national coach's likely one (`isProvisional`). */
  callUp: { isProvisional: boolean; size: number; count: number; groups: CallUpGroup[] };
  /** The coach's club's players the window takes, and its matches in it; null without a club. */
  /** The coach's club's players away with a national team, its matches without them; between windows (`isProvisional`) those the next window's likely call-ups take. Null without a club. */
  leaving: { clubId: string; players: LeavingPlayer[]; clubMatches: number; isProvisional: boolean } | null;
  competitions: NationalCompetitionView[];
  /** The coming World Cups and the team's continental cup with their hosts, as chosen so far, soonest first. */
  hosted: HostedEditionView[];
  ranking: { date: IsoDate; rows: RankingRowView[] };
  titles: { name: string; season: number; winner: string }[];
  /** A federation's offer of its job to the coach, whichever team it is. */
  offer: { teamId: string; team: string; expiresOn: IsoDate } | null;
  /** When the coach runs this team: the rest of its pool he can call up, best first, and whether the call-up shown is his own. */
  coaching: { pool: NationalPlayerCard[]; isOwnPick: boolean } | null;
};

const ROLE_OF_LETTER: Record<string, Role> = { g: "goleiro", l: "lateral", z: "zagueiro", m: "meia", a: "atacante" };
const TOP_OF_RANKING = 10;
const ROUND_ORDER = ["round-of-32", "round-of-16", "quarter-finals", "semi-finals", "third-place", "final"];

const teamName = (nations: Nations, id: string) => nationalTeamName(id, nations.teams[id]?.name ?? id);

function fixtureRow(nations: Nations, match: NationalMatch): NationalFixtureRow {
  return {
    id: match.id,
    pageRef: match.result ? nationalFixtureId(match.id) : null,
    date: match.date,
    competition: nations.competitions[match.competitionId]?.name ?? (match.round === "friendly" ? "Amistoso" : match.competitionId),
    round: match.round,
    homeId: match.homeId,
    awayId: match.awayId,
    home: teamName(nations, match.homeId),
    away: teamName(nations, match.awayId),
    result: match.result,
  };
}

/** The window under way on `date`, else the next one. */
function windowAround(date: IsoDate): FifaWindow | null {
  const season = Number(date.slice(0, 4));
  return [...fifaWindowsOf(season), ...fifaWindowsOf(season + 1)].find((w) => w.until >= date) ?? null;
}

function tableRows(nations: Nations, ids: readonly string[], matches: readonly NationalMatch[], through: ReadonlySet<string>): NationalTableRow[] {
  const order = groupTable(ids, matches, (id) => nations.teams[id]?.points ?? 0);
  return order.map((teamId) => {
    const row: NationalTableRow = { teamId, name: teamName(nations, teamId), code: nations.teams[teamId]?.code ?? "", played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, isThrough: through.has(teamId) };
    for (const m of matches) {
      if (!m.result || m.round !== "group" || (m.homeId !== teamId && m.awayId !== teamId)) continue;
      const [own, other] = m.homeId === teamId ? [m.result.home, m.result.away] : [m.result.away, m.result.home];
      row.played++;
      row.goalsFor += own;
      row.goalsAgainst += other;
      if (own > other) row.won++;
      else if (own === other) row.drawn++;
      else row.lost++;
      row.points += own > other ? 3 : own === other ? 1 : 0;
    }
    return row;
  });
}

function competitionView(nations: Nations, competition: NationalCompetition, teamId: string, hosts: Hosts): NationalCompetitionView {
  const own = nations.matches.filter((m) => m.competitionId === competition.id);
  const through = throughNow(competition, { ...nations, hosts });
  const groups = Object.entries(competition.groups)
    .sort(([, a], [, b]) => Number(b.includes(teamId)) - Number(a.includes(teamId)))
    .map(([name, ids]) => ({ name, rows: tableRows(nations, ids, own, through) }));
  const knockout = ROUND_ORDER.flatMap((round) => {
    const matches = own.filter((m) => m.round === round).map((m) => fixtureRow(nations, m));
    return matches.length ? [{ round, matches }] : [];
  });
  const matches = own.filter((m) => m.homeId === teamId || m.awayId === teamId).sort((a, b) => compareText(a.date, b.date)).map((m) => fixtureRow(nations, m));
  return { id: competition.id, name: competition.name, kind: competition.kind, host: hosts[competition.id] ?? null, groups, knockout, matches, winnerId: competition.winnerId || null };
}

// The tournaments a confederation's teams play besides the World Cup, and how the game names each.
const CONTINENTAL_TOURNAMENT: Partial<Record<Confederation, "copa-america" | "euro">> = { CONMEBOL: "copa-america", UEFA: "euro" };
const TOURNAMENT_NAMES = { "world-cup": "Copa do Mundo", "copa-america": "Copa América", euro: "Eurocopa" } as const;

/** The World Cups and the confederation's own tournament from this season on whose hosts the game knows, soonest first. */
function hostedEditions(state: GameState, confederation: Confederation): HostedEditionView[] {
  const continental = CONTINENTAL_TOURNAMENT[confederation];
  return Object.entries(state.hosts ?? {}).flatMap(([id, host]): HostedEditionView[] => {
    const { key, season } = editionKeyOf(id);
    if (season === null || season < state.season || !(key === "world-cup" || key === continental)) return [];
    const tournament = key === "world-cup" ? "world-cup" : continental;
    if (!tournament) return [];
    return [{ id, key: tournament, name: `${TOURNAMENT_NAMES[tournament]} ${season}`, season, host, hostNames: host.countries.map((country) => nationalTeamName(country)) }];
  }).sort((a, b) => a.season - b.season || compareText(a.key, b.key));
}

function callUpRefs(state: GameState, nations: Nations, teamId: string): { refs: string[]; isProvisional: boolean } {
  const actual = nations.callUps[teamId];
  if (actual) return { refs: [...actual.playerIds, ...actual.outsiders.map((row) => `${OUTSIDER_MARK}${row}`)], isProvisional: false };
  if (nations.job?.teamId === teamId && nations.picks) return { refs: nations.picks, isProvisional: true };
  const nationals = nationalsByTeam(state.players, nations.teams).get(teamId) ?? [];
  return { refs: pickCallUp(nationals, nations.outsiders[teamId], state.date), isProvisional: true };
}

function cardOf(state: GameState, nations: Nations, teamId: string, ref: string): NationalPlayerCard | null {
  if (ref.startsWith(OUTSIDER_MARK)) {
    const row = Number(ref.slice(OUTSIDER_MARK.length));
    const outsiders = nations.outsiders[teamId];
    const name = outsiders?.names[row];
    if (!outsiders || name === undefined) return null;
    const born = outsiders.born[row] ?? 0;
    return { ref, name, role: ROLE_OF_LETTER[outsiders.roles[row] ?? "m"] ?? "meia", strength: outsiders.strengths[row] ?? 0, club: outsiders.clubs[row] ?? "", clubId: null, crestId: outsiders.clubIds[row] || null, age: born ? Number(state.date.slice(0, 4)) - born : null, isCoachClub: false };
  }
  const player = state.players[ref];
  if (!player) return null;
  const club = state.clubs[player.clubId];
  return { ref, name: player.name, role: roleOf(player), strength: Math.round(player.strength), club: club?.shortName ?? player.clubId, clubId: player.clubId, crestId: player.clubId, age: player.age, isCoachClub: player.clubId === state.coachClubId };
}

/** The national-team screen of `teamId`: the coach's national team when he has one, else Brazil. Null in a game without national football. */
export function nationalTeamPage(state: GameState, teamId?: string): NationalTeamPage | null {
  const nations = state.nations;
  if (!nations) return null;
  const id = teamId && teamId in nations.teams ? teamId : (nations.job?.teamId ?? (("brazil" in nations.teams ? "brazil" : Object.keys(nations.teams)[0]) ?? ""));
  const team = nations.teams[id];
  if (!team) return null;

  const ranked = [
    ...Object.values(nations.teams).map((t) => ({ teamId: t.id, name: teamName(nations, t.id), code: t.code, points: t.points })),
    ...nations.ranked.map((r) => ({ teamId: null, name: r.name, code: null, points: r.points })),
  ].sort((a, b) => b.points - a.points || compareText(a.name, b.name));
  const rows = ranked.map((row, i): RankingRowView => ({ rank: i + 1, ...row, points: Math.round(row.points) }));
  const rank = rows.find((row) => row.teamId === id)?.rank ?? rows.length;

  // The team's call-up under way sets the days (a tournament's, up to its exit); else the window under way or the next.
  const running = nations.callUps[id];
  const isAway = running !== undefined && running.from <= state.date && state.date <= running.until;
  const window = isAway ? { from: running.from, until: running.until } : windowAround(state.date);
  // A tournament starting within a few weeks of the window keeps the call-up together until it ends (nationsDay).
  const tournamentAfter = (teamId: string, days: { from: IsoDate; until: IsoDate }) =>
    Object.values(nations.competitions).find((c) => {
      if ((c.kind !== "world-cup" && c.kind !== "continental-cup") || !Object.values(c.groups).some((ids) => ids.includes(teamId))) return false;
      const first = nations.matches.filter((m) => m.competitionId === c.id).map((m) => m.date).sort()[0];
      return first !== undefined && first >= days.from && daysBetween(days.until, first) <= TOURNAMENT_CAMP_DAYS;
    });
  const tournament = window ? tournamentAfter(id, window) : undefined;
  const until = isAway ? running.until : tournament && window && tournament.until > window.until ? tournament.until : (window?.until ?? state.date);
  const fixtures = window
    ? nations.matches.filter((m) => (m.homeId === id || m.awayId === id) && m.date >= window.from && m.date <= until).sort((a, b) => compareText(a.date, b.date)).map((m) => fixtureRow(nations, m))
    : [];

  const { refs, isProvisional } = callUpRefs(state, nations, id);
  const cards = refs.flatMap((ref) => cardOf(state, nations, id, ref) ?? []);
  const groups = (Object.entries(CALL_UP_PLACES) as [Role, number][]).map(([role, places]) => ({ role, places, players: cards.filter((c) => c.role === role).sort((a, b) => b.strength - a.strength) }));

  let leaving: NationalTeamPage["leaving"] = null;
  const clubId = state.coachClubId;
  if (clubId) {
    const leaver = (playerId: string, teamId: string, until: IsoDate): LeavingPlayer[] => {
      const p = state.players[playerId];
      return p?.clubId === clubId ? [{ id: p.id, name: p.name, role: roleOf(p), age: p.age, strength: Math.round(p.strength), teamId, team: teamName(nations, teamId), until }] : [];
    };
    let players = Object.entries(nations.duty).flatMap(([playerId, own]) => leaver(playerId, own.teamId, own.until));
    let days = window;
    const next = windowAround(state.date);
    const isProvisional = players.length === 0 && next !== null && next.from > state.date;
    if (isProvisional) {
      // Between windows: the players each national coach would call up today, away until the window or the tournament after it ends.
      const nationals = nationalsByTeam(state.players, nations.teams);
      players = Object.keys(nations.teams).flatMap((teamId) => {
        const refs = nations.job?.teamId === teamId && nations.picks ? nations.picks : pickCallUp(nationals.get(teamId) ?? [], nations.outsiders[teamId], state.date);
        const until = tournamentAfter(teamId, next)?.until ?? next.until;
        return refs.flatMap((ref) => leaver(ref, teamId, until));
      });
      days = next;
    }
    const lastAway = players.reduce((last, p) => (p.until > last ? p.until : last), days?.until ?? state.date);
    const from = days && state.date > days.from ? state.date : (days?.from ?? state.date);
    const clubMatches = days ? state.fixtures.filter((f) => (f.homeId === clubId || f.awayId === clubId) && f.date >= from && f.date <= lastAway).length : 0;
    leaving = { clubId, players: players.sort((a, b) => b.strength - a.strength), clubMatches, isProvisional };
  }

  const competitions = Object.values(nations.competitions)
    .filter((c) => c.kind !== "friendlies" && Object.values(c.groups).some((ids) => ids.includes(id)))
    .map((c) => competitionView(nations, c, id, state.hosts ?? {}));

  const near = rows.filter((row) => row.rank <= TOP_OF_RANKING || Math.abs(row.rank - rank) <= 2);
  return {
    team: { id, name: teamName(nations, id), code: team.code, colours: team.colours, rank, points: Math.round(team.points), confederation: team.confederation, qualifiesByRanking: !CONFEDERATIONS_WITH_QUALIFIERS.includes(team.confederation) },
    teams: Object.values(nations.teams).map((t) => ({ id: t.id, name: teamName(nations, t.id), code: t.code, colours: t.colours })).sort((a, b) => a.name.localeCompare(b.name, "pt")),
    coach: nations.job?.teamId === id ? { since: nations.job.since } : null,
    window: window && { from: window.from, until, tournament: tournament?.name ?? null },
    fixtures,
    callUp: { isProvisional, size: Object.values(CALL_UP_PLACES).reduce((a, b) => a + b, 0), count: cards.length, groups },
    leaving,
    competitions,
    hosted: hostedEditions(state, team.confederation),
    ranking: { date: nations.rankingSource.date, rows: near },
    titles: nations.titles.map((t) => ({ name: t.name, season: t.season, winner: teamName(nations, t.winnerId) })),
    offer: nations.offer ? { teamId: nations.offer.teamId, team: teamName(nations, nations.offer.teamId), expiresOn: nations.offer.expiresOn } : null,
    coaching:
      nations.job?.teamId === id
        ? {
            pool: poolOf(state, id).filter((ref) => !refs.includes(ref)).flatMap((ref) => cardOf(state, nations, id, ref) ?? []).sort((a, b) => b.strength - a.strength),
            isOwnPick: nations.picks !== undefined,
          }
        : null,
  };
}
