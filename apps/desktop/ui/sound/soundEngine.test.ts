import { expect, test } from "vitest";
import { FakeAudioContext, fetchUrlBytes } from "./fakeAudioContext.js";
import { CROWD_BED, MUSIC, SAMPLES } from "./soundCatalog.js";
import { createSoundEngine } from "./soundEngine.js";
import { stingerBeat } from "./stingerBeat.js";
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

test("asking for a track again while it loads starts it once, and a crowd called off while loading never starts", async () => {
  const { engine, ctx } = setUp();
  engine.unlock();
  engine.playMusic("menu");
  engine.playMusic("menu");
  engine.setCrowd(1);
  engine.setCrowd(null);
  await settle();
  expect(ctx().sources.filter((s) => s.url === MUSIC.menu)).toHaveLength(1);
  expect(ctx().sources.filter((s) => s.url === CROWD_BED)).toHaveLength(0);
});

test("no more than three cues ring at once: a more important one cuts the least important short", async () => {
  const { engine, ctx } = setUp();
  engine.unlock();
  await settle();
  engine.play("card");
  engine.play("injury");
  engine.play("otherGoal");
  engine.play("conceded");
  const cut = ctx().playing(0.2);
  expect(cut).toHaveLength(3);
  expect(cut).toContain(SAMPLES.boo);
  expect(cut).not.toContain(SAMPLES.goalDistant);
  ctx().currentTime = 0.2;
  engine.play("halfTime");
  expect(ctx().playing(0.4)).toHaveLength(3);
  engine.play("otherGoal");
  expect(ctx().playing(0.4)).toHaveLength(3);
});

test("the crowd has its own volume, and the interface at zero silences the clicks while the effects still sound", async () => {
  const { engine, ctx } = setUp({ music: 1, sfx: 1, crowd: 1, ui: 1, isMuted: false });
  engine.setCrowd(1);
  engine.unlock();
  await settle();
  ctx().currentTime = 2;
  const full = ctx().loudness(CROWD_BED);
  engine.apply({ music: 1, sfx: 1, crowd: 0.5, ui: 0, isMuted: false });
  ctx().currentTime = 3;
  expect(ctx().loudness(CROWD_BED)).toBeCloseTo(full / 4);
  engine.play("click");
  engine.play("confirm");
  expect(ctx().notes()).toBe(0);
  engine.play("kickOff");
  expect(ctx().playing()).toContain(SAMPLES.whistleShort);
});

test("muted, one-off sounds don't start at all, while the music and the crowd keep their place for the unmute", async () => {
  const { engine, ctx } = setUp({ ...DEFAULT_SOUND, isMuted: true });
  engine.unlock();
  engine.playMusic("hub");
  engine.setCrowd(0.6);
  await settle();
  ctx().currentTime = 1;
  engine.play("coachGoal");
  engine.play("click");
  expect(ctx().started()).toEqual([MUSIC.hub, CROWD_BED]);
  expect(ctx().notes()).toBe(0);
  expect(ctx().loudness(MUSIC.hub)).toBe(0);
  engine.apply(DEFAULT_SOUND);
  ctx().currentTime = 2;
  expect(ctx().loudness(MUSIC.hub)).toBeGreaterThan(0);
  expect(ctx().loudness(CROWD_BED)).toBeGreaterThan(0);
});

test("any effect over the music pushes it down a little while it rings; a goal pushes it further", async () => {
  const { engine, ctx } = setUp();
  engine.unlock();
  engine.playMusic("hub");
  await settle();
  ctx().currentTime = 1;
  const music = ctx().loudness(MUSIC.hub);
  engine.play("card");
  const underWhistle = ctx().loudness(MUSIC.hub, 1.1);
  expect(underWhistle).toBeLessThan(music);
  expect(underWhistle).toBeGreaterThan(music / 2);
  expect(ctx().loudness(MUSIC.hub, 4)).toBeCloseTo(music);
  ctx().currentTime = 5;
  engine.play("coachGoal");
  expect(ctx().loudness(MUSIC.hub, 5.2)).toBeLessThan(underWhistle / 2);
});

test("the crowd is muffled when calm and opens up as it gets louder", async () => {
  const { engine, ctx } = setUp();
  engine.setCrowd(0.3);
  engine.unlock();
  await settle();
  ctx().currentTime = 1;
  const calm = ctx().cutoff(CROWD_BED, 1);
  engine.setCrowd(1);
  ctx().currentTime = 2;
  expect(ctx().cutoff(CROWD_BED, 2)).toBeGreaterThan((calm ?? Infinity) * 2);
});

test("the goal stinger is synthesised brass and drums, and lands on its second hit", async () => {
  const { engine, ctx } = setUp();
  engine.unlock();
  await settle();
  engine.play("goalStinger");
  expect(ctx().notes()).toBeGreaterThan(8);
  expect(ctx().started()).toEqual([]);
  expect(stingerBeat("goalStinger")).toBe(160);
});

test("away, the coach's goal comes from the small away end and the goal against from the home crowd", async () => {
  const { engine, ctx } = setUp();
  engine.unlock();
  await settle();
  engine.play("coachGoal");
  const home = ctx().loudness(SAMPLES.goalRoar, 0.5);
  ctx().currentTime = 20;
  engine.play("coachGoalAway");
  expect(ctx().loudness(SAMPLES.goalRoar, 20.5)).toBeLessThan(home);
  ctx().currentTime = 40;
  engine.play("conceded");
  ctx().currentTime = 60;
  engine.play("concededAway");
  expect(ctx().playing(40.5)).toContain(SAMPLES.oehh);
  expect(ctx().playing(60.5)).toContain(SAMPLES.goalDistant);
});

test("a VAR check sounds a sting, and its decision a whistle and a thud", async () => {
  const { engine, ctx } = setUp();
  engine.unlock();
  await settle();
  engine.play("varCheck");
  expect(ctx().notes()).toBeGreaterThan(2);
  expect(ctx().started()).toEqual([]);
  ctx().currentTime = 5;
  const before = ctx().notes();
  engine.play("varDecision");
  expect(ctx().notes()).toBeGreaterThan(before);
  expect(ctx().playing()).toContain(SAMPLES.whistleShort);
});

test("a relieved cheer is the crowd's cheer cut short, faded out", async () => {
  const { engine, ctx } = setUp();
  engine.unlock();
  await settle();
  engine.play("relief");
  expect(ctx().playing(0.5)).toEqual([SAMPLES.goalDistant]);
  expect(ctx().playing(3.5)).toEqual([]);
  engine.play("groan");
  expect(ctx().playing()).toContain(SAMPLES.oehh);
});

test("the crowd's own volume covers its roars, boos and groans too; at zero they go quiet while the whistles still sound", async () => {
  const { engine, ctx } = setUp({ music: 1, sfx: 1, crowd: 0, isMuted: false });
  engine.unlock();
  await settle();
  engine.play("coachGoal");
  engine.play("conceded");
  engine.play("groan");
  engine.play("kickOff");
  expect(ctx().started()).toEqual([SAMPLES.whistleShort]);
});

test("everything reaches the speakers through one limiter, so a roar, the stinger and the crowd together can't clip", async () => {
  const { engine, ctx } = setUp();
  engine.setCrowd(1);
  engine.playMusic("hub");
  engine.unlock();
  await settle();
  engine.play("comeback");
  engine.play("goalStinger");
  engine.play("click");
  expect(ctx().playing().length).toBeGreaterThan(2);
  expect(ctx().sources.every((source) => ctx().reachesSpeakersThroughLimiter(source))).toBe(true);
});
