import { describe, expect, it } from "vitest";
import { advanceDay } from "@boleiro/engine/sim/advanceDay";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { competitionKey, type CoachRecord } from "@boleiro/engine/sim/history/history";
import { loadNewGame } from "@boleiro/engine/sim/loadNewGame";
import { matchPageOf } from "../matchPage/matchPageOf.js";
import { albumOf } from "./albumOf.js";

const FIRST = "flamengo-rj";
const SECOND = "palmeiras-sp";
// A season where both coaches win a state title and the second one the league and the cup too.
const SEED = 6;

/** A hot-seat season of two Série A coaches played to its end: its last day and the first of the next. */
function playSeason(): { last: GameState; next: GameState } {
  let state = loadNewGame(SEED, { coachClubId: FIRST, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: SECOND }] } });
  for (;;) {
    const day = advanceDay(state, {});
    if (day.events.some((e) => e.type === "seasonEnded")) return { last: state, next: day.state };
    state = day.state;
  }
}

const { last, next } = playSeason();
const seatOf = (state: GameState, name: string) => [state.coachName, ...(state.waitingCoaches ?? []).map((w) => w.name)].indexOf(name);
const ana = albumOf(next, seatOf(next, "Ana"));
const bruno = albumOf(next, seatOf(next, "Bruno"));

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
    expect(new Set(ana.titles.map((t) => t.clubId))).toEqual(new Set([FIRST]));
    expect(new Set(bruno.titles.map((t) => t.clubId))).toEqual(new Set([SECOND]));
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
    expect(bruno.titles.map((t) => t.competition).toSorted()).toEqual(["copa-do-brasil", "serie-a", "state-sp"]);
    for (const title of bruno.titles) {
      const decider = title.decider;
      if (!decider) return expect.fail(`${title.competition} has its deciding match`);
      const fixture = last.fixtures.find((f) => f.id === decider.ref);
      expect([decider.homeGoals, decider.awayGoals]).toEqual([fixture?.result?.homeGoals, fixture?.result?.awayGoals]);
      expect(decider.goals).toHaveLength(decider.homeGoals + decider.awayGoals);
      expect(next.fixtures.some((f) => f.id === decider.ref)).toBe(false);
      const page = matchPageOf(next, decider.ref, null);
      expect(page?.isRetold).toBe(false);
      expect(page?.events.filter((e) => e.type === "goal").map((e) => (e.type === "goal" ? page.names[e.playerId] : ""))).toEqual(decider.goals.map((g) => g.name));
      expect(page?.home.starters).toHaveLength(11);
      expect(page?.label).toContain(title.name);
    }
    expect(bruno.titles.find((t) => t.competition === "serie-a")?.decider?.kind).toBe("league");
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
    expect(bruno.records.titles).toBe(3);
    expect(bruno.records.bestFinish).toMatchObject({ division: "A", position: 1, clubId: SECOND });
    expect(bruno.records.byClub.map((c) => c.clubId)).toEqual([SECOND]);
    expect(bruno.records.byClub[0]?.records.biggestWin).toEqual(next.history.clubs[SECOND]?.biggestWin);
  });

  it("pastes in only the rare stickers his own clubs found while he ran them", () => {
    const date = `${last.season}-02-01`;
    const eggs = { log: [{ eggId: "seven-one", date, clubId: SECOND, headline: "Sete a um" }, { eggId: "windows-98", date, clubId: FIRST, headline: "Rodada de 1998" }] };
    const withEggs = { ...next, eggs };
    expect(albumOf(withEggs, seatOf(next, "Bruno")).eggs.found.map((e) => e.eggId)).toEqual(["seven-one"]);
    expect(albumOf(withEggs, seatOf(next, "Ana")).eggs.found.map((e) => e.eggId)).toEqual(["windows-98"]);
  });
});

describe("the album of a save from before it", () => {
  const strip = ({ album: _album, keptMatches: _kept, ...record }: CoachRecord): CoachRecord => record;
  const old: GameState = {
    ...next,
    history: { ...next.history, coach: strip(next.history.coach) },
    waitingCoaches: next.waitingCoaches?.map((waiting) => ({ ...waiting, record: strip(waiting.record) })),
  };
  const album = albumOf(old, seatOf(old, "Bruno"));

  it("shows its past seasons unprinted, with only the award winners and top scorers the history kept", () => {
    const page = album.seasons.find((s) => s.season === last.season);
    expect(page?.status).toBe("unprinted");
    const record = next.history.seasons.at(-1);
    const named = new Set([...(record?.awards?.bolaDePrata ?? []), ...Object.values(record?.topScorers ?? {})].filter((p) => p.clubId === SECOND).map((p) => p.playerId));
    expect(new Set(page?.stickers.map((s) => s.playerId))).toEqual(named);
    expect(page?.stickers.every((s) => s.apps === 0 && s.shines.length > 0)).toBe(true);
  });

  it("keeps its titles, with no deciding match to open", () => {
    expect(album.titles.map((t) => [t.competition, t.decider])).toEqual(bruno.titles.map((t) => [t.competition, null]));
    expect(album.titles.every((t) => competitionKey(t.competition) === t.competition)).toBe(true);
  });
});
