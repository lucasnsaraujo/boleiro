import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { Competition, GameState } from "../gameState.js";
import { competitionKey, type CoachRecord } from "../history/history.js";
import { loadNewGame } from "../loadNewGame.js";
import { standings } from "../standings.js";
import { fileAlbumPages } from "./fileAlbumPages.js";

const FIRST = "flamengo-rj";
const SECOND = "palmeiras-sp";
const SEED = 6;

/** A hot-seat season of two Série A coaches played to its end: the game on its last day and the day after. */
function playSeason(): { last: GameState; next: GameState } {
  let state = loadNewGame(SEED, { coachClubId: FIRST, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: SECOND }] } });
  for (;;) {
    const day = advanceDay(state, {});
    if (day.events.some((e) => e.type === "seasonEnded")) return { last: state, next: day.state };
    state = day.state;
  }
}

/** Each coach's record with the club he started the season at, whether or not he still runs it. */
const recordsOf = (state: GameState): [string, CoachRecord][] => {
  const clubOf = (name: string | undefined) => (name === "Ana" ? FIRST : SECOND);
  return [[clubOf(state.coachName), state.history.coach], ...(state.waitingCoaches ?? []).map((waiting): [string, CoachRecord] => [clubOf(waiting.name), waiting.record])];
};

const isLastStage = (competition: Competition | undefined, stage: number) => !!competition && stage === competition.stageDates.length - 1;

describe("a season's album, played", () => {
  const { last, next } = playSeason();
  const season = last.season;

  it("gives each coach a page of his club only, with each player's games and goals for it while he ran it", () => {
    const ranToTheEnd = new Set([last.coachClubId, ...(last.waitingCoaches ?? []).map((w) => w.clubId)]);
    expect(ranToTheEnd.has(SECOND)).toBe(true);
    for (const [clubId, record] of recordsOf(next)) {
      expect(record.album?.map((page) => [page.season, page.clubId])).toEqual([[season, clubId]]);
      const totals = next.history.players[clubId] ?? {};
      const stickers = new Map(record.album?.[0]?.stickers.map(([id, , , apps, goals]) => [id, [apps, goals]]));
      expect(Object.keys(totals).length).toBeGreaterThan(15);
      for (const [id, total] of Object.entries(totals)) {
        const [apps = 0, goals = 0] = stickers.get(id) ?? [];
        // A coach sacked during the season has the games he ran; the club's history has them all.
        if (ranToTheEnd.has(clubId)) expect([id, apps, goals]).toEqual([id, total.apps, total.goals]);
        else expect(apps <= total.apps && goals <= total.goals).toBe(true);
      }
    }
  });

  it("starts the next season's count empty", () => {
    expect(next.history.current.squads).toEqual({});
  });

  it("keeps every final a coach's club played, with its score, won when his club took the cup", () => {
    const champions = next.history.seasons.at(-1)?.champions ?? {};
    let finals = 0;
    for (const [clubId, record] of recordsOf(next)) {
      const isHisDay = (date: string) => record.stints.some((stint) => stint.clubId === clubId && stint.from <= date && (stint.until === null || date < stint.until));
      const played = last.fixtures.filter((f) => {
        const competition = last.competitions[f.competitionId];
        return isLastStage(competition, f.stage) && competition?.stages[f.stage]?.kind === "knockout" && (f.homeId === clubId || f.awayId === clubId) && isHisDay(f.date);
      });
      const deciding = played.filter((f) => !played.some((g) => g.tie === f.tie && g.competitionId === f.competitionId && g.date > f.date));
      const keptFinals = (record.keptMatches ?? []).filter((m) => m.kind === "final");
      expect(keptFinals.map((m) => m.fixture.id).sort()).toEqual(deciding.map((f) => f.id).sort());
      for (const final of keptFinals) {
        const fixture = deciding.find((f) => f.id === final.fixture.id);
        expect(final.fixture.result).toEqual(fixture?.result);
        expect(final.isWon).toBe(champions[competitionKey(final.fixture.competitionId)] === clubId);
        const goals = final.events.filter((e) => e.type === "goal");
        expect(goals.length).toBe((fixture?.result?.homeGoals ?? 0) + (fixture?.result?.awayGoals ?? 0));
        expect(final.starters).toHaveLength(22);
      }
      finals += keptFinals.length;
    }
    expect(finals).toBeGreaterThan(0);
  });

  it("keeps the match that won a coach's club the league, the first one after which nobody could catch it", () => {
    const champions = next.history.seasons.at(-1)?.champions ?? {};
    for (const [clubId, record] of recordsOf(next)) {
      const won = (record.keptMatches ?? []).filter((m) => m.kind === "league");
      const leagues = Object.values(last.competitions).filter((c) => c.kind === "league" && champions[competitionKey(c.id)] === clubId && record.trophies.some((t) => t.competition === competitionKey(c.id)));
      expect(won.map((m) => competitionKey(m.fixture.competitionId)).sort()).toEqual(leagues.map((c) => competitionKey(c.id)).sort());
      for (const match of won) {
        const competition = last.competitions[match.fixture.competitionId];
        const table = competition?.clubIds ?? [];
        const own = last.fixtures.filter((f) => f.competitionId === match.fixture.competitionId);
        const pointsAfter = (until: string) => standings(table, own.filter((f) => f.result && f.date <= until), competition?.drawOrder ?? []);
        const gamesLeft = (id: string, after: string) => own.filter((f) => f.date > after && (f.homeId === id || f.awayId === id)).length;
        const [leader, ...rest] = pointsAfter(match.fixture.date);
        expect(leader?.clubId).toBe(clubId);
        expect(rest.every((row) => row.points + 3 * gamesLeft(row.clubId, match.fixture.date) < (leader?.points ?? 0)) || gamesLeft(clubId, match.fixture.date) === 0).toBe(true);
      }
    }
  });
});

describe("a save from before the album", () => {
  it("counts a squad from the first day it plays after loading, and its page says so", () => {
    let state = loadNewGame(SEED, { coachClubId: FIRST });
    const playedBy = (game: GameState) => game.fixtures.filter((f) => f.result && (f.homeId === FIRST || f.awayId === FIRST)).length;
    while (playedBy(state) < 2) state = advanceDay(state, {}).state;
    const { squads: _dropped, ...current } = state.history.current;
    state = { ...state, history: { ...state.history, current } };
    while (playedBy(state) < 3) state = advanceDay(state, {}).state;
    const since = state.history.current.squadsSince;
    expect(since).toBe(state.fixtures.filter((f) => f.result && (f.homeId === FIRST || f.awayId === FIRST)).map((f) => f.date).sort().at(-1));
    const record = { season: state.season, champions: {}, topScorers: {}, promoted: { A: [], B: [], C: [], D: [] }, relegated: { A: [], B: [], C: [], D: [] }, tables: { A: [], B: [], C: [], D: [] } };
    const page = fileAlbumPages(state, record).coach.album?.[0];
    expect(page?.since).toBe(since);
    expect(Math.max(...(page?.stickers.map(([, , , apps]) => apps) ?? []))).toBe(1);
  });
});
