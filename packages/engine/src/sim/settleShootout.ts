import { randomStream } from "../engine/random.js";
import type { Competition, Fixture, GameState, SimPlayer } from "./gameState.js";
import { keeperOf } from "./live/goalDetails.js";
import { aggregate } from "./tieResults.js";

// Every shootout kick taken at the European Championships up to Euro 2024: 178 of 232 scored
// (Associated Press, "Euro 2024: Penalty shootouts set to take center stage", 2024-06-28).
const SHOOTOUT_CONVERSION = 178 / 232;
// guess: as in a match, each strength point the taker has over the keeper adds 0.6 of a point, between 50% and 90%.
const CONVERSION_PER_POINT = 0.006;
const MIN_CONVERSION = 0.5;
const MAX_CONVERSION = 0.9;
const KICKS_EACH = 5;
// guess: a squad whose morale sits below this ignores its coach's kicker order and lines up by who wants to take one.
export const LOW_MORALE = 35;

export type ShootoutKick = { type: "shootoutKick"; minute: 90; clubId: string; playerId: string; isScored: boolean };
/** The coach's squad ignored his kicker order. */
export type OrderOverruled = { type: "orderOverruled"; minute: 90; clubId: string };

/** A side going into a shootout: the players who ended the match on the pitch, and the coach's order when it is his side. */
export type ShootoutSide = {
  clubId: string;
  onPitch: readonly SimPlayer[];
  /** The coach's kicker order; missing for AI sides. */
  order?: readonly string[];
  /** The squad's morale, 0 to 100. */
  morale: number;
};

function isDecidingLeg(fixture: Fixture, competitions: Record<string, Competition>): boolean {
  const stage = competitions[fixture.competitionId]?.stages[fixture.stage];
  return fixture.tie !== undefined && stage?.kind === "knockout" && stage.dates.at(-1) === fixture.date;
}

/** Whether a just-played fixture goes to penalties: a knockout tie's last leg with the aggregate level. */
export function isShootoutDue(state: Pick<GameState, "fixtures" | "competitions">, played: Fixture): boolean {
  if (!played.result || !isDecidingLeg(played, state.competitions)) return false;
  const legs = [...state.fixtures.filter((f) => f.competitionId === played.competitionId && f.stage === played.stage && f.tie === played.tie && f.id !== played.id), played];
  return aggregate(played.homeId, legs) === aggregate(played.awayId, legs);
}

/** The order a side kicks in: the coach's when the squad follows it, then everyone else strongest first, the keeper last. */
function kickerOrder(side: ShootoutSide, strength: (p: SimPlayer) => number): { kickers: SimPlayer[]; isOverruled: boolean } {
  const byStrength = [...side.onPitch].sort((a, b) => (a.group === "GK" ? 1 : 0) - (b.group === "GK" ? 1 : 0) || strength(b) - strength(a));
  if (!side.order?.length) return { kickers: byStrength, isOverruled: false };
  if (side.morale < LOW_MORALE) return { kickers: byStrength, isOverruled: true };
  const chosen = side.order.flatMap((id) => side.onPitch.filter((p) => p.id === id));
  return { kickers: [...chosen, ...byStrength.filter((p) => !chosen.includes(p))], isOverruled: false };
}

/**
 * A shootout kick by kick: five each, then sudden death, each kick scored by how the taker
 * compares with the keeper. Stops as soon as one side can't be caught.
 */
export function playShootout(home: ShootoutSide, away: ShootoutSide, strength: (p: SimPlayer) => number, random: () => number): { events: (ShootoutKick | OrderOverruled)[]; winnerId: string } {
  const sides = [home, away].map((side, i) => {
    const { kickers, isOverruled } = kickerOrder(side, strength);
    const other = i === 0 ? away : home;
    return { side, kickers, isOverruled, keeper: keeperOf(other.onPitch), scored: 0 };
  });
  const events: (ShootoutKick | OrderOverruled)[] = sides.flatMap(({ side, isOverruled }) => (isOverruled ? [{ type: "orderOverruled", minute: 90, clubId: side.clubId } as const] : []));
  const [h, a] = sides;
  if (!h || !a) throw new Error("a shootout needs two sides");
  if (!h.kickers.length || !a.kickers.length) return { events, winnerId: h.kickers.length ? h.side.clubId : a.side.clubId };
  for (let round = 0; ; round++) {
    for (const [i, kicking] of [h, a].entries()) {
      const taker = kicking.kickers[round % Math.max(1, kicking.kickers.length)];
      if (!taker) continue;
      const gap = kicking.keeper ? strength(taker) - strength(kicking.keeper) : 0;
      const conversion = Math.min(MAX_CONVERSION, Math.max(MIN_CONVERSION, SHOOTOUT_CONVERSION + CONVERSION_PER_POINT * gap));
      const isScored = random() < conversion;
      if (isScored) kicking.scored++;
      events.push({ type: "shootoutKick", minute: 90, clubId: kicking.side.clubId, playerId: taker.id, isScored });
      if (round < KICKS_EACH) {
        const left = (side: number) => KICKS_EACH - round - (side <= i ? 1 : 0);
        if (h.scored > a.scored + left(1) || a.scored > h.scored + left(0)) return { events, winnerId: h.scored > a.scored ? h.side.clubId : a.side.clubId };
      }
    }
    if (round >= KICKS_EACH - 1 && h.scored !== a.scored) return { events, winnerId: h.scored > a.scored ? h.side.clubId : a.side.clubId };
  }
}

/** A just-played fixture with its shootout, when it is due, played from `seed` on its own stream. */
export function settleShootout(played: Fixture, seed: number, home: ShootoutSide, away: ShootoutSide, strength: (p: SimPlayer) => number): { fixture: Fixture; events: (ShootoutKick | OrderOverruled)[] } {
  if (!played.result) return { fixture: played, events: [] };
  const { events, winnerId } = playShootout(home, away, strength, randomStream(seed).next);
  return { fixture: { ...played, result: { ...played.result, penaltyWinnerId: winnerId } }, events };
}

/** The club that won a match's shootout, from its kicks; undefined when there was none. */
export function shootoutWinnerOf(events: readonly { type: string }[], homeId: string, awayId: string): string | undefined {
  const kicks = events.filter((e): e is ShootoutKick => e.type === "shootoutKick");
  if (!kicks.length) return undefined;
  const scored = (clubId: string) => kicks.filter((k) => k.clubId === clubId && k.isScored).length;
  return scored(homeId) > scored(awayId) ? homeId : awayId;
}

/** One draw of the day's stream that seeds a shootout's own stream, so its kicks leave the day's other draws as they were. */
export function shootoutSeed(random: () => number): number {
  return Math.floor(random() * 2 ** 32);
}
