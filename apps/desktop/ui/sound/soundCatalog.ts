import boo from "../../../../assets/sounds/boo.mp3";
import chant from "../../../../assets/sounds/chant.mp3";
import crowdBed from "../../../../assets/sounds/crowd-bed.mp3";
import goalDistant from "../../../../assets/sounds/goal-distant.mp3";
import goalRoar from "../../../../assets/sounds/goal-roar.mp3";
import hubTheme from "../../../../assets/sounds/hub-theme.mp3";
import menuTheme from "../../../../assets/sounds/menu-theme.mp3";
import oehh from "../../../../assets/sounds/oehh.mp3";
import whistleLong from "../../../../assets/sounds/whistle-long.mp3";
import whistleShort from "../../../../assets/sounds/whistle-short.mp3";

/** Every moment the game makes a sound for, apart from the music and the crowd under the live round. */
export type Cue =
  | "kickOff"
  | "halfTime"
  | "fullTime"
  | "coachGoal"
  | "coachGoalAway"
  | "goalStinger"
  | "comeback"
  | "comebackAway"
  | "conceded"
  | "concededAway"
  | "otherGoal"
  | "penalty"
  | "groan"
  | "relief"
  | "varCheck"
  | "varDecision"
  | "card"
  | "redCard"
  | "injury"
  | "substitution"
  | "click"
  | "confirm"
  | "title"
  | "promotion"
  | "relegation"
  | "sacked";

export type MusicTrack = "menu" | "hub";
/** Where a cue plays: the music's bus, the match effects', the crowd's or the interface's, each under its own volume. */
export type Bus = "music" | "sfx" | "crowd" | "ui";

export const SAMPLES = { boo, chant, goalDistant, goalRoar, oehh, whistleLong, whistleShort } as const;
export type Sample = keyof typeof SAMPLES;

export const MUSIC: Record<MusicTrack, string> = { menu: menuTheme, hub: hubTheme };
export const CROWD_BED = crowdBed;

/** A recorded sound in a cue, `at` seconds after it starts; `length` cuts it short with a fade. */
type Layer = { sample: Sample; at: number; gain: number; length?: number };
/**
 * A synthesised note: a MIDI note number (fractions detune it), when it starts and how long it rings, in
 * seconds; `to` is the note it bends down or up to over its length, `cutoff` how bright a buzzy wave sounds.
 */
export type Tone = { note: number; at: number; length: number; wave: "sine" | "triangle" | "square" | "sawtooth"; gain: number; to?: number; cutoff?: number };

export type CueSound = {
  bus: Bus;
  /** Which cue wins when a fast clock has room for fewer sounds than a minute brings. */
  priority: number;
  /** Goals push the music and the crowd down while they play. */
  ducks: boolean;
  layers: readonly Layer[];
  tones: readonly Tone[];
};

const layer = (sample: Sample, at = 0, gain = 1, length?: number): Layer => ({ sample, at, gain, ...(length === undefined ? {} : { length }) });
const chord = (notes: readonly number[], at: number, length: number, wave: Tone["wave"] = "triangle", gain = 0.12): Tone[] =>
  notes.map((note) => ({ note, at, length, wave, gain }));

function sfx(priority: number, layers: Layer[], ducks = false, tones: Tone[] = []): CueSound {
  return { bus: "sfx", priority, ducks, layers, tones };
}

/** What the crowd does: its roars, boos and groans follow the Torcida volume with the crowd under the round. */
function crowd(priority: number, layers: Layer[], ducks = false): CueSound {
  return { bus: "crowd", priority, ducks, layers, tones: [] };
}

/** A drum hit: a low sine that drops in pitch as it dies, like a surdo. */
const thud = (at: number, note = 43, gain = 0.28): Tone => ({ note, to: note - 12, at, length: 0.32, wave: "sine", gain });

/**
 * The goal stinger: a short brass pickup over a surdo, then the full chord a fourth higher on a second, deeper
 * beat. Each brass note is doubled a few cents sharp, so the pair beats like a section instead of one buzz.
 */
const brass = (notes: readonly number[], at: number, length: number, gain: number): Tone[] =>
  notes.flatMap((note) => [
    { note, at, length, wave: "sawtooth" as const, gain, cutoff: 2600 },
    { note: note + 0.12, at, length, wave: "sawtooth" as const, gain: gain * 0.7, cutoff: 2600 },
  ]);
const GOAL_STINGER: Tone[] = [...brass([67, 72], 0, 0.09, 0.05), thud(0, 47, 0.18), ...brass([72, 76, 79, 84], 0.16, 1.1, 0.045), thud(0.16)];

/** VAR under review: three quick monitor pips over a low drone that rises a semitone, unresolved. */
const VAR_STING: Tone[] = [
  ...[0, 0.16, 0.32].map((at): Tone => ({ note: 88, at, length: 0.05, wave: "square", gain: 0.04, cutoff: 3200 })),
  { note: 45, to: 46, at: 0, length: 1.4, wave: "sine", gain: 0.14 },
];

function synth(bus: Bus, tones: Tone[]): CueSound {
  return { bus, priority: 0, ducks: false, layers: [], tones };
}

export const CUES: Record<Cue, CueSound> = {
  // The coach's goals rank above the goals against, so a minute with both at 4x is heard as his.
  comeback: crowd(10, [layer("goalRoar"), layer("chant", 1.5, 0.9)], true),
  // Away, the roar and the song come from the visitors' end: fewer voices, and the home crowd's groan under them.
  comebackAway: crowd(10, [layer("goalRoar", 0, 0.5), layer("oehh", 0.2, 0.35), layer("chant", 1.5, 0.45)], true),
  coachGoal: crowd(9, [layer("goalRoar")], true),
  coachGoalAway: crowd(9, [layer("goalRoar", 0, 0.5), layer("oehh", 0.2, 0.35)], true),
  goalStinger: sfx(9, [], false, GOAL_STINGER),
  conceded: crowd(8, [layer("boo", 0, 0.85), layer("oehh", 0.5, 0.5)], true),
  // Away, the home crowd erupts around the coach, and his own fans boo from their corner.
  concededAway: crowd(8, [layer("goalDistant", 0, 0.9), layer("boo", 0.8, 0.4)], true),
  varCheck: sfx(7, [], false, VAR_STING),
  varDecision: sfx(7, [layer("whistleShort")], false, [thud(0, 38, 0.22)]),
  fullTime: sfx(7, [layer("whistleShort"), layer("whistleShort", 0.45), layer("whistleLong", 0.9)]),
  halfTime: sfx(6, [layer("whistleShort"), layer("whistleLong", 0.45)]),
  kickOff: sfx(6, [layer("whistleShort")]),
  redCard: sfx(6, [layer("whistleShort"), layer("oehh", 0.3, 0.8)]),
  injury: crowd(5, [layer("oehh")]),
  penalty: sfx(5, [layer("whistleShort"), layer("whistleShort", 0.2, 0.7)]),
  groan: crowd(5, [layer("oehh")]),
  // A penalty missed against the coach, or a call against him taken back: a short roar of relief.
  relief: crowd(5, [layer("goalDistant", 0, 0.8, 2.5)]),
  card: sfx(4, [layer("whistleShort", 0, 0.8)]),
  // The fourth official's two quick pips as the board goes up.
  substitution: sfx(3, [layer("whistleShort", 0, 0.5), layer("whistleShort", 0.16, 0.4)]),
  otherGoal: crowd(2, [layer("goalDistant", 0, 0.45)]),
  click: synth("ui", [{ note: 98, at: 0, length: 0.03, wave: "sine", gain: 0.08 }]),
  confirm: synth("ui", [
    { note: 81, at: 0, length: 0.07, wave: "sine", gain: 0.1 },
    { note: 88, at: 0.07, length: 0.12, wave: "sine", gain: 0.1 },
  ]),
  title: synth("music", [...chord([60, 64, 67], 0, 0.18), ...chord([64, 67, 72], 0.2, 0.18), ...chord([67, 72, 76], 0.4, 1.6), ...chord([48], 0.4, 1.6, "sawtooth", 0.05)]),
  promotion: synth("music", [...chord([60], 0, 0.14), ...chord([64], 0.12, 0.14), ...chord([67], 0.24, 0.14), ...chord([72, 76], 0.36, 1.1), ...chord([48], 0.36, 1.1, "sawtooth", 0.04)]),
  relegation: synth("music", [...chord([67], 0, 0.3), ...chord([63], 0.28, 0.3), ...chord([60], 0.56, 0.3), ...chord([55, 51], 0.84, 1.4, "sine", 0.14)]),
  sacked: synth("music", [...chord([36], 0, 0.6, "sine", 0.3), ...chord([43, 44], 0.05, 1.6, "sawtooth", 0.035), ...chord([31], 0.05, 1.6, "triangle", 0.12)]),
};
