import type { PositionGroup } from "../../engine/match.js";
import { keyedStream } from "../../engine/random.js";
import { CARD_RATES } from "../discipline/cardRates.js";
import type { SimPlayer } from "../gameState.js";
import { FULL_TIME, type MatchEvent } from "./matchTimeline.js";

type Shot = { minute: number; isOnTarget: boolean };

/**
 * What a player would do over the whole match in his form of the day, besides the timeline's goals
 * and cards: his shots that don't go in, tackles and fouls at their minutes, and his passes. He does
 * whatever falls while he is on the pitch.
 */
type PlayerPlay = {
  clubId: string;
  group: PositionGroup;
  /** His form of the day, from −1 (an awful day) to 1 (an inspired one). */
  form: number;
  shots: Shot[];
  tackles: number[];
  fouls: number[];
  /** Passes he would make over 90 minutes, and how many of them go astray. */
  passes: number;
  misplaced: number;
};

/** A match beyond its timeline: who started, and the form and play of everyone who may take part. */
export type MatchPlay = { starters: string[]; players: Record<string, PlayerPlay> };

/** What a player has done in a match up to a minute. */
export type PlayerStats = {
  clubId: string;
  group: PositionGroup;
  form: number;
  minutes: number;
  goals: number;
  penaltyGoals: number;
  ownGoals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  /** Passes that found a team-mate, and those that went astray. */
  passes: number;
  misplacedPasses: number;
  tackles: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  penaltiesMissed: number;
  /** Of his missed penalties, the ones the keeper saved. */
  penaltiesKeptOut: number;
  /** For whoever is in goal: shots on target he kept out, penalties included. */
  saves: number;
  penaltiesSaved: number;
  /** Goals his side let in while he was on the pitch. */
  conceded: number;
};

// FotMob's per-player match stats (data/fotmob_cache, matchDetails with playerStats, read
// 2026-10-15): the 7 matches the cache holds at that depth, estaduais of February and March 2026
// (Atlético-MG, Botafogo and Inter among them; the cache has no Série A match at that depth),
// 203 players over 12,745 minutes, by usual position.
// Per 90 minutes: shots that did not go in, passes (with the share completed), tackles and fouls.
// GK 1,260 min: 379 passes (287 completed). DEF 4,833 min: 26 shots (1 goal), 2,481 passes (2,125),
// 87 tackles, 70 fouls. MID 4,145 min: 51 shots (6 goals), 1,649 passes (1,373), 80 tackles, 79
// fouls. ATT 2,507 min: 78 shots (10 goals), 611 passes (470), 25 tackles, 28 fouls.
const PER_90: Record<PositionGroup, { missedShots: number; passes: number; completed: number; tackles: number; fouls: number }> = {
  GK: { missedShots: 0, passes: (379 / 1260) * 90, completed: 287 / 379, tackles: 0, fouls: 0 },
  DEF: { missedShots: (25 / 4833) * 90, passes: (2481 / 4833) * 90, completed: 2125 / 2481, tackles: (87 / 4833) * 90, fouls: (70 / 4833) * 90 },
  MID: { missedShots: (45 / 4145) * 90, passes: (1649 / 4145) * 90, completed: 1373 / 1649, tackles: (80 / 4145) * 90, fouls: (79 / 4145) * 90 },
  ATT: { missedShots: (68 / 2507) * 90, passes: (611 / 2507) * 90, completed: 470 / 611, tackles: (25 / 2507) * 90, fouls: (28 / 2507) * 90 },
};
// Same matches, outfield: 44 of 155 shots on target, 17 of them goals, so 27 of the 138 that did not go in were saved.
const SAVED_SHARE = 27 / 138;
// Every card comes with a foul: the timeline books a player about this often per 90 minutes
// (Série A, cardRates), so his other fouls come at the rest of his position's rate.
const CARDS_PER_90 = (CARD_RATES.A.home.yellows + CARD_RATES.A.home.reds + CARD_RATES.A.away.yellows + CARD_RATES.A.away.reds) / 2 / 11;

// guess: how much form moves what a player does. An awful day (−1) halves his share of shots on
// target, puts 60% more of his passes astray, adds 40% to his fouls and takes a quarter off his
// tackles; an inspired day does the opposite.
const FORM_ON_TARGET = 0.5;
const FORM_MISPLACED = 0.6;
const FORM_FOULS = 0.4;
const FORM_TACKLES = 0.25;

// guess: the assistant calls a day bad from this form down (about 13% of players), once he
// has watched the player for twenty minutes.
const BAD_DAY_FORM = -0.5;
const BAD_DAY_NOTICED_AFTER = 20;

const PLAY_STREAM_SALT = 0x91a7;
// Above this mean a count is drawn from the normal approximation, saving dozens of draws per player.
const SMALL_MEAN = 12;

function count(mean: number, random: () => number): number {
  if (mean > SMALL_MEAN) {
    const normal = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * normal));
  }
  let roll = random();
  let p = Math.exp(-mean);
  let n = 0;
  while (roll > p) {
    roll -= p;
    n++;
    p *= mean / n;
  }
  return n;
}

const minuteOf = (random: () => number) => 1 + Math.floor(random() * FULL_TIME);
const minutesOf = (mean: number, random: () => number) => Array.from({ length: count(mean, random) }, () => minuteOf(random)).sort((a, b) => a - b);

/** One player's play over the whole match, drawn from a stream of his own. */
function playOf(player: SimPlayer, form: number, random: () => number): PlayerPlay {
  const rates = PER_90[player.group];
  const onTarget = SAVED_SHARE * (1 + FORM_ON_TARGET * form);
  const shots = minutesOf(rates.missedShots, random).map((minute) => ({ minute, isOnTarget: random() < onTarget }));
  const tackles = minutesOf(rates.tackles * (1 + FORM_TACKLES * form), random);
  const fouls = minutesOf(Math.max(0, rates.fouls - CARDS_PER_90) * (1 - FORM_FOULS * form), random);
  const passes = count(rates.passes, random);
  const astray = Math.min(1, (1 - rates.completed) * (1 - FORM_MISPLACED * form));
  const misplaced = Math.min(passes, count(passes * astray, random));
  return { clubId: player.clubId, group: player.group, form, shots, tackles, fouls, passes, misplaced };
}

/**
 * The play of a match drawn at kick-off for the starters and everyone who may come on, each from a
 * stream seeded by the save's seed, the fixture and the player: a change during the match never
 * changes what came before it, and a substitute brings his own form.
 */
export function drawMatchPlay(seed: number, fixtureId: string, starters: readonly SimPlayer[], others: readonly SimPlayer[], formOf: (player: SimPlayer) => number): MatchPlay {
  const players: Record<string, PlayerPlay> = {};
  for (const player of [...starters, ...others]) {
    players[player.id] ??= playOf(player, formOf(player), keyedStream(seed ^ PLAY_STREAM_SALT, `${fixtureId}/${player.id}`));
  }
  return { starters: starters.map((p) => p.id), players };
}

/** When each player of the match was on the pitch: after `from`, up to and including `to`. */
function spellsOf(play: MatchPlay, events: readonly MatchEvent[]): Map<string, { from: number; to: number }> {
  const spells = new Map(play.starters.map((id) => [id, { from: 0, to: FULL_TIME }]));
  const end = (playerId: string, minute: number) => {
    const spell = spells.get(playerId);
    if (spell) spell.to = Math.min(spell.to, minute);
  };
  for (const e of events) {
    if (e.type === "substitution") {
      end(e.offId, e.minute);
      spells.set(e.playerId, { from: e.minute, to: FULL_TIME });
    }
    if ((e.type === "card" && e.card !== "yellow") || e.type === "injury") end(e.playerId, e.minute);
  }
  return spells;
}

/** A shot that doesn't go in: who took it, for which club, at what minute, and whether it was on target. */
export type MissedShot = Shot & { playerId: string; clubId: string };

/** Every shot of the match that doesn't go in, taken while its player was on the pitch, in minute order. */
export function missedShotsOf(play: MatchPlay, events: readonly MatchEvent[]): MissedShot[] {
  const spells = spellsOf(play, events);
  return [...spells]
    .flatMap(([playerId, spell]) => {
      const own = play.players[playerId];
      return (own?.shots ?? []).filter((s) => spell.from < s.minute && s.minute <= spell.to).map((s) => ({ ...s, playerId, clubId: own?.clubId ?? "" }));
    })
    .sort((a, b) => a.minute - b.minute);
}

const emptyStats = (own: PlayerPlay): PlayerStats => ({
  clubId: own.clubId,
  group: own.group,
  form: own.form,
  minutes: 0,
  goals: 0,
  penaltyGoals: 0,
  ownGoals: 0,
  assists: 0,
  shots: 0,
  shotsOnTarget: 0,
  passes: 0,
  misplacedPasses: 0,
  tackles: 0,
  fouls: 0,
  yellowCards: 0,
  redCards: 0,
  penaltiesMissed: 0,
  penaltiesKeptOut: 0,
  saves: 0,
  penaltiesSaved: 0,
  conceded: 0,
});

/**
 * What every player who has been on the pitch did up to `minute`: the timeline's goals, assists,
 * cards and penalties, and the shots, passes, tackles and fouls of his play that fell while he was
 * on. A goal is a shot on target, a missed penalty a shot (on target when saved), a card a foul;
 * whoever is in goal saves the other side's shots on target that don't go in.
 */
export function playerStatsAt(play: MatchPlay, events: readonly MatchEvent[], minute: number): Record<string, PlayerStats> {
  const happened = events.filter((e) => e.minute <= minute);
  const spells = spellsOf(play, happened);
  const stats: Record<string, PlayerStats> = {};
  const isOn = (playerId: string, at: number) => {
    const spell = spells.get(playerId);
    return !!spell && spell.from < at && at <= spell.to;
  };
  for (const [playerId, spell] of spells) {
    const own = play.players[playerId];
    if (!own || spell.from >= minute) continue;
    const to = Math.min(spell.to, minute);
    const share = (to - spell.from) / FULL_TIME;
    const during = (at: number) => spell.from < at && at <= to;
    const shots = own.shots.filter((s) => during(s.minute));
    const completed = Math.round((own.passes - own.misplaced) * share);
    stats[playerId] = {
      ...emptyStats(own),
      minutes: to - spell.from,
      shots: shots.length,
      shotsOnTarget: shots.filter((s) => s.isOnTarget).length,
      passes: completed,
      misplacedPasses: Math.round(own.misplaced * share),
      tackles: own.tackles.filter(during).length,
      fouls: own.fouls.filter(during).length,
    };
  }
  const keeperOf = (clubId: string, at: number) =>
    Object.keys(stats).find((id) => stats[id]?.clubId === clubId && stats[id]?.group === "GK" && isOn(id, at));
  const opponentOf = (clubId: string) => Object.values(play.players).find((p) => p.clubId !== clubId)?.clubId ?? "";
  for (const [playerId, own] of Object.entries(play.players)) {
    if (!stats[playerId]) continue;
    for (const shot of own.shots) {
      if (!shot.isOnTarget || !isOn(playerId, shot.minute) || shot.minute > minute) continue;
      const keeper = stats[keeperOf(opponentOf(own.clubId), shot.minute) ?? ""];
      if (keeper) keeper.saves++;
    }
  }
  for (const e of happened) {
    if (e.type === "goal") {
      const scorer = stats[e.playerId];
      if (scorer && e.kind === "ownGoal") scorer.ownGoals++;
      else if (scorer) {
        scorer.goals++;
        if (e.kind === "penalty") scorer.penaltyGoals++;
        scorer.shots++;
        scorer.shotsOnTarget++;
      }
      const assist = e.assistId ? stats[e.assistId] : undefined;
      if (assist) assist.assists++;
      for (const [id, s] of Object.entries(stats)) if (s.clubId !== e.clubId && isOn(id, e.minute)) s.conceded++;
    }
    if (e.type === "penaltyMiss") {
      const taker = stats[e.playerId];
      if (taker) {
        taker.penaltiesMissed++;
        taker.shots++;
        if (e.isSaved) {
          taker.shotsOnTarget++;
          taker.penaltiesKeptOut++;
        }
      }
      const keeper = stats[e.keeperId];
      if (keeper && e.isSaved) {
        keeper.saves++;
        keeper.penaltiesSaved++;
      }
    }
    if (e.type === "card") {
      const booked = stats[e.playerId];
      if (!booked) continue;
      booked.fouls++;
      if (e.card === "yellow") booked.yellowCards++;
      else booked.redCards++;
    }
  }
  return stats;
}

/** The players the assistant points out as having a bad day, at the minute he notices: twenty minutes into their time on the pitch, if they are still on. */
export function badDaysOf(play: MatchPlay, events: readonly MatchEvent[]): { playerId: string; clubId: string; minute: number }[] {
  return [...spellsOf(play, events)].flatMap(([playerId, spell]) => {
    const own = play.players[playerId];
    const minute = spell.from + BAD_DAY_NOTICED_AFTER;
    return own && own.form <= BAD_DAY_FORM && minute <= spell.to ? [{ playerId, clubId: own.clubId, minute }] : [];
  });
}
