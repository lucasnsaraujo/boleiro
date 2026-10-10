import { expect, test } from "vitest";
import { FakeAudioContext, fetchUrlBytes } from "./fakeAudioContext.js";
import { CROWD_BED, MUSIC, SAMPLES } from "./soundCatalog.js";
import { createSoundEngine } from "./soundEngine.js";
import { DEFAULT_SOUND, type SoundSettings } from "./soundSettings.js";

const ROAR_SECONDS = 9;

function setUp(settings: SoundSettings = { music: 1, sfx: 1, isMuted: false }) {
  const contexts: FakeAudioContext[] = [];
  const engine = createSoundEngine({
    createContext: () => {
      const ctx = new FakeAudioContext({ [SAMPLES.goalRoar]: ROAR_SECONDS, [SAMPLES.goalDistant]: 4 });
      contexts.push(ctx);
      return ctx;
    },
    fetchBytes: fetchUrlBytes,
  });
  engine.apply(settings);
  const ctx = () => {
    const first = contexts[0];
    if (!first) throw new Error("no audio context yet");
    return first;
  };
  return { engine, contexts, ctx };
}

/** Lets the fetches and decodes the engine started settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("nothing is made before the first gesture; then the music asked for starts and the context runs", async () => {
  const { engine, contexts, ctx } = setUp();
  engine.playMusic("menu");
  engine.play("click");
  expect(contexts).toHaveLength(0);
  engine.unlock();
  await settle();
  expect(ctx().state).toBe("running");
  expect(ctx().playing()).toEqual([MUSIC.menu]);
  engine.unlock();
  expect(contexts).toHaveLength(1);
});

test("changing screens swaps the music; asking for the same track again leaves it playing", async () => {
  const { engine, ctx } = setUp();
  engine.unlock();
  engine.playMusic("menu");
  await settle();
  engine.playMusic("menu");
  await settle();
  expect(ctx().sources.filter((s) => s.url === MUSIC.menu)).toHaveLength(1);
  engine.playMusic("hub");
  await settle();
  ctx().currentTime = 5;
  expect(ctx().playing()).toEqual([MUSIC.hub]);
  engine.playMusic(null);
  ctx().currentTime = 10;
  expect(ctx().playing()).toEqual([]);
});

test("a cue never stacks on itself: a second roar while the first rings is dropped, and plays once the first is done", async () => {
  const { engine, ctx } = setUp();
  engine.unlock();
  await settle();
  engine.play("coachGoal");
  ctx().currentTime = 2;
  engine.play("coachGoal");
  expect(ctx().playing()).toEqual([SAMPLES.goalRoar]);
  ctx().currentTime = ROAR_SECONDS + 0.5;
  engine.play("coachGoal");
  expect(ctx().playing()).toEqual([SAMPLES.goalRoar]);
  expect(ctx().sources.filter((s) => s.url === SAMPLES.goalRoar)).toHaveLength(2);
});

test("goals push the music and the crowd down while they ring, then let them back up", async () => {
  const { engine, ctx } = setUp();
  engine.unlock();
  engine.playMusic("hub");
  engine.setCrowd(1);
  await settle();
  ctx().currentTime = 1;
  const music = ctx().loudness(MUSIC.hub);
  const crowd = ctx().loudness(CROWD_BED);
  engine.play("coachGoal");
  expect(ctx().loudness(MUSIC.hub, 1.5)).toBeLessThan(music / 2);
  expect(ctx().loudness(CROWD_BED, 1.5)).toBeLessThan(crowd / 2);
  expect(ctx().loudness(MUSIC.hub, 1 + ROAR_SECONDS + 1)).toBeCloseTo(music);
  expect(ctx().loudness(CROWD_BED, 1 + ROAR_SECONDS + 1)).toBeCloseTo(crowd);
});

test("the volumes set how loud music and effects reach the speakers, and mute silences both", async () => {
  const { engine, ctx } = setUp();
  engine.unlock();
  engine.playMusic("menu");
  await settle();
  engine.play("otherGoal");
  const loud = { music: ctx().loudness(MUSIC.menu), sfx: ctx().loudness(SAMPLES.goalDistant) };
  engine.apply({ music: 0.5, sfx: 0.25, isMuted: false });
  ctx().currentTime = 0.5;
  expect(ctx().loudness(MUSIC.menu)).toBeLessThan(loud.music);
  expect(ctx().loudness(SAMPLES.goalDistant) / loud.sfx).toBeLessThan(ctx().loudness(MUSIC.menu) / loud.music);
  engine.apply({ ...DEFAULT_SOUND, isMuted: true });
  ctx().currentTime = 1;
  expect(ctx().loudness(MUSIC.menu)).toBe(0);
  expect(ctx().loudness(SAMPLES.goalDistant)).toBe(0);
});

test("the crowd follows the level it's given and fades away when the round ends", async () => {
  const { engine, ctx } = setUp();
  engine.setCrowd(0.4);
  engine.unlock();
  await settle();
  ctx().currentTime = 1;
  const calm = ctx().loudness(CROWD_BED);
  expect(calm).toBeGreaterThan(0);
  engine.setCrowd(1);
  ctx().currentTime = 2;
  expect(ctx().loudness(CROWD_BED)).toBeGreaterThan(calm);
  engine.setCrowd(null);
  ctx().currentTime = 5;
  expect(ctx().playing()).toEqual([]);
});

test("stingers and clicks are synthesised, with no file", async () => {
  const { engine, ctx } = setUp();
  engine.unlock();
  await settle();
  engine.play("title");
  engine.play("click");
  expect(ctx().notes()).toBeGreaterThan(3);
  expect(ctx().playing()).toEqual([]);
});
