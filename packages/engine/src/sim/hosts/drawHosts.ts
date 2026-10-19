import { keyedStream } from "../../engine/random.js";
import { isClubWorldCupSeason } from "../continental/clubWorldCup.js";
import type { GameState } from "../gameState.js";
import { ANNOUNCED_HOSTS, type AnnouncedHost } from "./announcedHosts.js";
import { BIG_STADIUMS } from "./bigStadiums.js";
import { HOSTED_CUPS, type EditionHost, type HostedCup, type Hosts, type Stadium } from "./venue.js";

type Confederation = "AFC" | "CAF" | "CONCACAF" | "CONMEBOL" | "OFC" | "UEFA";

const CONMEBOL = ["argentina", "bolivia", "brazil", "chile", "colombia", "ecuador", "paraguay", "peru", "uruguay", "venezuela"];
// UEFA's members among the big grounds' countries that can stage its matches: Russia is suspended from UEFA's
// competitions since 28 Feb 2022, and UEFA has played no match in Ukraine since Russia's invasion that month.
const UEFA = [
  "armenia", "austria", "azerbaijan", "belgium", "bulgaria", "england", "finland", "france", "georgia", "germany", "greece", "hungary", "italy",
  "kazakhstan", "netherlands", "poland", "portugal", "republic-of-ireland", "romania", "scotland", "serbia", "spain", "sweden", "turkiye", "wales",
];
const CONFEDERATIONS: Readonly<Record<string, Confederation>> = {
  ...Object.fromEntries(CONMEBOL.map((country) => [country, "CONMEBOL"])),
  ...Object.fromEntries(UEFA.map((country) => [country, "UEFA"])),
  "united-states": "CONCACAF", canada: "CONCACAF", mexico: "CONCACAF",
  morocco: "CAF", egypt: "CAF", "south-africa": "CAF", nigeria: "CAF", algeria: "CAF",
  "saudi-arabia": "AFC", qatar: "AFC", china: "AFC", japan: "AFC", "south-korea": "AFC", australia: "AFC", india: "AFC", indonesia: "AFC",
  "new-zealand": "OFC",
};

/**
 * Who can bid for a World Cup, a Euro or a Club World Cup: past hosts and declared bidders, alone or together. World Cups:
 * every host since 1998 and the 2026–2034 bidders (with the "Juntos 2030" partners Argentina, Chile, Paraguay and Uruguay,
 * Australia and New Zealand for 2034, Egypt and South Africa's past bids). Euros: hosts since 2000 and the 2028–2032
 * bidders. Club World Cup 2029: the countries the press names as interested (Wikipedia, "2029 FIFA Club World Cup";
 * World Soccer Talk, 2025), and the United States, its 2025 host.
 */
const WORLD_CUP_BIDS: readonly string[][] = [
  ["united-states"], ["mexico"], ["united-states", "canada", "mexico"], ["brazil"], ["argentina", "chile", "paraguay", "uruguay"],
  ["england"], ["england", "scotland", "wales", "republic-of-ireland"], ["germany"], ["france"], ["italy"], ["spain", "portugal"], ["turkiye"],
  ["morocco"], ["egypt"], ["south-africa"], ["qatar"], ["saudi-arabia"], ["china"], ["japan", "south-korea"], ["australia", "new-zealand"],
];
const EURO_BIDS: readonly string[][] = [
  ["england"], ["england", "scotland", "wales", "republic-of-ireland"], ["germany"], ["france"], ["italy"], ["turkiye"], ["italy", "turkiye"],
  ["spain", "portugal"], ["netherlands", "belgium"], ["austria"],
];
const CLUB_WORLD_CUP_BIDS: readonly string[][] = [
  ["qatar"], ["morocco"], ["saudi-arabia"], ["brazil"], ["germany"], ["england"], ["spain"], ["spain", "portugal"], ["united-states"],
];

/**
 * What a tournament's host needs. FIFA asks a World Cup's bidders for 14 grounds, four of them built, of at least
 * 40,000 seats, 60,000 for the semi-finals and 80,000 for the opening match and final (FIFA's 2030/2034 bidding
 * process, The Stadium Business, 2023): guess, a final ground within 5% of that, as the Bernabéu's 78,297 for 2030's
 * favourite is. UEFA asks a Euro final for 60,000 (Juventus Stadium ruled out, 2026): guess, four built grounds of
 * 40,000. guess: a Club World Cup the same. `grounds` is how many of the host's largest a tournament spreads over.
 */
const TOURNAMENTS = {
  "world-cup": { bids: WORLD_CUP_BIDS, minFinal: 76_000, minGrounds: 4, grounds: 16 },
  euro: { bids: EURO_BIDS, minFinal: 60_000, minGrounds: 4, grounds: 10 },
  "club-world-cup": { bids: CLUB_WORLD_CUP_BIDS, minFinal: 60_000, minGrounds: 4, grounds: 12 },
  "copa-america": { bids: CONMEBOL.map((country) => [country]), minFinal: 40_000, minGrounds: 1, grounds: 8 },
} as const;
type Tournament = keyof typeof TOURNAMENTS;

/**
 * Where a one-match final may be played: CONMEBOL's in a member's ground of 40,000 (guess, the Sul-Americana's 2026 one
 * seats 46,788), UEFA's in a member's, the Champions League's of 60,000 (guess, as a Euro final's). A country hosts the
 * same final again only after `rest` editions (guess: CONMEBOL never twice running, 2019–2026's finals; UEFA spreads
 * theirs further) and never two of a season's finals (guess, as 2025–2027's).
 */
const FINALS = {
  libertadores: { members: CONMEBOL, minCapacity: 40_000, rest: 1 },
  "sul-americana": { members: CONMEBOL, minCapacity: 40_000, rest: 1 },
  "champions-league": { members: UEFA, minCapacity: 60_000, rest: 2 },
  "europa-league": { members: UEFA, minCapacity: 40_000, rest: 2 },
  "uefa-super-cup": { members: UEFA, minCapacity: 40_000, rest: 2 },
} as const;
type Final = keyof typeof FINALS;
const isFinal = (cup: HostedCup): cup is Final => cup in FINALS;

const SEASON_FINALS: readonly (readonly Final[])[] = [["libertadores", "sul-americana"], ["champions-league", "europa-league", "uefa-super-cup"]];

// The Copa América's hosts since 1987, last year each member hosted: CONMEBOL's rotation (Wikipedia, "Copa América").
const COPA_AMERICA_LAST_HOSTED: Readonly<Record<string, number>> = {
  argentina: 2011, bolivia: 1997, brazil: 2021, chile: 2015, colombia: 2001, ecuador: 1993, paraguay: 1999, peru: 2004, uruguay: 1995, venezuela: 2007,
};

/**
 * How many seasons ahead an edition's host is known: FIFA chose 2030's and 2034's World Cup hosts in 2024, UEFA its Euro
 * hosts five years ahead and its finals' grounds two, CONMEBOL its finals' a year ahead (guess for the Copa América and
 * the Club World Cup, four).
 */
const LEAD: Readonly<Record<HostedCup, number>> = {
  "world-cup": 8, euro: 6, "copa-america": 4, "club-world-cup": 4, libertadores: 1, "sul-americana": 1, "champions-league": 2, "europa-league": 2,
  "uefa-super-cup": 2,
};
const FIRST_SEASON = 2026;

/** Whether `cup` has an edition in `season`: World Cups from 2026 every four years, Euros and Copas from 2028, the Club World Cup its own years, the finals every season. */
export function isEditionSeason(cup: HostedCup, season: number): boolean {
  if (cup === "world-cup") return season >= 2026 && (season - 2026) % 4 === 0;
  if (cup === "euro" || cup === "copa-america") return season >= 2028 && (season - 2028) % 4 === 0;
  if (cup === "club-world-cup") return isClubWorldCupSeason(season);
  return true;
}

const confederationsOf = (countries: readonly string[]) => new Set(countries.map((country) => CONFEDERATIONS[country]));

const byCapacity = (a: Stadium, b: Stadium) => b.capacity - a.capacity || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

const nameKey = (name: string) => name.normalize("NFD").replace(/[^a-z0-9]/gi, "").toLowerCase();

/**
 * Whether two entries are one ground: the same name but for accents and punctuation ("St James' Park"), or the same
 * city and about the same seats under another name ("Estádio Metropolitano", "Riyadh Air Metropolitano").
 */
function isSameGround(a: Stadium, b: Stadium): boolean {
  return nameKey(a.name) === nameKey(b.name) || (a.city === b.city && Math.abs(a.capacity - b.capacity) <= 0.05 * Math.max(a.capacity, b.capacity));
}

/** The grounds of `countries`: an announced tournament's first (its names and World Cup capacities), then the big ones, each once, largest first. */
export function groundsOf(countries: readonly string[]): Stadium[] {
  const named = Object.values(ANNOUNCED_HOSTS).flatMap((host) => host.grounds ?? []);
  const all = [...named, ...BIG_STADIUMS].filter((ground) => countries.includes(ground.country));
  return all.filter((ground, i) => all.findIndex((other) => isSameGround(other, ground)) === i).sort(byCapacity);
}

// The grounds that staged an announced tournament's final, which a drawn edition in their country goes back to.
const TOURNAMENT_FINALS = new Set(Object.values(ANNOUNCED_HOSTS).flatMap((host) => (host.grounds && host.final ? [host.final.name] : [])));

const pick = <T>(items: readonly T[], random: () => number): T | undefined => items[Math.floor(random() * items.length)];

/** The editions of `cup` up to `season`, newest first, with their known hosts. */
function earlier(cup: HostedCup, season: number, known: (id: string) => AnnouncedHost | undefined): AnnouncedHost[] {
  const found: AnnouncedHost[] = [];
  for (let year = season - 1; year >= season - 12; year--) {
    const host = known(`${cup}-${year}`);
    if (host) found.push(host);
  }
  return found;
}

/**
 * A tournament's grounds and final: the announced final; else, for a drawn host, a ground of an announced tournament's
 * final in its countries (MetLife for the United States), or its largest, as every World Cup and Euro final since 2006
 * but Euro 2016's; an announced host that hasn't named one (2030, Euro 2032) gets it drawn among its grounds that seat
 * the rule's final.
 */
function tournamentHost(cup: Tournament, countries: string[], random: () => number, announced?: AnnouncedHost): EditionHost {
  const rule = TOURNAMENTS[cup];
  const grounds = announced?.grounds ? [...announced.grounds].sort(byCapacity) : groundsOf(countries).slice(0, rule.grounds);
  const big = grounds.filter((ground) => ground.capacity >= rule.minFinal);
  const undecided = announced ? pick(big, random) : undefined;
  const final = announced?.final ?? undecided ?? big.find((ground) => TOURNAMENT_FINALS.has(ground.name)) ?? grounds[0];
  if (!final) throw new Error(`no ground for ${cup} in ${countries.join(", ")}`);
  return { countries, final, grounds: [final, ...grounds.filter((ground) => ground.name !== final.name)] };
}

function drawnTournament(cup: Tournament, season: number, random: () => number, known: (id: string) => AnnouncedHost | undefined): EditionHost {
  const rule = TOURNAMENTS[cup];
  const before = earlier(cup, season, known);
  const fits = (bid: readonly string[]) => {
    const grounds = groundsOf(bid);
    return grounds.length >= rule.minGrounds && (grounds[0]?.capacity ?? 0) >= rule.minFinal;
  };
  let bids = rule.bids.filter(fits);
  if (cup === "copa-america") {
    const lastHosted = (country: string) => Math.max(COPA_AMERICA_LAST_HOSTED[country] ?? 0, ...yearsHosted(cup, season, country, known));
    const longest = Math.min(...bids.map(([country]) => lastHosted(country ?? "")));
    bids = bids.filter(([country]) => lastHosted(country ?? "") === longest);
  } else if (cup === "euro") {
    const recent = new Set(before.slice(0, 2).flatMap((host) => host.countries));
    bids = bids.filter((bid) => bid.every((country) => !recent.has(country)));
  } else {
    // FIFA: no confederation that hosted either of the two editions before (World Cup); guess, the one before (Club World Cup).
    const recent = confederationsOf(before.slice(0, cup === "world-cup" ? 2 : 1).flatMap((host) => host.countries));
    bids = bids.filter((bid) => [...confederationsOf(bid)].every((confederation) => !recent.has(confederation)));
  }
  const bid = pick(bids, random) ?? rule.bids.find(fits) ?? [];
  return tournamentHost(cup, [...bid], random);
}

function yearsHosted(cup: HostedCup, season: number, country: string, known: (id: string) => AnnouncedHost | undefined): number[] {
  const years: number[] = [];
  for (let year = FIRST_SEASON; year < season; year++) if (known(`${cup}-${year}`)?.countries.includes(country)) years.push(year);
  return years;
}

function drawnFinal(cup: Final, season: number, random: () => number, known: (id: string) => AnnouncedHost | undefined): EditionHost {
  const rule = FINALS[cup];
  const rested = new Set(earlier(cup, season, known).slice(0, rule.rest).flatMap((host) => host.countries));
  const sameSeason = new Set((SEASON_FINALS.find((finals) => finals.includes(cup)) ?? []).flatMap((other) => known(`${other}-${season}`)?.countries ?? []));
  const grounds = (country: string) => groundsOf([country]).filter((ground) => ground.capacity >= rule.minCapacity).slice(0, 3);
  const able = rule.members.filter((country) => grounds(country).length > 0);
  const free = able.filter((country) => !rested.has(country) && !sameSeason.has(country));
  const country = pick(free.length > 0 ? free : able, random) ?? "";
  const final = pick(grounds(country), random);
  if (!final) throw new Error(`no ground for the ${cup} final`);
  return { countries: [country], final, grounds: [final] };
}

/** The host of `cup`'s edition of `season`: as announced, completed by the rules where the announcement leaves a gap, else drawn by them. */
function hostOf(cup: HostedCup, season: number, seed: number, known: (id: string) => AnnouncedHost | undefined): EditionHost {
  const id = `${cup}-${season}`;
  const random = keyedStream(seed, `host:${id}`);
  const announced = ANNOUNCED_HOSTS[id];
  if (isFinal(cup)) {
    if (announced?.final) return { countries: announced.countries, final: announced.final, grounds: [announced.final] };
    return drawnFinal(cup, season, random, known);
  }
  if (announced) return tournamentHost(cup, announced.countries, random, announced);
  return drawnTournament(cup, season, random, known);
}

/**
 * `hosts` with every edition up to `season` and as far ahead as its organiser would have chosen its host, from 2026:
 * announced ones as announced, the rest drawn by the real rules on a stream of the game's seed. An edition already in
 * `hosts` keeps its host. Returns `hosts` itself when nothing is new.
 */
export function hostsThrough(hosts: Hosts, seed: number, season: number): Hosts {
  const added: Record<string, EditionHost> = {};
  const known = (id: string): AnnouncedHost | undefined => hosts[id] ?? added[id] ?? ANNOUNCED_HOSTS[id];
  const last = season + Math.max(...Object.values(LEAD));
  for (let year = FIRST_SEASON; year <= last; year++) {
    for (const cup of HOSTED_CUPS) {
      const id = `${cup}-${year}`;
      if (year > season + LEAD[cup] || !isEditionSeason(cup, year) || hosts[id]) continue;
      added[id] = hostOf(cup, year, seed, known);
    }
  }
  return Object.keys(added).length === 0 ? hosts : { ...hosts, ...added };
}

/** The game with the hosts of every edition through its season and as far ahead as organisers choose them; the same game when it has them all. */
export function withHosts(state: GameState): GameState {
  const hosts = hostsThrough(state.hosts ?? {}, state.seed, state.season);
  return hosts === state.hosts ? state : { ...state, hosts };
}
