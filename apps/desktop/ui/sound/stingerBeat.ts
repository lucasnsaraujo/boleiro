import { CUES, type Cue } from "./soundCatalog.js";

/** When a cue lands: the start of its last synthesised note, in ms. A screen's stamp hits on that beat. */
export function stingerBeat(cue: Cue): number {
  return Math.round(Math.max(0, ...CUES[cue].tones.map((tone) => tone.at)) * 1000);
}
