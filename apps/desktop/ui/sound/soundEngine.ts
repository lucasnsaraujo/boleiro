import { CROWD_BED, CUES, MUSIC, SAMPLES, type Bus, type Cue, type MusicTrack, type Tone } from "./soundCatalog.js";
import { DEFAULT_SOUND, volumeOf, type Category, type SoundSettings } from "./soundSettings.js";

/** The parts of Web Audio the engine uses, so tests can stand in for the browser at this boundary. */
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(target: number, time: number, timeConstant: number): unknown;
  cancelScheduledValues(time: number): unknown;
}
export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): void;
}
export interface AudioBufferLike {
  readonly duration: number;
}
interface GainLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}
interface FilterLike extends AudioNodeLike {
  type: BiquadFilterType;
  readonly frequency: AudioParamLike;
}
interface ScheduledLike extends AudioNodeLike {
  start(when?: number): void;
  stop(when?: number): void;
}
interface BufferSourceLike extends ScheduledLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
}
interface OscillatorLike extends ScheduledLike {
  type: OscillatorType;
  readonly frequency: AudioParamLike;
}
export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: AudioContextState;
  readonly destination: AudioNodeLike;
  resume(): Promise<void>;
  createGain(): GainLike;
  createBiquadFilter(): FilterLike;
  createBufferSource(): BufferSourceLike;
  createOscillator(): OscillatorLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
}

/** Music and effects for the whole game. Nothing sounds until `unlock`, which must run inside a user gesture. */
export type SoundEngine = {
  unlock(): void;
  apply(settings: SoundSettings): void;
  playMusic(track: MusicTrack | null): void;
  play(cue: Cue): void;
  /** The crowd under the live round, from 0 to 1, or null for none. */
  setCrowd(level: number | null): void;
};

export const SILENT_SOUND: SoundEngine = { unlock() {}, apply() {}, playMusic() {}, play() {}, setCrowd() {} };

type Deps = {
  createContext: () => AudioContextLike;
  fetchBytes: (url: string) => Promise<ArrayBuffer>;
};

type Graph = {
  ctx: AudioContextLike;
  master: GainLike;
  buses: Record<Category, GainLike>;
  musicDuck: GainLike;
  crowdDuck: GainLike;
  /** The crowd's brightness: a quiet crowd is a far-off murmur, a loud one opens up. */
  crowdTone: FilterLike;
};
type Loop = { source: BufferSourceLike; gain: GainLike };
type Voice = { source: ScheduledLike; gain: GainLike };
type Ringing = { until: number; voices: Voice[] };

const MUSIC_FADE = 0.3;
const CROWD_FADE = 0.6;
const CROWD_MAX = 0.7;
const DUCKED = 0.3;
// Any match effect over the music takes it down about 3 dB while it rings.
const UNDER_EFFECTS = 0.7;
const LAYER_FADE = 0.4;
const MAX_RINGING = 3;
const FADE_STOP_SECONDS = 1.5;
const CUT_SECONDS = 0.1;

/** Sliders are linear; the ear is not. Squaring makes the middle of a slider sound like the middle. */
const loudnessOf = (volume: number) => volume * volume;
const hertz = (note: number) => 440 * 2 ** ((note - 69) / 12);
/** The crowd's lowpass for its level: about 700 Hz when it barely murmurs, near 8 kHz in full voice. */
const crowdCutoff = (level: number) => 700 * 2 ** (level * 3.5);
const CATEGORY_OF: Record<Bus, Category> = { music: "music", sfx: "sfx", ui: "ui" };

export function createSoundEngine({ createContext, fetchBytes }: Deps): SoundEngine {
  let graph: Graph | null = null;
  let settings = DEFAULT_SOUND;
  let wantedMusic: MusicTrack | null = null;
  let wantedCrowd: number | null = null;
  let music: (Loop & { track: MusicTrack }) | null = null;
  let crowd: Loop | null = null;
  let loadingTrack: MusicTrack | null = null;
  const loads = new Map<string, Promise<AudioBufferLike>>();
  const buffers = new Map<string, AudioBufferLike>();
  const ringing = new Map<Cue, Ringing>();
  const ducked = new Map<GainLike, { level: number; until: number }>();

  function load(ctx: AudioContextLike, url: string): Promise<AudioBufferLike> {
    let loading = loads.get(url);
    if (!loading) {
      loading = fetchBytes(url)
        .then((bytes) => ctx.decodeAudioData(bytes))
        .then((buffer) => {
          buffers.set(url, buffer);
          return buffer;
        });
      loading.catch(() => loads.delete(url));
      loads.set(url, loading);
    }
    return loading;
  }

  function gainNode(ctx: AudioContextLike, value: number, to: AudioNodeLike): GainLike {
    const node = ctx.createGain();
    node.gain.setValueAtTime(value, ctx.currentTime);
    node.connect(to);
    return node;
  }

  /** Fades from wherever the gain is now, so cancelling a fade-in that hasn't begun can't jump to full volume first. */
  function fadeOut({ source, gain }: Voice, ctx: AudioContextLike, timeConstant = MUSIC_FADE, stopAfter = FADE_STOP_SECONDS) {
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.setTargetAtTime(0, now, timeConstant);
    source.stop(now + stopAfter);
  }

  /** Starts a loop once its file is loaded, unless by then it is no longer wanted. */
  function startLoop(g: Graph, url: string, level: () => number, to: AudioNodeLike, fade: number, isWanted: () => boolean): Promise<Loop | null> {
    return load(g.ctx, url).then((buffer) => {
      if (!isWanted()) return null;
      const gain = gainNode(g.ctx, 0, to);
      gain.gain.setTargetAtTime(level(), g.ctx.currentTime, fade);
      const source = g.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start();
      return { source, gain };
    });
  }

  function syncMusic(g: Graph) {
    if (music?.track === wantedMusic) return;
    if (music) fadeOut(music, g.ctx);
    music = null;
    const track = wantedMusic;
    if (!track || loadingTrack === track) return;
    loadingTrack = track;
    const isWanted = () => wantedMusic === track && music?.track !== track;
    const settle = (loop: Loop | null) => {
      if (loadingTrack === track) loadingTrack = null;
      if (loop) music = { ...loop, track };
    };
    startLoop(g, MUSIC[track], () => 1, g.musicDuck, MUSIC_FADE, isWanted).then(settle, () => settle(null));
  }

  let isCrowdStarting = false;
  function syncCrowd(g: Graph) {
    if (wantedCrowd === null) {
      if (crowd) fadeOut(crowd, g.ctx);
      crowd = null;
      return;
    }
    g.crowdTone.frequency.setTargetAtTime(crowdCutoff(wantedCrowd), g.ctx.currentTime, CROWD_FADE);
    if (crowd) {
      crowd.gain.gain.setTargetAtTime(wantedCrowd * CROWD_MAX, g.ctx.currentTime, CROWD_FADE);
      return;
    }
    if (isCrowdStarting) return;
    isCrowdStarting = true;
    startLoop(g, CROWD_BED, () => (wantedCrowd ?? 0) * CROWD_MAX, g.crowdTone, CROWD_FADE, () => wantedCrowd !== null).then(
      (loop) => {
        isCrowdStarting = false;
        crowd = loop;
        syncCrowd(g);
      },
      () => {
        isCrowdStarting = false;
      },
    );
  }

  function applySettings(g: Graph) {
    const now = g.ctx.currentTime;
    g.master.gain.setTargetAtTime(settings.isMuted ? 0 : 1, now, 0.03);
    for (const [category, bus] of Object.entries(g.buses) as [Category, GainLike][]) bus.gain.setTargetAtTime(loudnessOf(volumeOf(settings, category)), now, 0.03);
  }

  /** Whether a cue on `bus` would reach the speakers at all; a silent one isn't started, so it can't hold a voice. */
  const isHeard = (bus: Bus) => !settings.isMuted && volumeOf(settings, CATEGORY_OF[bus]) > 0;

  /** Takes `nodes` down to `level` for most of `seconds`, unless a deeper duck is already holding them down. */
  function duck(g: Graph, nodes: readonly GainLike[], level: number, seconds: number) {
    const now = g.ctx.currentTime;
    const release = now + seconds * 0.75;
    for (const node of nodes) {
      const current = ducked.get(node);
      if (current && current.until > now && current.level < level) continue;
      node.gain.cancelScheduledValues(now);
      node.gain.setTargetAtTime(level, now, 0.08);
      node.gain.setTargetAtTime(1, release, 0.6);
      ducked.set(node, { level, until: release });
    }
  }

  function playTone(g: Graph, tone: Tone, to: AudioNodeLike): Voice {
    const { ctx } = g;
    const start = ctx.currentTime + tone.at;
    const envelope = gainNode(ctx, 0, to);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(tone.gain, start + 0.008);
    envelope.gain.setTargetAtTime(0, start + 0.008, tone.length / 3);
    const oscillator = ctx.createOscillator();
    oscillator.type = tone.wave;
    oscillator.frequency.setValueAtTime(hertz(tone.note), start);
    if (tone.to !== undefined) oscillator.frequency.linearRampToValueAtTime(hertz(tone.to), start + tone.length);
    if (tone.wave === "sawtooth" || tone.wave === "square") {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(tone.cutoff ?? 1800, start);
      filter.connect(envelope);
      oscillator.connect(filter);
    } else {
      oscillator.connect(envelope);
    }
    oscillator.start(start);
    oscillator.stop(start + tone.length * 2 + 0.1);
    return { source: oscillator, gain: envelope };
  }

  function playCue(g: Graph, cue: Cue) {
    const { ctx } = g;
    const now = ctx.currentTime;
    if ((ringing.get(cue)?.until ?? -1) > now) return;
    const sound = CUES[cue];
    if (!isHeard(sound.bus)) return;
    const layers = sound.layers.map((layer) => ({ ...layer, buffer: buffers.get(SAMPLES[layer.sample]) }));
    if (layers.some((layer) => !layer.buffer)) {
      for (const layer of sound.layers) void load(ctx, SAMPLES[layer.sample]).catch(() => undefined);
      return;
    }
    const others = [...ringing].filter(([other, { until }]) => other !== cue && until > now);
    if (others.length >= MAX_RINGING) {
      const [quietest] = others.sort(([a], [b]) => CUES[a].priority - CUES[b].priority);
      if (!quietest || CUES[quietest[0]].priority >= sound.priority) return;
      for (const voice of quietest[1].voices) fadeOut(voice, ctx, CUT_SECONDS / 4, CUT_SECONDS);
      ringing.delete(quietest[0]);
    }

    const heardFor = (layer: (typeof layers)[number]) => Math.min(layer.buffer?.duration ?? 0, layer.length === undefined ? Infinity : layer.length + LAYER_FADE);
    const length = Math.max(0, ...layers.map((layer) => layer.at + heardFor(layer)), ...sound.tones.map((tone) => tone.at + tone.length));
    const bus = g.buses[CATEGORY_OF[sound.bus]];
    const voices = layers.map((layer): Voice => {
      const source = ctx.createBufferSource();
      const gain = gainNode(ctx, layer.gain, bus);
      source.buffer = layer.buffer ?? null;
      source.connect(gain);
      source.start(now + layer.at);
      if (layer.length !== undefined) {
        const cut = now + layer.at + layer.length;
        gain.gain.setValueAtTime(layer.gain, cut);
        gain.gain.linearRampToValueAtTime(0, cut + LAYER_FADE);
        source.stop(cut + LAYER_FADE);
      }
      return { source, gain };
    });
    voices.push(...sound.tones.map((tone) => playTone(g, tone, bus)));
    ringing.set(cue, { until: now + length, voices });
    if (sound.ducks) duck(g, [g.musicDuck, g.crowdDuck], DUCKED, length);
    else if (sound.bus === "sfx") duck(g, [g.musicDuck], UNDER_EFFECTS, length);
  }

  function open(): Graph | null {
    let ctx: AudioContextLike;
    try {
      ctx = createContext();
    } catch {
      return null;
    }
    const master = gainNode(ctx, 1, ctx.destination);
    const buses: Record<Category, GainLike> = { music: gainNode(ctx, 1, master), sfx: gainNode(ctx, 1, master), crowd: gainNode(ctx, 1, master), ui: gainNode(ctx, 1, master) };
    const crowdDuck = gainNode(ctx, 1, buses.crowd);
    const crowdTone = ctx.createBiquadFilter();
    crowdTone.type = "lowpass";
    crowdTone.frequency.setValueAtTime(crowdCutoff(wantedCrowd ?? 0), ctx.currentTime);
    crowdTone.connect(crowdDuck);
    const g: Graph = { ctx, master, buses, musicDuck: gainNode(ctx, 1, buses.music), crowdDuck, crowdTone };
    applySettings(g);
    for (const url of Object.values(SAMPLES)) void load(ctx, url).catch(() => undefined);
    return g;
  }

  return {
    unlock() {
      if (graph) {
        if (graph.ctx.state === "suspended") void graph.ctx.resume().catch(() => undefined);
        return;
      }
      graph = open();
      if (!graph) return;
      void graph.ctx.resume().catch(() => undefined);
      syncMusic(graph);
      syncCrowd(graph);
    },
    apply(next) {
      settings = next;
      if (graph) applySettings(graph);
    },
    playMusic(track) {
      wantedMusic = track;
      if (graph) syncMusic(graph);
    },
    play(cue) {
      if (graph) playCue(graph, cue);
    },
    setCrowd(level) {
      wantedCrowd = level;
      if (graph) syncCrowd(graph);
    },
  };
}
