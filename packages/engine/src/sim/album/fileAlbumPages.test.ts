import { describe, expect, it } from "vitest";
import type { GameState } from "../gameState.js";
import { IDOL_APPS } from "../history/clubHistory.js";
import type { AwardedPlayer, SeasonRecord } from "../history/history.js";
import { loadNewGame } from "../loadNewGame.js";
import { SHINE, type SquadMark } from "./album.js";
import { fileAlbumPages } from "./fileAlbumPages.js";

const CLUB = "bahia-ba";
const OTHER = "vitoria-ba";

const opening = loadNewGame(3, { coachClubId: CLUB, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: OTHER }] } });
const squadOf = (state: GameState, clubId: string) => Object.values(state.players).filter((p) => p.clubId === clubId);
const NO_TABLES = { A: [], B: [], C: [], D: [] };
const filed = (extra: Partial<SeasonRecord> = {}): SeasonRecord => ({ season: opening.season, champions: {}, topScorers: {}, promoted: NO_TABLES, relegated: NO_TABLES, tables: NO_TABLES, ...extra });
const close = (state: GameState, record = filed()) => fileAlbumPages(state, record);

/** The opening game with this season's counts for the two coaches' clubs and each club's totals as the history keeps them. */
function withSeason(squads: Record<string, Record<string, SquadMark>>, totals: Record<string, Record<string, { apps: number; goals: number }>> = {}): GameState {
  const players = Object.fromEntries(
    Object.entries(squads).map(([clubId, marks]) => [
      clubId,
      Object.fromEntries(Object.entries(marks).map(([id, [apps, goals]]) => [id, { name: opening.players[id]?.name ?? id, ...(totals[clubId]?.[id] ?? { apps, goals }) }])),
    ]),
  );
  return { ...opening, history: { ...opening.history, players, current: { ...opening.history.current, squads } } };
}

describe("a season's album pages", () => {
  const [striker, keeper, unused] = squadOf(opening, CLUB);
  const [rival] = squadOf(opening, OTHER);
  if (!striker || !keeper || !unused || !rival) throw new Error("the clubs have no squads");
  const season = withSeason({ [CLUB]: { [striker.id]: [30, 12, "atacante"], [keeper.id]: [38, 0, "goleiro"] }, [OTHER]: { [rival.id]: [20, 3, "meia"] } });
  const closed = close(season);
  const page = closed.coach.album?.find((p) => p.season === opening.season);

  it("prints the coach a page of his club with each player's games and goals for it", () => {
    expect(page?.clubId).toBe(CLUB);
    expect(page?.stickers.find(([id]) => id === striker.id)?.slice(3, 5)).toEqual([30, 12]);
    expect(page?.stickers.find(([id]) => id === keeper.id)?.slice(3, 5)).toEqual([38, 0]);
  });

  it("prints the rest of the squad he ends the season with, with no games", () => {
    expect(page?.stickers.find(([id]) => id === unused.id)?.slice(3, 5)).toEqual([0, 0]);
    expect(page?.stickers).toHaveLength(squadOf(opening, CLUB).length);
  });

  it("puts the goalkeepers first and the forwards last", () => {
    const roles = page?.stickers.map(([, , role]) => role) ?? [];
    expect(roles[0]).toBe("goleiro");
    expect(roles.at(-1)).toBe("atacante");
  });

  it("makes the club's top scorer of the season shine, and nobody else on a page with no idol or award", () => {
    const shining = page?.stickers.filter(([, , , , , shine]) => shine !== 0) ?? [];
    expect(shining.map(([id, , , , , shine]) => [id, shine])).toEqual([[striker.id, SHINE.topScorer]]);
  });

  it("gives each hot-seat coach his own club's page", () => {
    const waiting = closed.waitingCoaches?.[0]?.record.album ?? [];
    expect(waiting.map((p) => p.clubId)).toEqual([OTHER]);
    expect(waiting[0]?.stickers.find(([id]) => id === rival.id)?.slice(3, 5)).toEqual([20, 3]);
    expect(closed.coach.album?.map((p) => p.clubId)).toEqual([CLUB]);
  });
});

describe("what makes a sticker shine", () => {
  const [veteran, scorer] = squadOf(opening, CLUB);
  if (!veteran || !scorer) throw new Error("the club has no squad");

  it("shines a player whose games for the club make him an idol", () => {
    const closed = close(withSeason({ [CLUB]: { [veteran.id]: [20, 1, "zagueiro"] } }, { [CLUB]: { [veteran.id]: { apps: IDOL_APPS, goals: 1 } } }));
    const sticker = closed.coach.album?.[0]?.stickers.find(([id]) => id === veteran.id);
    expect((sticker?.[5] ?? 0) & SHINE.idol).toBe(SHINE.idol);
  });

  it("shines a competition's top scorer", () => {
    const record = filed({ topScorers: { "copa-do-brasil": { playerId: scorer.id, name: scorer.name, clubId: CLUB, goals: 4 } } });
    const closed = close(withSeason({ [CLUB]: { [scorer.id]: [10, 2, "atacante"] } }), record);
    expect(closed.coach.album?.[0]?.stickers.find(([id]) => id === scorer.id)?.[5]).toBe(SHINE.topScorer);
  });

  it("shines the season's award winners", () => {
    const silver: AwardedPlayer = { playerId: veteran.id, name: veteran.name, clubId: CLUB, role: "zagueiro", age: 30, apps: 30, goals: 0, assists: 0, average: 7.4 };
    const awards = { competition: "serie-a", bolaDeOuro: null, runnersUp: [], bolaDePrata: [silver], topScorer: null, bestYoung: null, ballonDor: [] };
    const closed = close(withSeason({ [CLUB]: { [veteran.id]: [30, 0, "zagueiro"] } }), filed({ awards }));
    expect(closed.coach.album?.[0]?.stickers.find(([id]) => id === veteran.id)?.[5]).toBe(SHINE.award);
  });

  it("leaves a club's top scorer dull when he scored too few to be one", () => {
    const closed = close(withSeason({ [CLUB]: { [scorer.id]: [10, 2, "atacante"] } }));
    expect(closed.coach.album?.[0]?.stickers.find(([id]) => id === scorer.id)?.[5]).toBe(0);
  });
});

describe("a season closed without its count", () => {
  it("prints no page when the save from before the album played no match of its own after loading", () => {
    const current = { ...opening.history.current };
    Reflect.deleteProperty(current, "squads");
    const closed = close({ ...opening, history: { ...opening.history, current } });
    expect(closed.coach.album ?? []).toEqual([]);
    expect(closed.waitingCoaches?.[0]?.record.album ?? []).toEqual([]);
  });
});
