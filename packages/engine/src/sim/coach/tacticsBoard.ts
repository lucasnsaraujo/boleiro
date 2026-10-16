import type { Lane, Role } from "@boleiro/data/players";
import { FORMATION_NAMES, type Formation } from "../../engine/formations.js";
import { laneDuels, matchOdds, playEdges, type Marking, type Play, type Posture, type PositionGroup, type Team } from "../../engine/match.js";
import { engineTeam } from "../players/matchSetup.js";
import type { Tactics } from "./tactics.js";

/** A player on the board: today's strength, and whether one more yellow bans him from the next match. */
export type BoardPlayer = { id: string; name: string; group: PositionGroup; positions?: readonly Role[]; strength: number; isOneYellowFromBan?: boolean };
export type BoardSide = { name: string; eleven: readonly BoardPlayer[]; tactics: Tactics };
/** Where the coach's match stands for his side: at home or away, the minute, and his lead (negative when behind). */
export type MatchMoment = { isHome: boolean; minute: number; lead: number };

export type Sectors = Record<Exclude<PositionGroup, "GK">, number>;
/** One lane as the coach's side attacks down it: its attack there, the defence it meets, and the best player of each. */
export type LaneView = { lane: Lane; attack: number; defense: number; attacker: string | null; defender: string | null };
export type MarkingReason = { kind: "booked"; names: string[] } | { kind: "outgunned"; attack: number; defense: number } | { kind: "usual" };

/** What the assistant would set, dial by dial, and why. */
export type AssistantPlan = {
  formation: { value: Formation; sectors: Sectors };
  /** `points`: the points the plan expects; `currentPoints`: the same plan with the coach's posture. */
  posture: { value: Posture; points: number; currentPoints: number };
  marking: { value: Marking; reason: MarkingReason };
  play: { value: Play; duel: LaneView | null };
};

export type TacticsBoard = {
  sectors: { own: Sectors; opponent: Sectors };
  lanes: LaneView[];
  /** How many points the coach's attack beats the defence it meets each way. */
  edges: Record<Play, number>;
  /** How the coach's posture scales his side's chances and the opponent's, against playing balanced. */
  postureChances: { own: number; theirs: number };
  /** The formations worth offering: the coach's, the assistant's and the next best for this eleven, in the game's order. */
  formations: Formation[];
  assistant: AssistantPlan;
  /** How many of the four dials the assistant would change. */
  changes: number;
};

export type Dial = "formation" | "posture" | "marking" | "play";

const POSTURES: readonly Posture[] = ["balanced", "counter", "defensive", "attacking"];
const FORMATIONS_SHOWN = 5;
const MATCH_MINUTES = 90;
const MAX_GOALS = 10;
// guess: two starters a yellow from a ban are worth calming down for; one is the usual risk.
const BOOKED_FOR_LIGHT = 2;
// guess: their attack this many points over the coach's defence calls for marking very heavy.
const OUTGUNNED_BY = 4;

const teamOf = (side: BoardSide, tactics: Tactics): Team => engineTeam(side.name, side.eleven, (p) => p.strength, tactics);

function sectorsOf(team: Team): Sectors {
  const sums = { DEF: [0, 0], MID: [0, 0], ATT: [0, 0] } satisfies Record<keyof Sectors, number[]>;
  for (const player of team.players) {
    const slot = player.slot ?? player.group;
    if (slot === "GK") continue;
    const sum = sums[slot];
    sum[0] = (sum[0] ?? 0) + player.strength * (player.fit ?? 1);
    sum[1] = (sum[1] ?? 0) + 1;
  }
  const mean = ([total = 0, count = 0]: number[]) => (count ? total / count : 0);
  return { DEF: mean(sums.DEF), MID: mean(sums.MID), ATT: mean(sums.ATT) };
}

function poisson(lambda: number, goals: number): number {
  let p = Math.exp(-lambda);
  for (let k = 1; k <= goals; k++) p *= lambda / k;
  return p;
}

/** The expected goals of each side, the coach's first. */
function expectedGoals(own: Team, opponent: Team, moment: MatchMoment): { own: number; theirs: number } {
  const odds = moment.isHome ? matchOdds(own, opponent) : matchOdds(opponent, own);
  return moment.isHome ? { own: odds.expectedHomeGoals, theirs: odds.expectedAwayGoals } : { own: odds.expectedAwayGoals, theirs: odds.expectedHomeGoals };
}

/** The points the coach's side expects from here: the goals left in the match, on top of his lead. */
function expectedPoints(own: Team, opponent: Team, moment: MatchMoment): number {
  const share = Math.max(0, MATCH_MINUTES - moment.minute) / MATCH_MINUTES;
  const goals = expectedGoals(own, opponent, moment);
  let points = 0;
  for (let scored = 0; scored <= MAX_GOALS; scored++) {
    for (let conceded = 0; conceded <= MAX_GOALS; conceded++) {
      const lead = moment.lead + scored - conceded;
      points += poisson(goals.own * share, scored) * poisson(goals.theirs * share, conceded) * (lead > 0 ? 3 : lead === 0 ? 1 : 0);
    }
  }
  return points;
}

const laneView = (duel: { lane: Lane; attack: number; defense: number; attacker: { name: string } | null; defender: { name: string } | null }): LaneView => ({
  lane: duel.lane,
  attack: duel.attack,
  defense: duel.defense,
  attacker: duel.attacker?.name ?? null,
  defender: duel.defender?.name ?? null,
});

/** The best of `options` by `worth`; the first of them on a tie. */
function best<T>(options: readonly T[], worth: (option: T) => number): T {
  let top = options[0] as T;
  let topWorth = -Infinity;
  for (const option of options) {
    const value = worth(option);
    if (value > topWorth + 1e-9) {
      top = option;
      topWorth = value;
    }
  }
  return top;
}

/**
 * Both sides' sectors, the lanes the coach's side attacks down, what his posture does to the chances,
 * and the assistant's plan for the four dials. The plan rests on the eleven, the opponent and the
 * moment only, never on the coach's own dials, so following it in everything leaves nothing to change.
 */
export function tacticsBoard(own: BoardSide, opponent: BoardSide, moment: MatchMoment): TacticsBoard {
  const them = teamOf(opponent, opponent.tactics);
  const current = teamOf(own, own.tactics);
  const duels = laneDuels(current, them) ?? [];
  const lanes = duels.map(laneView);
  const balanced = expectedGoals(teamOf(own, { ...own.tactics, posture: "balanced" }), them, moment);
  const chosen = expectedGoals(current, them, moment);

  const neutral: Tactics = { ...own.tactics, posture: "balanced" };
  delete neutral.marking;
  delete neutral.play;
  const pointsWith = (tactics: Tactics) => expectedPoints(teamOf(own, tactics), them, moment);
  const ranked = [...FORMATION_NAMES].sort((a, b) => pointsWith({ ...neutral, formation: b }) - pointsWith({ ...neutral, formation: a }));
  const formation = ranked[0] ?? own.tactics.formation;
  const planned = teamOf(own, { ...neutral, formation });

  const plannedDuels = laneDuels(planned, them);
  const plannedEdges = plannedDuels ? playEdges(plannedDuels) : { middle: 0, flanks: 0 };
  const play: Play = plannedEdges.flanks > plannedEdges.middle + 1e-9 ? "flanks" : "middle";
  const wide = plannedDuels?.filter((d) => d.lane !== "centre").sort((a, b) => b.attack - b.defense - (a.attack - a.defense))[0];
  const playDuel = play === "flanks" ? wide : plannedDuels?.find((d) => d.lane === "centre");

  const booked = own.eleven.filter((p) => p.isOneYellowFromBan).map((p) => p.name);
  const plannedSectors = sectorsOf(planned);
  const opponentSectors = sectorsOf(them);
  const marking: AssistantPlan["marking"] =
    booked.length >= BOOKED_FOR_LIGHT
      ? { value: "light", reason: { kind: "booked", names: booked } }
      : opponentSectors.ATT - plannedSectors.DEF >= OUTGUNNED_BY && booked.length === 0
        ? { value: "veryHeavy", reason: { kind: "outgunned", attack: opponentSectors.ATT, defense: plannedSectors.DEF } }
        : { value: "heavy", reason: { kind: "usual" } };

  const plan = (posture: Posture): Tactics => ({ ...neutral, formation, posture, marking: marking.value, play });
  const posture = best(POSTURES, (p) => pointsWith(plan(p)));
  const assistant: AssistantPlan = {
    formation: { value: formation, sectors: plannedSectors },
    posture: { value: posture, points: pointsWith(plan(posture)), currentPoints: pointsWith(plan(own.tactics.posture)) },
    marking,
    play: { value: play, duel: playDuel ? laneView(playDuel) : null },
  };

  const shown = new Set([own.tactics.formation, formation]);
  for (const f of ranked) if (shown.size < FORMATIONS_SHOWN) shown.add(f);
  const formations = FORMATION_NAMES.filter((f) => shown.has(f));
  const isSame: Record<Dial, boolean> = {
    formation: own.tactics.formation === formation,
    posture: own.tactics.posture === posture,
    marking: (own.tactics.marking ?? "heavy") === marking.value,
    play: own.tactics.play === play,
  };
  return {
    sectors: { own: sectorsOf(current), opponent: opponentSectors },
    lanes,
    edges: duels.length ? playEdges(duels) : { middle: 0, flanks: 0 },
    postureChances: { own: chosen.own / balanced.own, theirs: chosen.theirs / balanced.theirs },
    formations,
    assistant,
    changes: Object.values(isSame).filter((same) => !same).length,
  };
}

/** The coach's tactics with the assistant's choice for one dial, or for all four; the penalty taker and kicker order stay. */
export function followAssistant(tactics: Tactics, board: TacticsBoard, dial?: Dial): Tactics {
  const { assistant } = board;
  const choice: Pick<Tactics, Dial> = { formation: assistant.formation.value, posture: assistant.posture.value, marking: assistant.marking.value, play: assistant.play.value };
  return dial ? { ...tactics, [dial]: choice[dial] } : { ...tactics, ...choice };
}
