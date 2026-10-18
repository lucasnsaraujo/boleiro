import { createSoundEngine, type AudioBufferLike, type AudioContextLike, type AudioNodeLike, type AudioParamLike } from "./soundEngine.js";

type Step = { time: number; value: number };

/** An audio param that keeps its automation, so a test can ask what it is at a time. Ramps count as reached when they start. */
class FakeParam implements AudioParamLike {
  private steps: Step[] = [];
  constructor(public value: number) {}
  setValueAtTime(value: number, time: number) {
    this.steps.push({ time, value });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.steps.push({ time, value });
    return this;
  }
  setTargetAtTime(value: number, time: number) {
    this.steps.push({ time, value });
    return this;
  }
  cancelScheduledValues(time: number) {
    this.steps = this.steps.filter((step) => step.time < time);
    return this;
  }
  at(time: number): number {
    return this.steps.filter((step) => step.time <= time).reduce((_, step) => step.value, this.value);
  }
}

class FakeNode implements AudioNodeLike {
  outputs: FakeNode[] = [];
  connect(destination: AudioNodeLike): AudioNodeLike {
    if (destination instanceof FakeNode) this.outputs.push(destination);
    return destination;
  }
  disconnect() {
    this.outputs = [];
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

class FakeCompressor extends FakeNode {
  threshold = new FakeParam(-24);
  knee = new FakeParam(30);
  ratio = new FakeParam(12);
  attack = new FakeParam(0.003);
  release = new FakeParam(0.25);
}

class FakeFilter extends FakeNode {
  type: BiquadFilterType = "lowpass";
  frequency = new FakeParam(350);
}

export type FakeBuffer = { duration: number; url: string };

/** A playing sound: a decoded file (`url`) or a synthesised note (`note`), from `start` until `stop`. */
class FakeSource extends FakeNode {
  buffer: AudioBufferLike | null = null;
  loop = false;
  type: OscillatorType = "sine";
  frequency = new FakeParam(440);
  startedAt?: number;
  stoppedAt = Infinity;
  constructor(private ctx: FakeAudioContext) {
    super();
  }
  get url(): string | null {
    const buffer = this.buffer;
    return buffer && "url" in buffer && typeof buffer.url === "string" ? buffer.url : null;
  }
  start(when = 0) {
    this.startedAt = Math.max(when, this.ctx.currentTime);
  }
  stop(when = 0) {
    this.stoppedAt = Math.max(when, this.ctx.currentTime);
  }
  isPlayingAt(time: number): boolean {
    if (this.startedAt === undefined || time < this.startedAt || time >= this.stoppedAt) return false;
    if (this.loop || !this.buffer) return true;
    return time < this.startedAt + this.buffer.duration;
  }
}

/** The Web Audio boundary for tests: records what was started and lets a test ask how loud each sound reaches the speakers. */
export class FakeAudioContext implements AudioContextLike {
  currentTime = 0;
  state: AudioContextState = "suspended";
  readonly destination = new FakeNode();
  readonly sources: FakeSource[] = [];
  constructor(private durations: Readonly<Record<string, number>> = {}) {}

  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  createGain() {
    return new FakeGain();
  }
  createBiquadFilter() {
    return new FakeFilter();
  }
  createBufferSource() {
    const source = new FakeSource(this);
    this.sources.push(source);
    return source;
  }
  createOscillator() {
    return this.createBufferSource();
  }
  createDynamicsCompressor() {
    return new FakeCompressor();
  }
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike> {
    const url = new TextDecoder().decode(data);
    const buffer: FakeBuffer = { url, duration: this.durations[url] ?? 2 };
    return Promise.resolve(buffer);
  }

  /** The files playing at `time` (default: now), by URL. */
  playing(time = this.currentTime): string[] {
    return this.sources.flatMap((s) => (s.url && s.isPlayingAt(time) ? [s.url] : []));
  }
  /** Every file started so far, in order, by URL. */
  started(): string[] {
    return this.sources.flatMap((s) => (s.url && s.startedAt !== undefined ? [s.url] : []));
  }
  /** How many synthesised notes have been started. */
  notes(): number {
    return this.sources.filter((s) => !s.url && s.startedAt !== undefined).length;
  }
  /** How loud the newest playing copy of `url` reaches the speakers at `time`: the product of the gains on its way. */
  loudness(url: string, time = this.currentTime): number {
    const source = this.sources.findLast((s) => s.url === url && s.isPlayingAt(time));
    return source ? this.gainToSpeakers(source, time) : 0;
  }
  /** The cutoff of the first filter the newest copy of `url` passes through on its way out, at `time`, or null for none. */
  cutoff(url: string, time = this.currentTime): number | null {
    let node: FakeNode | undefined = this.sources.findLast((s) => s.url === url);
    while (node && !(node instanceof FakeFilter)) node = node.outputs[0];
    return node instanceof FakeFilter ? node.frequency.at(time) : null;
  }
  /** Whether every way out of `node` to the speakers passes through a limiter set to hold peaks under 0 dB. */
  reachesSpeakersThroughLimiter(node: FakeNode): boolean {
    if (node instanceof FakeCompressor) return node.threshold.at(this.currentTime) < 0 && node.ratio.at(this.currentTime) >= 12 && node.outputs.includes(this.destination);
    return node.outputs.length > 0 && node.outputs.every((next) => next !== this.destination && this.reachesSpeakersThroughLimiter(next));
  }
  private gainToSpeakers(node: FakeNode, time: number): number {
    if (node === this.destination) return 1;
    const own = node instanceof FakeGain ? node.gain.at(time) : 1;
    return node.outputs.reduce((sum, next) => sum + own * this.gainToSpeakers(next, time), 0);
  }
}

/** What the engine fetches: the URL itself, which the fake context "decodes" back. */
export const fetchUrlBytes = (url: string): Promise<ArrayBuffer> => Promise.resolve(new TextEncoder().encode(url).buffer);

/** A sound engine over a fake context, unlocked as if the player had already clicked. */
export function unlockedFakeSound(durations: Readonly<Record<string, number>> = {}) {
  const ctx = new FakeAudioContext(durations);
  const engine = createSoundEngine({ createContext: () => ctx, fetchBytes: fetchUrlBytes });
  engine.unlock();
  return { engine, ctx };
}
