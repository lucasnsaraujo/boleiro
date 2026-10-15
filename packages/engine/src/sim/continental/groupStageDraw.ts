import { roundRobin, type Pairing } from "../roundRobin.js";
import { shuffle } from "../shuffle.js";

const GROUP_SIZE = 4;

/**
 * Groups of four drawn from pots in seeding order, one club of each pot per group and, where the draw
 * allows it, no two of a country together; then each group's round robin. Returns the matches day by
 * day, every group's games of a day together. guess: UEFA's real draws also keep apart clubs from
 * countries it pairs for political reasons, which the game does not.
 */
export function drawGroupMatches(seeded: readonly string[], countryOf: (id: string) => string, legs: 1 | 2, random: () => number): Pairing[][] {
  const groupCount = seeded.length / GROUP_SIZE;
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  for (let pot = 0; pot < GROUP_SIZE; pot++) {
    for (const id of shuffle(seeded.slice(pot * groupCount, (pot + 1) * groupCount), random)) {
      const open = groups.filter((group) => group.length === pot);
      const target = open.find((group) => !group.some((other) => countryOf(other) === countryOf(id))) ?? open[0];
      target?.push(id);
    }
  }
  const schedules = groups.map((group) => roundRobin(group, legs));
  return (schedules[0] ?? []).map((_, day) => schedules.flatMap((rounds) => rounds[day] ?? []));
}
