import boo from "../../assets/sounds/boo.mp3";
import chant from "../../assets/sounds/chant.mp3";
import crowdBed from "../../assets/sounds/crowd-bed.mp3";
import goalDistant from "../../assets/sounds/goal-distant.mp3";
import goalRoar from "../../assets/sounds/goal-roar.mp3";
import hubTheme from "../../assets/sounds/hub-theme.mp3";
import menuTheme from "../../assets/sounds/menu-theme.mp3";
import oehh from "../../assets/sounds/oehh.mp3";
import whistleLong from "../../assets/sounds/whistle-long.mp3";
import whistleShort from "../../assets/sounds/whistle-short.mp3";

/** Every moment the game makes a sound for, apart from the music and the crowd under the live round. */
export type Cue =
  | "kickOff"
  | "halfTime"
  | "fullTime"
  | "coachGoal"
  | "comeback"
  | "conceded"
  | "otherGoal"
  | "card"
  | "redCard"
  | "injury"
  | "click"
  | "confirm"
  | "title"
  | "promotion"
  | "relegation"
  | "sacked";

export type MusicTrack = "menu" | "hub";
export type Bus = "music" | "sfx";

export const SAMPLES = { boo, chant, goalDistant, goalRoar, oehh, whistleLong, whistleShort } as const;
export type Sample = keyof typeof SAMPLES;

export const MUSIC: Record<MusicTrack, string> = { menu: menuTheme, hub: hubTheme };
export const CROWD_BED = crowdBed;

/** A recorded sound in a cue, `at` seconds after it starts. */
type Layer = { sample: Sample; at: number; gain: number };
/** A synthesised note: a MIDI note number, when it starts and how long it rings, in seconds. */
export type Tone = { note: number; at: number; length: number; wave: "sine" | "triangle" | "square" | "sawtooth"; gain: number };

export type CueSound = {
  bus: Bus;
  /** Which cue wins when a fast clock has room for fewer sounds than a minute brings. */
  priority: number;
  /** Goals push the music and the crowd down while they play. */
  ducks: boolean;
  layers: readonly Layer[];
  tones: readonly Tone[];
};

const layer = (sample: Sample, at = 0, gain = 1): Layer => ({ sample, at, gain });
const chord = (notes: readonly number[], at: number, length: number, wave: Tone["wave"] = "triangle", gain = 0.12): Tone[] =>
  notes.map((note) => ({ note, at, length, wave, gain }));

function sfx(priority: number, layers: Layer[], ducks = false): CueSound {
  return { bus: "sfx", priority, ducks, layers, tones: [] };
}

function synth(bus: Bus, tones: Tone[]): CueSound {
  return { bus, priority: 0, ducks: false, layers: [], tones };
}

export const CUES: Record<Cue, CueSound> = {
  comeback: sfx(9, [layer("goalRoar"), layer("chant", 1.5, 0.9)], true),
  coachGoal: sfx(8, [layer("goalRoar")], true),
  conceded: sfx(8, [layer("boo")], true),
  fullTime: sfx(7, [layer("whistleShort"), layer("whistleShort", 0.45), layer("whistleLong", 0.9)]),
  halfTime: sfx(6, [layer("whistleShort"), layer("whistleLong", 0.45)]),
  kickOff: sfx(6, [layer("whistleShort")]),
  redCard: sfx(6, [layer("whistleShort"), layer("oehh", 0.3, 0.8)]),
  injury: sfx(5, [layer("oehh")]),
  card: sfx(4, [layer("whistleShort", 0, 0.8)]),
  otherGoal: sfx(2, [layer("goalDistant", 0, 0.45)]),
  click: synth("sfx", [{ note: 98, at: 0, length: 0.03, wave: "sine", gain: 0.08 }]),
  confirm: synth("sfx", [
    { note: 81, at: 0, length: 0.07, wave: "sine", gain: 0.1 },
    { note: 88, at: 0.07, length: 0.12, wave: "sine", gain: 0.1 },
  ]),
  title: synth("music", [...chord([60, 64, 67], 0, 0.18), ...chord([64, 67, 72], 0.2, 0.18), ...chord([67, 72, 76], 0.4, 1.6), ...chord([48], 0.4, 1.6, "sawtooth", 0.05)]),
  promotion: synth("music", [...chord([60], 0, 0.14), ...chord([64], 0.12, 0.14), ...chord([67], 0.24, 0.14), ...chord([72, 76], 0.36, 1.1), ...chord([48], 0.36, 1.1, "sawtooth", 0.04)]),
  relegation: synth("music", [...chord([67], 0, 0.3), ...chord([63], 0.28, 0.3), ...chord([60], 0.56, 0.3), ...chord([55, 51], 0.84, 1.4, "sine", 0.14)]),
  sacked: synth("music", [...chord([36], 0, 0.6, "sine", 0.3), ...chord([43, 44], 0.05, 1.6, "sawtooth", 0.035), ...chord([31], 0.05, 1.6, "triangle", 0.12)]),
};
