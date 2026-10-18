import { describe, expect, it } from "vitest";
import type { GameState } from "@boleiro/engine/sim/gameState";
import type { CoachRecord, SeasonRecord } from "@boleiro/engine/sim/history/history";
import { rivalryOf } from "@boleiro/engine/sim/rivalries/rivalryOf";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { createEngineSession, type EngineSession } from "../engine/createEngineSession.js";
import type { SessionSave } from "../engine/sessionSave.js";

const FIRST = "flamengo-rj";
const SECOND = "palmeiras-sp";
// A season where the second coach keeps his club and wins the league and the Paulista's two-legged final.
const SEED = 3;
const MAX_STEPS = 1_200;

type Season = Pick<GameState, "season" | "fixtures" | "competitions" | "history" | "date">;

/** One step of a hot-seat game: the seated coach passes, or, last of the turn, plays on and plays the round when it is today. */
function playOn(session: EngineSession) {
  for (let point = session.turningPoint(); point; point = session.turningPoint()) session.apply({ type: "closeTurningPoint" });
  if (!session.hotSeat()?.isLastTurn) {
    session.apply({ type: "passTurn" });
    return;
  }
  if (session.apply({ type: "playToMatchDay" }).daysPlayed > 0) return;
  session.apply({ type: "startRound" });
  session.apply({ type: "finishRound" });
}

/** A hot-seat season of two Série A coaches played through commands to its end: its last state and the session in the next season. */
function playSeason(): { last: Season; session: EngineSession } {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: SEED, choices: { coachClubId: FIRST, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: SECOND }] } } });
  const keys = ["season", "fixtures", "competitions", "history", "date"] as const;
  let last: Season = session.read(keys);
  for (let step = 0; step < MAX_STEPS && session.read(["season"]).season === last.season; step++) {
    last = session.read(keys);
    playOn(session);
  }
  return { last, session };
}

const { last, session } = playSeason();
const next = session.read(["season", "fixtures", "history", "clubs", "coachName", "waitingCoaches"]);
const names = session.album().coaches;
const seatOf = (name: string) => names.indexOf(name);
const ana = session.album(seatOf("Ana"));
const bruno = session.album(seatOf("Bruno"));
const recordOf = (name: string): CoachRecord => (next.coachName === name ? next.history.coach : (next.waitingCoaches?.find((w) => w.name === name)?.record ?? next.history.coach));

describe("a coach's album", () => {
  it("lists his seasons newest first: the one under way as it stands, then the printed ones", () => {
    expect(bruno.seasons.map((s) => [s.season, s.clubId, s.status])).toEqual([
      [next.season, SECOND, "live"],
      [last.season, SECOND, "printed"],
    ]);
    expect(bruno.seasons[0]?.stickers.every((sticker) => sticker.apps === 0)).toBe(true);
  });

  it("keeps each hot-seat coach to his own clubs, titles and names", () => {
    expect(ana.coachName).toBe("Ana");
    expect(bruno.coachName).toBe("Bruno");
    expect(ana.coaches.toSorted()).toEqual(["Ana", "Bruno"]);
    expect(new Set(ana.seasons.map((s) => s.clubId))).toEqual(new Set([FIRST]));
    expect(new Set(bruno.seasons.map((s) => s.clubId))).toEqual(new Set([SECOND]));
    expect(ana.titles.every((t) => t.clubId === FIRST)).toBe(true);
    expect(bruno.titles.length).toBeGreaterThan(0);
    expect(bruno.titles.every((t) => t.clubId === SECOND)).toBe(true);
  });

  it("numbers a page's stickers and tells why each one shines and what he won", () => {
    const page = bruno.seasons.find((s) => s.status === "printed");
    const record = next.history.seasons.at(-1);
    expect(page?.stickers.map((s) => s.number)).toEqual(page?.stickers.map((_, i) => i + 1));
    const silver = new Set(record?.awards?.bolaDePrata.filter((p) => p.clubId === SECOND).map((p) => p.playerId));
    for (const sticker of page?.stickers ?? []) {
      expect(sticker.honours.includes("Bola de Prata")).toBe(silver.has(sticker.playerId));
      if (silver.has(sticker.playerId)) expect(sticker.shines).toContain("award");
    }
    const best = Math.max(...(page?.stickers.map((s) => s.goals) ?? []));
    expect(page?.stickers.filter((s) => s.goals === best).every((s) => s.shines.includes("topScorer"))).toBe(true);
  });

  it("gives each title its page with the deciding match's real score and scorers, and opens that match after its season is gone", () => {
    const record = recordOf("Bruno");
    expect(bruno.titles.map((t) => t.competition).toSorted()).toEqual(record.trophies.map((t) => t.competition).toSorted());
    expect(bruno.titles.map((t) => t.decider?.kind).toSorted()).toEqual(["final", "league"]);
    for (const title of bruno.titles) {
      const decider = title.decider;
      if (!decider) return expect.fail(`${title.competition} has its deciding match`);
      const fixture = last.fixtures.find((f) => f.id === decider.ref);
      expect([decider.homeGoals, decider.awayGoals]).toEqual([fixture?.result?.homeGoals, fixture?.result?.awayGoals]);
      expect(decider.goals).toHaveLength(decider.homeGoals + decider.awayGoals);
      expect(next.fixtures.some((f) => f.id === decider.ref)).toBe(false);
      const page = session.matchPage(decider.ref);
      expect(page?.isRetold).toBe(false);
      expect(page?.events.filter((e) => e.type === "goal").map((e) => (e.type === "goal" ? page.names[e.playerId] : ""))).toEqual(decider.goals.map((g) => g.name));
      expect(page?.home.starters).toHaveLength(11);
      expect(page?.label).toContain(title.name);
    }
    for (const title of bruno.titles) {
      const decider = title.decider;
      const fixture = last.fixtures.find((f) => f.id === decider?.ref);
      const firstLeg = last.fixtures.find((f) => f.competitionId === fixture?.competitionId && f.stage === fixture?.stage && f.tie !== undefined && f.tie === fixture?.tie && f.id !== fixture?.id);
      expect(decider?.firstLeg ?? null).toEqual(firstLeg ? { homeId: firstLeg.homeId, awayId: firstLeg.awayId, homeGoals: firstLeg.result?.homeGoals, awayGoals: firstLeg.result?.awayGoals } : null);
    }
  });

  it("tells each title's story from the career: its number, his season at the club, the club's last win", () => {
    const order = [...bruno.titles].reverse();
    expect(order.map((t) => t.story.careerTitle)).toEqual(order.map((_, i) => i + 1));
    for (const title of bruno.titles) {
      expect(title.story.seasonAtClub).toBe(1);
      expect(title.story.clubLastWon).toBeNull();
      expect(title.story.historyFrom).toBe(last.season);
    }
  });

  it("links each printed season to the titles he won there", () => {
    const page = bruno.seasons.find((s) => s.season === last.season);
    expect(page?.titleIds.toSorted()).toEqual(bruno.titles.map((t) => t.id).toSorted());
    expect(page?.finish).toEqual({ division: "A", position: 1 });
  });

  it("keeps his records: the best season's scorer, the most games, the best finish and his clubs' own", () => {
    const stickers = bruno.seasons.flatMap((s) => s.stickers);
    expect(bruno.records.topSeasonScorer?.count).toBe(Math.max(...stickers.map((s) => s.goals)));
    expect(bruno.records.mostApps?.count).toBe(Math.max(...stickers.map((s) => s.apps)));
    expect(bruno.records.titles).toBe(recordOf("Bruno").trophies.length);
    expect(bruno.records.bestFinish).toMatchObject({ division: "A", position: 1, clubId: SECOND });
    expect(bruno.records.byClub.map((c) => c.clubId)).toEqual([SECOND]);
    expect(bruno.records.byClub[0]?.records.biggestWin).toEqual(next.history.clubs[SECOND]?.biggestWin);
  });

  it("pastes in only the rare stickers his own clubs found while he ran them", () => {
    const date = `${last.season}-02-01`;
    const eggs = { log: [{ eggId: "seven-one", date, clubId: SECOND, headline: "Sete a um" }, { eggId: "windows-98", date, clubId: FIRST, headline: "Rodada de 1998" }] };
    const loaded = loadedWith((game) => ({ ...game, eggs }));
    const seat = (name: string) => loaded.album().coaches.indexOf(name);
    expect(loaded.album(seat("Bruno")).eggs.found.map((e) => e.eggId)).toEqual(["seven-one"]);
    expect(loaded.album(seat("Ana")).eggs.found.map((e) => e.eggId)).toEqual(["windows-98"]);
    const page = (name: string) => loaded.album(seat(name)).seasons.find((s) => s.season === last.season);
    expect(page("Bruno")?.eggs.map((e) => e.eggId)).toEqual(["seven-one"]);
    expect(page("Ana")?.eggs.map((e) => e.eggId)).toEqual(["windows-98"]);
  });
});

describe("a title's story", () => {
  const final = bruno.titles.find((t) => t.decider?.kind === "final");
  if (!final?.decider) throw new Error("Bruno won a final");
  const { competition } = final;
  const earlier = final.season - 1;
  const lost = recordOf("Bruno").keptMatches?.find((m) => m.isWon && m.kind === "final");
  if (!lost) throw new Error("Bruno's record keeps his final");
  const won: SeasonRecord = { season: earlier, champions: { [competition]: SECOND }, topScorers: {}, promoted: { A: [], B: [], C: [], D: [] }, relegated: { A: [], B: [], C: [], D: [] }, tables: { A: [], B: [], C: [], D: [] } };
  const withPast = (record: CoachRecord): CoachRecord => (record.trophies.some((t) => t.competition === competition) ? { ...record, keptMatches: [{ ...lost, season: earlier, isWon: false }, ...(record.keptMatches ?? [])] } : record);
  const told = loadedWith((game) => ({
    ...game,
    history: { ...game.history, seasons: [won, ...game.history.seasons], coach: withPast(game.history.coach) },
    ...(game.waitingCoaches ? { waitingCoaches: game.waitingCoaches.map((waiting) => ({ ...waiting, record: withPast(waiting.record) })) } : {}),
  }));
  const story = told.album(told.album().coaches.indexOf("Bruno")).titles.find((t) => t.id === final.id)?.story;

  it("names the club's last win of the competition and the finals he lost with it before", () => {
    expect(story?.clubLastWon).toBe(earlier);
    expect(story?.historyFrom).toBe(earlier);
    expect(story?.lostFinals).toEqual([earlier]);
  });

  it("names the derby when the title was decided against a rival", () => {
    expect(final.story.derby).toBe(rivalryOf(final.decider?.homeId ?? "", final.decider?.awayId ?? "")?.name ?? null);
  });
});

/** A session loaded from this one's save with its game changed. */
function loadedWith(change: (game: GameState) => GameState): EngineSession {
  const save: SessionSave = JSON.parse(session.save());
  const loaded = createEngineSession(bundledGameFiles);
  loaded.apply({ type: "load", save: JSON.stringify({ ...save, game: change(save.game) }) });
  return loaded;
}

describe("the album of a save from before it", () => {
  const strip = (record: CoachRecord): CoachRecord => {
    const stripped = { ...record };
    Reflect.deleteProperty(stripped, "album");
    Reflect.deleteProperty(stripped, "keptMatches");
    return stripped;
  };
  const old = loadedWith((game) => ({
    ...game,
    history: { ...game.history, coach: strip(game.history.coach) },
    ...(game.waitingCoaches ? { waitingCoaches: game.waitingCoaches.map((waiting) => ({ ...waiting, record: strip(waiting.record) })) } : {}),
  }));
  const album = old.album(old.album().coaches.indexOf("Bruno"));

  it("shows its past seasons unprinted, with only the award winners and top scorers the history kept", () => {
    const page = album.seasons.find((s) => s.season === last.season);
    expect(page?.status).toBe("unprinted");
    const record = next.history.seasons.at(-1);
    const named = new Set([...(record?.awards?.bolaDePrata ?? []), ...Object.values(record?.topScorers ?? {})].filter((p) => p.clubId === SECOND).map((p) => p.playerId));
    expect(new Set(page?.stickers.map((s) => s.playerId))).toEqual(named);
    expect(page?.stickers.every((s) => s.apps === 0 && s.shines.length > 0)).toBe(true);
  });

  it("keeps its titles, with no deciding match to open", () => {
    expect(album.titles.map((t) => [t.competition, t.season, t.clubId, t.decider])).toEqual(bruno.titles.map((t) => [t.competition, t.season, t.clubId, null]));
  });
});
