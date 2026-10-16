import type { ContinentalCompetition, Fixture, IsoDate } from "../gameState.js";
import type { StageShape } from "../leagueFormats.js";
import { groupStageAt, knockoutStageAt } from "../stageAt.js";
import { standings } from "../standings.js";
import { tieResults } from "../tieResults.js";

export const CONFEDERATIONS = ["uefa", "conmebol", "concacaf", "afc", "caf", "ofc"] as const;
export type Confederation = (typeof CONFEDERATIONS)[number];

// FIFA's 2025 format (Wikipedia, "2025 FIFA Club World Cup"): 32 clubs, 12 from UEFA, 6 from CONMEBOL,
// 4 each from CONCACAF, the AFC and CAF, 1 from the OFC and 1 for the host, which the game gives to
// CONCACAF's, the 2025 host's; eight groups of four meeting once, the top two into single-match
// knockout rounds, no third place. guess: one round a week on the Libertadores' Tuesday from the week
// after its groups, the final on a Sunday as FIFA's was, and the same days on every calendar and format.
export const CLUB_WORLD_CUP_STAGES: { name: string; dates: IsoDate[] }[] = [
  { name: "groups", dates: ["2026-06-02", "2026-06-09", "2026-06-16"] },
  { name: "round-of-16", dates: ["2026-06-23"] },
  { name: "quarter-finals", dates: ["2026-06-30"] },
  { name: "semi-finals", dates: ["2026-07-07"] },
  { name: "final", dates: ["2026-07-12"] },
];

// FIFA plays it every four years, the 2025 edition's next in 2029.
const EDITIONS = { first: 2029, every: 4 };

/** Whether the season plays a Club World Cup: FIFA's editions from 2029, every four years. */
export const isClubWorldCupSeason = (season: number): boolean => season >= EDITIONS.first && (season - EDITIONS.first) % EDITIONS.every === 0;

export const CLUB_WORLD_CUP_PLACES: Record<Confederation, number> = { uefa: 12, conmebol: 6, concacaf: 5, afc: 4, caf: 4, ofc: 1 };

/** Clubs of one confederation a group may hold: two of Europe's twelve, one of anyone else's. */
const GROUP_CAP: Record<Confederation, number> = { uefa: 2, conmebol: 1, concacaf: 1, afc: 1, caf: 1, ofc: 1 };

const GROUP_COUNT = 8;
const STAGES = { groups: 0, roundOf16: 1 } as const;
// FIFA's 2025 round of 16 by group places, in bracket order: each pair of ties meets in a quarter-final.
const ROUND_OF_16: readonly (readonly [number, 1 | 2, number, 1 | 2])[] = [
  [0, 1, 1, 2], [2, 1, 3, 2], [4, 1, 5, 2], [6, 1, 7, 2],
  [1, 1, 0, 2], [3, 1, 2, 2], [5, 1, 4, 2], [7, 1, 6, 2],
];

// The 2025 prize money in USD (FIFA, "Record prize money and unprecedented solidarity", 26 Mar 2025):
// each club's participation by confederation, Europe's from 12.81 to 38.19 million by a ranking of
// sporting and commercial criteria; then per group win and draw, for reaching each knockout round, and
// the final's. guess: Europe's ranking is the field's seeding, the strongest paid most.
const PARTICIPATION_USD: Record<Exclude<Confederation, "uefa">, number> = { conmebol: 15_210_000, concacaf: 9_550_000, afc: 9_550_000, caf: 9_550_000, ofc: 3_580_000 };
const UEFA_PARTICIPATION_USD = { highest: 38_190_000, lowest: 12_810_000 };
const PERFORMANCE_USD = {
  "group-win": 2_000_000,
  "group-draw": 1_000_000,
  "round-of-16": 7_500_000,
  "quarter-final": 13_125_000,
  "semi-final": 21_000_000,
  "runner-up": 30_000_000,
  champion: 40_000_000,
};

/** The confederation of a country of the game: SOUTH_AMERICA's and Brazil CONMEBOL, MARKET_LEAGUES' and GUEST_COUNTRIES' by their continent, EUROPE's UEFA. */
export function confederationOf(country: string): Confederation {
  if (["ar", "bo", "br", "cl", "co", "ec", "pe", "py", "uy", "ve"].includes(country)) return "conmebol";
  if (["us", "mx"].includes(country)) return "concacaf";
  if (["sa", "ae", "jp", "kr"].includes(country)) return "afc";
  if (["eg", "ma", "tn", "za"].includes(country)) return "caf";
  if (country === "nz") return "ofc";
  return "uefa";
}

function drawn(competition: ContinentalCompetition, ids: readonly string[]): string[] {
  const order = new Map(competition.drawOrder.map((id, i) => [id, i]));
  return [...ids].sort((a, b) => (order.get(a) ?? -1) - (order.get(b) ?? -1));
}

/**
 * Eight groups from pots of eight in seeding order, as FIFA's draw: each club goes to the first group,
 * from a place that moves with the draw, that still lacks a club of its pot, has room for its
 * confederation and none of its country; when a club finds no such group, the clubs before it are
 * placed again, as FIFA's draw skips a group that would leave a later club nowhere to go. guess: FIFA's
 * pots also went by confederation; these go by seeding alone.
 */
function drawGroups(competition: ContinentalCompetition): string[][] {
  const groups: string[][] = Array.from({ length: GROUP_COUNT }, () => []);
  const countryOf = (id: string) => competition.countries[id] ?? id;
  const confederationIn = (id: string) => confederationOf(countryOf(id));
  const seeded = competition.entries[STAGES.groups] ?? [];
  const order = Array.from({ length: Math.ceil(seeded.length / GROUP_COUNT) }, (_, pot) => drawn(competition, seeded.slice(pot * GROUP_COUNT, (pot + 1) * GROUP_COUNT))).flat();
  const fits = (id: string, group: readonly string[]) => {
    const confederation = confederationIn(id);
    return group.filter((other) => confederationIn(other) === confederation).length < GROUP_CAP[confederation] && !group.some((other) => countryOf(other) === countryOf(id));
  };
  const place = (at: number): boolean => {
    const id = order[at];
    if (id === undefined) return true;
    const pot = Math.floor(at / GROUP_COUNT);
    for (let k = 0; k < GROUP_COUNT; k++) {
      const group = groups[(k + at) % GROUP_COUNT] ?? [];
      if (group.length !== pot || !fits(id, group)) continue;
      group.push(id);
      if (place(at + 1)) return true;
      group.pop();
    }
    return false;
  };
  if (!place(0)) {
    order.forEach((id, at) => groups[at % GROUP_COUNT]?.push(id));
  }
  return groups;
}

const stageFixturesOf = (competition: ContinentalCompetition, fixtures: readonly Fixture[], stage: number) =>
  fixtures.filter((f) => f.competitionId === competition.id && f.stage === stage);

/** The Club World Cup's next stage: the group draw, the round of 16 from the group tables, then the bracket's winners paired in order. */
export function clubWorldCupStage(competition: ContinentalCompetition, fixtures: readonly Fixture[]): StageShape {
  const index = competition.stages.length;
  if (index === STAGES.groups) return { kind: "groups", groups: drawGroups(competition), legs: 1 };
  if (index === STAGES.roundOf16) {
    const played = stageFixturesOf(competition, fixtures, STAGES.groups);
    const orders = groupStageAt(competition, STAGES.groups).groups.map((group, g) =>
      standings(group, played.filter((f) => f.group === g), competition.drawOrder).map((row) => row.clubId),
    );
    const at = (group: number, place: 1 | 2) => orders[group]?.[place - 1] ?? "";
    return { kind: "knockout", ties: ROUND_OF_16.map(([first, firstPlace, second, secondPlace]): [string, string] => [at(first, firstPlace), at(second, secondPlace)]) };
  }
  const winners = tieResults(knockoutStageAt(competition, index - 1), stageFixturesOf(competition, fixtures, index - 1)).map((tie) => tie.winnerId);
  return { kind: "knockout", ties: Array.from({ length: winners.length / 2 }, (_, i): [string, string] => [winners[2 * i] ?? "", winners[2 * i + 1] ?? ""]) };
}

/** What the Club World Cup pays the club in USD, by the stage names of CONMEBOL's prize tables: its participation as "group-stage", then the performance prizes. */
export function clubWorldCupPrizes(competition: ContinentalCompetition, clubId: string): Record<string, number> {
  const confederation = confederationOf(competition.countries[clubId] ?? "");
  let participation: number;
  if (confederation === "uefa") {
    const european = competition.clubIds.filter((id) => confederationOf(competition.countries[id] ?? "") === "uefa");
    const place = Math.max(0, european.indexOf(clubId));
    const share = european.length > 1 ? place / (european.length - 1) : 0;
    participation = Math.round(UEFA_PARTICIPATION_USD.highest - share * (UEFA_PARTICIPATION_USD.highest - UEFA_PARTICIPATION_USD.lowest));
  } else participation = PARTICIPATION_USD[confederation];
  return { "group-stage": participation, ...PERFORMANCE_USD };
}
