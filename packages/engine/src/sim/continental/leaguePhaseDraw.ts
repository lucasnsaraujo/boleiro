import { shuffle } from "../shuffle.js";

export const LEAGUE_PHASE_CLUBS = 36;
const POTS = 4;
const POT_SIZE = LEAGUE_PHASE_CLUBS / POTS;
const PAIR_SIZE = 2 * POT_SIZE;
const MATCHINGS = 4;
// Swaps each go at the draw tries inside a pot to keep two clubs of one country apart, and the goes it takes at most.
const SWAPS = 1500;
const ATTEMPTS = 30;

type Slot = number;
type Pairing = [Slot, Slot];

/**
 * Two pots taken together as the circulant graph on 18 places, pot X's club i at place 2i and pot Y's
 * at 2i+1, each place joined to the next and the one after: every club then meets two of its own pot
 * and two of the other, one of each at home (the edge's first place hosts). Split into four perfect
 * matchings, one per matchday, by a small search.
 */
function pairedPotMatchings(): Pairing[][] {
  const edges: Pairing[] = Array.from({ length: PAIR_SIZE }, (_, v) => [1, 2].map((step): Pairing => [v, (v + step) % PAIR_SIZE])).flat();
  const colours = new Array<number>(edges.length).fill(-1);
  const used = Array.from({ length: PAIR_SIZE }, () => new Set<number>());
  const colour = (index: number): boolean => {
    const edge = edges[index];
    if (!edge) return true;
    const [a, b] = edge;
    for (let c = 0; c < MATCHINGS; c++) {
      if (used[a]?.has(c) || used[b]?.has(c)) continue;
      used[a]?.add(c);
      used[b]?.add(c);
      colours[index] = c;
      if (colour(index + 1)) return true;
      used[a]?.delete(c);
      used[b]?.delete(c);
    }
    return false;
  };
  if (!colour(0)) throw new Error("no split of the paired pots into matchdays");
  return Array.from({ length: MATCHINGS }, (_, c) => edges.filter((_, i) => colours[i] === c));
}

const PAIRED = pairedPotMatchings();

/** The slots of a paired-pot matching, the pots being `x` and `y`. */
const pairedDay = (matching: readonly Pairing[], x: number, y: number): Pairing[] =>
  matching.map(([a, b]) => [a, b].map((v) => (v % 2 === 0 ? x : y) * POT_SIZE + Math.floor(v / 2)) as Pairing);

/** Each club of pot `x` against one of pot `y`: club i hosting club i, or visiting club i - 1 of `y` hosting it. */
const crossDay = (x: number, y: number, isXHosting: boolean): Pairing[] =>
  Array.from({ length: POT_SIZE }, (_, i): Pairing =>
    isXHosting ? [x * POT_SIZE + i, y * POT_SIZE + i] : [y * POT_SIZE + i, x * POT_SIZE + ((i + 1) % POT_SIZE)],
  );

// Pots 1+2 and 3+4 meet within their pairs on four matchdays; 1-3 with 2-4, and 1-4 with 2-3, on two each.
const SLOT_DAYS: Pairing[][] = [
  [...pairedDay(PAIRED[0] ?? [], 0, 1), ...pairedDay(PAIRED[0] ?? [], 2, 3)],
  [...crossDay(0, 2, true), ...crossDay(1, 3, true)],
  [...pairedDay(PAIRED[1] ?? [], 0, 1), ...pairedDay(PAIRED[1] ?? [], 2, 3)],
  [...crossDay(0, 3, true), ...crossDay(1, 2, true)],
  [...pairedDay(PAIRED[2] ?? [], 0, 1), ...pairedDay(PAIRED[2] ?? [], 2, 3)],
  [...crossDay(0, 2, false), ...crossDay(1, 3, false)],
  [...pairedDay(PAIRED[3] ?? [], 0, 1), ...pairedDay(PAIRED[3] ?? [], 2, 3)],
  [...crossDay(0, 3, false), ...crossDay(1, 2, false)],
];
const SLOT_MATCHES = SLOT_DAYS.flat();

/**
 * The league phase's eight matchdays, home club first, from 36 clubs in four pots of nine (`seeded`,
 * pot by pot). As UEFA's draw, each club meets two clubs of every pot, one at home, and none of its
 * own country, as far as a few goes at placing the clubs find (the one with fewest such meetings is
 * kept). guess: UEFA's limit of two opponents from one country is not kept.
 */
export function drawLeaguePhase(seeded: readonly string[], countryOf: (id: string) => string, random: () => number): [string, string][][] {
  if (seeded.length !== LEAGUE_PHASE_CLUBS) throw new Error(`a league phase needs ${LEAGUE_PHASE_CLUBS} clubs, not ${seeded.length}`);
  let best = placeClubs(seeded, countryOf, random);
  for (let attempt = 1; attempt < ATTEMPTS && best.cost > 0; attempt++) {
    const next = placeClubs(seeded, countryOf, random);
    if (next.cost < best.cost) best = next;
  }
  const { placed } = best;
  return SLOT_DAYS.map((day) => day.map(([home, away]): [string, string] => [placed[home] ?? "", placed[away] ?? ""]));
}

/** One go at the draw: the clubs placed at random in their pots, then swapped inside a pot while that leaves fewer meetings of one country. */
function placeClubs(seeded: readonly string[], countryOf: (id: string) => string, random: () => number): { placed: string[]; cost: number } {
  const placed = Array.from({ length: POTS }, (_, pot) => shuffle(seeded.slice(pot * POT_SIZE, (pot + 1) * POT_SIZE), random)).flat();
  const country = placed.map(countryOf);
  const clashes = () => SLOT_MATCHES.reduce((sum, [a, b]) => sum + (country[a] === country[b] ? 1 : 0), 0);
  let cost = clashes();
  for (let i = 0; i < SWAPS && cost > 0; i++) {
    const pot = Math.floor(random() * POTS);
    const a = pot * POT_SIZE + Math.floor(random() * POT_SIZE);
    const b = pot * POT_SIZE + Math.floor(random() * POT_SIZE);
    const swap = () => {
      [placed[a], placed[b]] = [placed[b] ?? "", placed[a] ?? ""];
      [country[a], country[b]] = [country[b] ?? "", country[a] ?? ""];
    };
    swap();
    const next = clashes();
    if (next <= cost) cost = next;
    else swap();
  }
  return { placed, cost };
}
