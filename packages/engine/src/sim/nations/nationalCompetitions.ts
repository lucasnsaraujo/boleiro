import { CONFEDERATIONS, type Confederation, type RealFixture } from "@boleiro/data/nationalFootball";
import { addDays, daysBetween } from "../dates.js";
import type { IsoDate } from "../gameState.js";
import { roundRobin } from "../roundRobin.js";
import { shuffle } from "../shuffle.js";
import { fifaWindowsOf, worldCupOf } from "./fifaCalendar.js";
import type { KnockoutRound, NationalCompetition, NationalMatch, NationalTeam } from "./nations.js";
import { compareText } from "../compareText.js";
import type { Hosts } from "../hosts/venue.js";

/** What a season's national football opens: its competitions and their group matches. */
export type Opened = { competitions: NationalCompetition[]; matches: NationalMatch[] };

/**
 * What the draws read: the teams with their points, the competitions so far (a World Cup's field comes from its
 * qualifiers) and the game's hosts (hosts/drawHosts.ts), which name a World Cup's, Copa América's or Euro's hosts.
 */
export type DrawSource = {
  teams: Readonly<Record<string, NationalTeam>>;
  competitions: Readonly<Record<string, NationalCompetition>>;
  matches: readonly NationalMatch[];
  hosts?: Hosts;
};

// guess: the 2030 World Cup keeps 48 teams; CONMEBOL's 64-team proposal (20 Jul 2026) is not confirmed by FIFA
// (immersion-sources.md §3). A config value: 64 plays 16 groups.
export const WORLD_CUP_2030_SIZE: 48 | 64 = 48;
// guess: the 2028 Copa América host is not announced; Ecuador is next in CONMEBOL's rotation (immersion-sources.md §3).
// The game's hosts (hosts/drawHosts.ts) agree; these stand in for a draw that reads none.
export const COPA_AMERICA_2028_HOST = "ecuador";
// The 2030 hosts: Morocco, Spain and Portugal, and the centenary hosts Argentina, Uruguay and Paraguay, all qualified (FIFA Council, 4 Oct 2023).
const WORLD_CUP_2030_HOSTS = ["spain", "portugal", "morocco", "argentina", "uruguay", "paraguay"];
// guess: without the game's hosts, a later World Cup is hosted by the best-ranked team of a confederation in turn.
const HOST_TURNS: Confederation[] = ["CONCACAF", "AFC", "UEFA", "CAF", "CONMEBOL"];
// guess: places at a 48-team World Cup after its hosts, by confederation, from 2026's allocation (UEFA 16, CAF 9,
// AFC 8, CONMEBOL 6, CONCACAF 6, OFC 1, two play-offs), CONMEBOL and UEFA's through their qualifiers.
const WORLD_CUP_PLACES: Record<Confederation, number> = { UEFA: 16, CAF: 9, AFC: 8, CONMEBOL: 6, CONCACAF: 6, OFC: 1 };
// guess: the Copa América takes the 10 CONMEBOL teams and the six best of CONCACAF, as in 2024.
const COPA_AMERICA_GUESTS = 6;
// guess: Euro 2028 (UK and Ireland, 9 Jun–9 Jul 2028) takes the 24 best-ranked UEFA teams, its qualifiers not played.
const EURO_SIZE = 24;
const EURO_HOSTS = ["england", "scotland", "wales", "republic-of-ireland"];
const NATIONS_LEAGUE_A = 16;
/** The confederations whose World Cup qualifiers the game plays; the others' places go to their best-ranked teams. */
export const CONFEDERATIONS_WITH_QUALIFIERS: readonly Confederation[] = ["CONMEBOL", "UEFA"];

const REAL_ROUNDS: Record<string, string> = { "1/16": "round-of-32", "1/8": "round-of-16", "1/4": "quarter-finals", "1/2": "semi-finals", bronze: "third-place", final: "final" };

/** The 4-year cycle a season sits in: 0 a World Cup year (2026, 2030…), 2 the Copa América and Euro's. */
const phaseOf = (season: number) => (((season - 2026) % 4) + 4) % 4;

const byPoints = (teams: Readonly<Record<string, NationalTeam>>) => (a: string, b: string) => (teams[b]?.points ?? 0) - (teams[a]?.points ?? 0) || compareText(a, b);

/** The teams of a confederation, best first. */
function confederationTeams(source: DrawSource, confederation: Confederation): string[] {
  return Object.values(source.teams).filter((t) => t.confederation === confederation).map((t) => t.id).sort(byPoints(source.teams));
}

/** Groups of `size` drawn from pots of the teams by points, a host first in group A. */
function drawGroups(teamIds: readonly string[], size: number, source: DrawSource, random: () => number, hostIds: readonly string[] = []): Record<string, string[]> {
  const count = Math.ceil(teamIds.length / size);
  const seeded = [...hostIds.filter((id) => teamIds.includes(id)), ...teamIds.filter((id) => !hostIds.includes(id)).sort(byPoints(source.teams))];
  const groups: string[][] = Array.from({ length: count }, () => []);
  for (let pot = 0; pot * count < seeded.length; pot++) {
    const inPot = seeded.slice(pot * count, pot * count + count);
    const placed = pot === 0 ? [...inPot.slice(0, hostIds.length), ...shuffle(inPot.slice(hostIds.length), random)] : shuffle(inPot, random);
    placed.forEach((id, i) => groups[i]?.push(id));
  }
  return Object.fromEntries(groups.map((ids, i) => [String.fromCharCode(65 + i), ids]));
}

/** Each group's round robin on `days` (one day per matchday); an odd group sits a team out each round. */
function groupMatches(competitionId: string, groups: Record<string, string[]>, legs: 1 | 2, days: readonly IsoDate[], isNeutral: boolean): NationalMatch[] {
  const matches: NationalMatch[] = [];
  for (const [group, ids] of Object.entries(groups)) {
    const even = ids.length % 2 ? [...ids, ""] : ids;
    roundRobin(even, legs).forEach((pairs, round) => {
      const date = days[round];
      if (!date) return;
      for (const [homeId, awayId] of pairs) {
        if (!homeId || !awayId) continue;
        matches.push({ id: `${competitionId}-${group}-${round + 1}-${homeId}`, competitionId, round: "group", group, date, homeId, awayId, ...(isNeutral ? { isNeutral: true as const } : {}), result: null });
      }
    });
  }
  return matches;
}

/** The days a real competition's matches of `round` were played, one per match in order. */
const realDays = (fixtures: readonly RealFixture[], round: string) => fixtures.filter((f) => f.round === round).map((f) => f.date).sort();

/** The 2026 World Cup as it was drawn and scheduled, its knockout rounds on their real days. */
function realWorldCup(fixtures: readonly RealFixture[]): Opened {
  const id = "world-cup-2026";
  const own = fixtures.filter((f) => f.competition === id);
  const groups: Record<string, string[]> = {};
  const matches: NationalMatch[] = [];
  for (const f of own.filter((f) => f.group)) {
    const group = (groups[f.group] ??= []);
    for (const team of [f.homeId, f.awayId]) if (!group.includes(team)) group.push(team);
    matches.push({ id: `${id}-${f.group}-${f.round}-${f.homeId}`, competitionId: id, round: "group", group: f.group, date: f.date, homeId: f.homeId, awayId: f.awayId, isNeutral: true, result: null });
  }
  const knockout: KnockoutRound[] = Object.entries(REAL_ROUNDS).map(([real, name]) => ({ name, dates: realDays(own, real), legs: 1, takes: name === "third-place" ? "losers" : "winners", ...(name === "final" ? { from: 3 } : {}) }));
  const until = own.map((f) => f.date).sort().at(-1) ?? "2026-07-19";
  return { competitions: [{ id, name: "Copa do Mundo 2026", kind: "world-cup", groups, places: 2, bestOf: { position: 3, count: 8 }, knockout, opened: 0, until }], matches };
}

/** The 2026-27 Nations League's League A as drawn: its league phase on its real days, quarter-finals in March 2027, finals in June. */
function realNationsLeague(fixtures: readonly RealFixture[]): Opened {
  const id = "nations-league-2026";
  const own = fixtures.filter((f) => f.competition === "nations-league-a-2026");
  const groups: Record<string, string[]> = {};
  const matches = own.map((f): NationalMatch => {
    const group = (groups[f.group] ??= []);
    for (const team of [f.homeId, f.awayId]) if (!group.includes(team)) group.push(team);
    return { id: `${id}-${f.group}-${f.round}-${f.homeId}`, competitionId: id, round: "group", group: f.group, date: f.date, homeId: f.homeId, awayId: f.awayId, result: null };
  });
  const [march, june] = fifaWindowsOf(2027);
  return { competitions: [nationsLeagueOf(id, "Liga das Nações 2026-27", groups, march?.matchDays ?? [], june?.matchDays ?? [])], matches };
}

/**
 * A Nations League's League A: group winners and runners-up to two-legged quarter-finals (winner against
 * another group's runner-up) when `quarterDays` are given, then the Final Four: semi-finals on the June window's
 * first day and the day after, third place and final on its second.
 */
function nationsLeagueOf(id: string, name: string, groups: Record<string, string[]>, quarterDays: readonly IsoDate[], june: readonly IsoDate[]): NationalCompetition {
  const [first = "", second = ""] = june;
  const semis: KnockoutRound = { name: "semi-finals", dates: [first, addDays(first, 1)], legs: 1, takes: "winners" };
  const quarters: KnockoutRound[] = quarterDays.length >= 2 ? [{ name: "quarter-finals", dates: quarterDays.slice(0, 2), legs: 2, takes: "winners" }] : [];
  const semiIndex = quarters.length;
  return {
    id,
    name,
    kind: "nations-league",
    confederation: "UEFA",
    groups,
    places: quarters.length ? 2 : 1,
    knockout: [...quarters, semis, { name: "third-place", dates: [second], legs: 1, takes: "losers", from: semiIndex }, { name: "final", dates: [second], legs: 1, takes: "winners", from: semiIndex }],
    opened: 0,
    until: second,
  };
}

/** A generic final tournament: groups of four on three matchdays, then single-match knockout rounds to the final. */
function tournamentOf(
  base: Pick<NationalCompetition, "id" | "name" | "kind" | "confederation" | "host">,
  groups: Record<string, string[]>,
  groupDays: readonly IsoDate[],
  rounds: readonly { name: string; date: IsoDate }[],
  bestOf?: NationalCompetition["bestOf"],
): Opened {
  const knockout = rounds.map(({ name, date }): KnockoutRound => ({ name, dates: [date], legs: 1, takes: name === "third-place" ? "losers" : "winners" }));
  const finalIndex = knockout.findIndex((round) => round.name === "final");
  const thirdIndex = knockout.findIndex((round) => round.name === "third-place");
  if (thirdIndex >= 0 && finalIndex > thirdIndex) knockout[finalIndex] = { ...(knockout[finalIndex] as KnockoutRound), from: thirdIndex - 1 };
  const until = rounds.at(-1)?.date ?? groupDays.at(-1) ?? "";
  const competition: NationalCompetition = { ...base, groups, places: 2, ...(bestOf ? { bestOf } : {}), knockout, opened: 0, until };
  return { competitions: [competition], matches: groupMatches(base.id, groups, 1, groupDays, true) };
}

const worldCupSizeOf = (season: number): 48 | 64 => (season === 2030 ? WORLD_CUP_2030_SIZE : 48);

/** A World Cup's hosts: the game's for it, else 2030's six, else the best-ranked team of the confederation whose turn it is. */
function worldCupHostsOf(season: number, source: DrawSource): string[] {
  const hosts = source.hosts?.[`world-cup-${season}`]?.countries;
  if (hosts) return hosts;
  return season === 2030 ? WORLD_CUP_2030_HOSTS : [confederationTeams(source, HOST_TURNS[((season - 2034) / 4) % HOST_TURNS.length] ?? "UEFA")[0] ?? ""];
}

/** A World Cup after 2026's, its days 2026's moved to its own start; its field the hosts, the qualifiers' and the best-ranked of the rest. */
function worldCupOfSeason(season: number, source: DrawSource, random: () => number): Opened {
  const span = worldCupOf(season);
  if (!span) return { competitions: [], matches: [] };
  const id = `world-cup-${season}`;
  const size = worldCupSizeOf(season);
  const hosts = worldCupHostsOf(season, source);
  const field = worldCupField(season, size, hosts, source);
  const groups = drawGroups(field, 4, source, random, hosts.slice(0, 1));
  const shift = daysBetween("2026-06-11", span.from);
  const day = (offset: number) => addDays(span.from, offset);
  const at = (date: IsoDate) => addDays(date, shift);
  return tournamentOf(
    { id, name: `Copa do Mundo ${season}`, kind: "world-cup", host: hosts[0] ?? "" },
    groups,
    [day(1), day(7), day(13)],
    [{ name: "round-of-32", date: at("2026-06-30") }, { name: "round-of-16", date: at("2026-07-05") }, { name: "quarter-finals", date: at("2026-07-10") }, { name: "semi-finals", date: at("2026-07-14") }, { name: "third-place", date: addDays(span.until, -1) }, { name: "final", date: span.until }],
    size === 64 ? undefined : { position: 3, count: 8 },
  );
}

/** The teams that qualified from a qualifying competition: its group winners, then the best runners-up, `count` in all, leaving out `already`. */
export function qualifiedFrom(competition: NationalCompetition | undefined, matches: readonly NationalMatch[], count: number, already: ReadonlySet<string>, points: (id: string) => number): string[] {
  if (!competition) return [];
  const own = matches.filter((m) => m.competitionId === competition.id);
  const best = byTable(own, points);
  const tables = Object.values(competition.groups).map((ids) => groupTable(ids, own, points).filter((id) => !already.has(id)));
  const out: string[] = [];
  for (let place = 0; out.length < count && tables.some((table) => table.length > place); place++) {
    out.push(...tables.flatMap((table) => table.slice(place, place + 1)).sort(best).slice(0, count - out.length));
  }
  return out;
}

/** Teams of different groups compared on their group matches: points, goal difference, goals for, then FIFA points. */
function byTable(matches: readonly NationalMatch[], points: (id: string) => number): (a: string, b: string) => number {
  const stats = new Map<string, { pts: number; gd: number; gf: number }>();
  for (const m of matches) {
    if (!m.result || m.round !== "group") continue;
    for (const [id, f, a] of [[m.homeId, m.result.home, m.result.away], [m.awayId, m.result.away, m.result.home]] as const) {
      const row = stats.get(id) ?? { pts: 0, gd: 0, gf: 0 };
      stats.set(id, { pts: row.pts + (f > a ? 3 : f === a ? 1 : 0), gd: row.gd + f - a, gf: row.gf + f });
    }
  }
  const row = (id: string) => stats.get(id) ?? { pts: 0, gd: 0, gf: 0 };
  return (a, b) => row(b).pts - row(a).pts || row(b).gd - row(a).gd || row(b).gf - row(a).gf || points(b) - points(a);
}

function worldCupField(season: number, size: number, hosts: readonly string[], source: DrawSource): string[] {
  const field = new Set(hosts.filter((id) => id in source.teams));
  const points = (id: string) => source.teams[id]?.points ?? 0;
  const hostsOf = (confederation: Confederation) => [...field].filter((id) => source.teams[id]?.confederation === confederation).length;
  const places = (confederation: Confederation) => Math.round((WORLD_CUP_PLACES[confederation] * size) / 48) - hostsOf(confederation);
  const qualifiers = (confederation: Confederation) => source.competitions[`qualifiers-${confederation.toLowerCase()}-${season}`];
  for (const confederation of CONFEDERATIONS_WITH_QUALIFIERS) {
    for (const id of qualifiedFrom(qualifiers(confederation), source.matches, Math.max(0, places(confederation)), field, points)) field.add(id);
  }
  for (const confederation of CONFEDERATIONS.filter((own) => !CONFEDERATIONS_WITH_QUALIFIERS.includes(own))) {
    for (const id of confederationTeams(source, confederation).filter((own) => !field.has(own)).slice(0, Math.max(0, places(confederation)))) field.add(id);
  }
  for (const id of Object.keys(source.teams).sort(byPoints(source.teams))) if (field.size < size) field.add(id);
  return [...field].slice(0, size);
}

/** The teams through a competition's groups in seeding order: each place's teams best first, then the best of the next place. */
export function groupQualifiers(competition: NationalCompetition, matches: readonly NationalMatch[], points: (id: string) => number): string[] {
  const own = matches.filter((m) => m.competitionId === competition.id && m.round === "group");
  const best = byTable(own, points);
  const tables = Object.values(competition.groups).map((ids) => groupTable(ids, own, points));
  const through: string[] = [];
  for (let place = 0; place < competition.places; place++) through.push(...tables.flatMap((table) => table.slice(place, place + 1)).sort(best));
  if (competition.bestOf) {
    const { position, count } = competition.bestOf;
    through.push(...tables.flatMap((table) => table.slice(position - 1, position)).sort(best).slice(0, count));
  }
  return through;
}

/**
 * The teams a competition sends on as its tables stand: a World Cup qualifier's hosts, in already, and the best
 * of the rest to its confederation's share of the cup, or a tournament's or Nations League's group places.
 */
export function throughNow(competition: NationalCompetition, source: DrawSource): Set<string> {
  const points = (id: string) => source.teams[id]?.points ?? 0;
  const { confederation } = competition;
  if (competition.kind !== "qualifiers" || !confederation) return new Set(groupQualifiers(competition, source.matches, points));
  // A qualifier's id ends in its World Cup's year (competitionsOf).
  const season = Number(competition.id.slice(competition.id.lastIndexOf("-") + 1));
  const hosts = worldCupHostsOf(season, source).filter((id) => source.teams[id]?.confederation === confederation);
  const places = Math.round((WORLD_CUP_PLACES[confederation] * worldCupSizeOf(season)) / 48) - hosts.length;
  return new Set([...hosts, ...qualifiedFrom(competition, source.matches, Math.max(0, places), new Set(hosts), points)]);
}

/** A table's order: points, goal difference, goals for, then FIFA points. */
export function groupTable(teamIds: readonly string[], matches: readonly NationalMatch[], points: (id: string) => number): string[] {
  const rows = new Map(teamIds.map((id) => [id, { pts: 0, gd: 0, gf: 0 }]));
  for (const m of matches) {
    const home = rows.get(m.homeId);
    const away = rows.get(m.awayId);
    if (!m.result || !home || !away || m.round !== "group") continue;
    const { home: h, away: a } = m.result;
    home.gf += h;
    away.gf += a;
    home.gd += h - a;
    away.gd += a - h;
    home.pts += h > a ? 3 : h === a ? 1 : 0;
    away.pts += a > h ? 3 : h === a ? 1 : 0;
  }
  const row = (id: string) => rows.get(id) ?? { pts: 0, gd: 0, gf: 0 };
  return [...teamIds].sort((a, b) => row(b).pts - row(a).pts || row(b).gd - row(a).gd || row(b).gf - row(a).gf || points(b) - points(a) || compareText(a, b));
}

/** The window match days of `seasons` picked by index: [season, window index, how many of its days]. */
function windowDays(picks: readonly [number, number, number][]): IsoDate[] {
  return picks.flatMap(([season, window, count]) => (fifaWindowsOf(season)[window]?.matchDays ?? []).slice(0, count));
}

/**
 * The competitions `season` opens on 1 January, with their group matches: the World Cup in its year, the
 * Copa América and the Euro two years after, CONMEBOL's World Cup qualifiers (a ten-team double round robin
 * over seven windows, as in the 2026 cycle) from the year after a World Cup, UEFA's (guess: 13 groups of four,
 * its 2030 format not published) the year before one, and a Nations League League A every even year. 2026's
 * World Cup and Nations League come from the real draws (`real`).
 */
export function competitionsOf(season: number, source: DrawSource, random: () => number, real: readonly RealFixture[] = []): Opened {
  const opened: Opened[] = [];
  const phase = phaseOf(season);
  if (season === 2026) opened.push(realWorldCup(real), realNationsLeague(real));
  else if (phase === 0) opened.push(worldCupOfSeason(season, source, random));
  if (phase === 1) {
    const ids = confederationTeams(source, "CONMEBOL");
    const days = windowDays([[season, 2, 4], [season, 3, 2], [season + 1, 0, 2], [season + 1, 2, 4], [season + 1, 3, 2], [season + 2, 0, 2], [season + 2, 1, 2]]);
    const id = `qualifiers-conmebol-${season + 3}`;
    const groups = { A: shuffle(ids, random) };
    opened.push({ competitions: [{ id, name: `Eliminatórias Sul-Americanas ${season + 3}`, kind: "qualifiers", confederation: "CONMEBOL", groups, places: ids.length, knockout: [], opened: 0, until: days.at(-1) ?? "" }], matches: groupMatches(id, groups, 2, days, false) });
  }
  if (phase === 2) {
    const host = source.hosts?.[`copa-america-${season}`]?.countries[0] ?? (season === 2028 ? COPA_AMERICA_2028_HOST : (confederationTeams(source, "CONMEBOL")[(season - 2028) / 4 % 10] ?? ""));
    const copa = [...confederationTeams(source, "CONMEBOL"), ...confederationTeams(source, "CONCACAF").slice(0, COPA_AMERICA_GUESTS)];
    const june = (date: string) => `${season}-${date}`;
    // guess: the 2028 Copa América's days, like 2024's (20 Jun–14 Jul) within FIFA's June-July slot.
    opened.push(tournamentOf({ id: `copa-america-${season}`, name: `Copa América ${season}`, kind: "continental-cup", confederation: "CONMEBOL", host }, drawGroups(copa, 4, source, random, [host]), [june("06-16"), june("06-20"), june("06-24")], [{ name: "quarter-finals", date: june("06-28") }, { name: "semi-finals", date: june("07-02") }, { name: "third-place", date: june("07-08") }, { name: "final", date: june("07-09") }]));
    const euroHosts = source.hosts?.[`euro-${season}`]?.countries ?? EURO_HOSTS;
    const euro = [...euroHosts.filter((id) => id in source.teams), ...confederationTeams(source, "UEFA").filter((id) => !euroHosts.includes(id))].slice(0, EURO_SIZE);
    // UEFA Euro 2028: 9 Jun–9 Jul 2028 (UEFA); guess: matchdays and rounds spread over it as at Euro 2024.
    opened.push(tournamentOf({ id: `euro-${season}`, name: `Eurocopa ${season}`, kind: "continental-cup", confederation: "UEFA", host: euroHosts[0] ?? "" }, drawGroups(euro, 4, source, random, euroHosts.slice(0, 1)), [june("06-10"), june("06-15"), june("06-20")], [{ name: "round-of-16", date: june("06-25") }, { name: "quarter-finals", date: june("06-30") }, { name: "semi-finals", date: june("07-04") }, { name: "final", date: june("07-09") }], { position: 3, count: 4 }));
  }
  if (phase === 3) {
    const hosts = season + 1 === 2030 || source.hosts?.[`world-cup-${season + 1}`] ? worldCupHostsOf(season + 1, source) : [];
    const ids = confederationTeams(source, "UEFA").filter((id) => !hosts.includes(id));
    const days = windowDays([[season, 0, 2], [season, 2, 4]]);
    const id = `qualifiers-uefa-${season + 1}`;
    const groups = drawGroups(ids, 4, source, random);
    opened.push({ competitions: [{ id, name: `Eliminatórias Europeias ${season + 1}`, kind: "qualifiers", confederation: "UEFA", groups, places: 1, knockout: [], opened: 0, until: days.at(-1) ?? "" }], matches: groupMatches(id, groups, 2, days, false) });
  }
  if (season !== 2026 && phase % 2 === 0) {
    const id = `nations-league-${season}`;
    const ids = confederationTeams(source, "UEFA").slice(0, NATIONS_LEAGUE_A);
    const groups = drawGroups(ids, 4, source, random);
    const days = windowDays([[season, 2, 4], [season, 3, 2]]);
    const competition = nationsLeagueOf(id, `Liga das Nações ${season}-${String(season + 1).slice(2)}`, groups, [], fifaWindowsOf(season + 1)[1]?.matchDays ?? []);
    opened.push({ competitions: [competition], matches: groupMatches(id, groups, 2, days, false) });
  }
  return { competitions: opened.flatMap((o) => o.competitions), matches: opened.flatMap((o) => o.matches) };
}
