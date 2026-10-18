import { describe, expect, it } from "vitest";
import type { DayEvent } from "../advanceDay.js";
import { advanceDay } from "../advanceDay.js";
import { addDays } from "../dates.js";
import type { Fixture, GameState } from "../gameState.js";
import type { CoachRecord, SeasonRecord } from "../history/history.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { closeMoment, nextMoment, type Moment } from "./careerMoments.js";
import { retireCoach } from "./retireCoach.js";
import { openMoments, runMoments } from "./runMoments.js";
import { LONG_CELEBRATION_S } from "./titleStory.js";

const FLA = "flamengo-rj";
const BAHIA = "bahia-ba";
const base = loadNewGame(4, { coachClubId: FLA });
// Flamengo keeps its AI coach in a game the coach starts at Bahia.
const atBahia = loadNewGame(4, { coachClubId: BAHIA });
const today = base.date;

/** The coach with `record` in place of his own, at `clubId` (none when null). */
function withCoach(state: GameState, clubId: string | null, record: Partial<CoachRecord>): GameState {
  return { ...state, coachClubId: clubId, history: { ...state.history, coach: { ...state.history.coach, ...record } } };
}

/** The game with the moments engine already watching the coach, as after his first day. */
function watched(state: GameState, change: (moments: NonNullable<CoachRecord["moments"]>) => Partial<NonNullable<CoachRecord["moments"]>> = () => ({})): GameState {
  const record = state.history.coach;
  const moments = openMoments(state, { name: state.coachName, record });
  return { ...state, history: { ...state.history, coach: { ...record, moments: { ...moments, ...change(moments) } } } };
}

/** The game the next morning, with `change` applied to it: what the day did. */
function nextDay(state: GameState, change: (state: GameState) => GameState = (s) => s): GameState {
  return change({ ...state, date: addDays(state.date, 1) });
}

const queueOf = (state: GameState): Moment[] => state.history.coach.moments?.queue ?? [];
const kindsOf = (state: GameState) => queueOf(state).map((moment) => moment.kind);

function played(homeId: string, awayId: string, homeGoals: number, awayGoals: number, date = today): DayEvent {
  const fixture: Fixture = { id: `t-${homeId}-${awayId}-${date}`, competitionId: "serie-a-2026", stage: 0, date, homeId, awayId, result: { homeGoals, awayGoals } };
  return { type: "matchPlayed", fixture };
}

const longAtFlamengo = (until: string | null, left: "contractEnded" | "moved" | "fired" | "resigned" | null) => ({
  stints: [{ clubId: FLA, from: "2019-01-01", until, left }, ...(until ? [{ clubId: BAHIA, from: until, until: null, left: null }] : [])],
  trophies: [],
});

describe("idol status", () => {
  it("crowns the coach an idol the day his years at the club cross the line, and only once", () => {
    const before = watched(withCoach(base, FLA, { stints: [{ clubId: FLA, from: addDays(today, -1826), until: null, left: null }] }));
    const after = runMoments(nextDay(before), before, []).state;
    expect(kindsOf(after)).toEqual(["idol"]);
    const idol = queueOf(after)[0];
    expect(idol?.kind === "idol" && idol.standing).toBe(80);
    expect(idol?.kind === "idol" && idol.ledger.map((entry) => entry.cause)).toEqual(["years"]);
    const later = runMoments(nextDay(after), after, []).state;
    expect(kindsOf(later)).toEqual(["idol"]);
  });

  it("is not crowned after four years without titles or derbies", () => {
    const before = watched(withCoach(base, FLA, { stints: [{ clubId: FLA, from: addDays(today, -1461), until: null, left: null }] }));
    expect(kindsOf(runMoments(nextDay(before), before, []).state)).toEqual([]);
  });

  it("counts a title in the fans' ledger, so a title can make him an idol", () => {
    const before = watched(withCoach(base, FLA, { stints: [{ clubId: FLA, from: addDays(today, -1300), until: null, left: null }] }));
    const after = runMoments(nextDay(before, (s) => withCoach(s, FLA, { trophies: [{ season: 2026, competition: "copa-do-brasil", clubId: FLA }] })), before, []).state;
    expect(kindsOf(after)).toEqual(["title", "idol"]);
  });
});

describe("leaving a club", () => {
  const atFlamengo = watched(withCoach(base, FLA, { stints: [{ clubId: FLA, from: "2023-01-01", until: null, left: null }], trophies: [{ season: 2024, competition: "serie-a", clubId: FLA }] }));
  const left = (how: "fired" | "resigned" | "moved" | "contractEnded", toClubId: string | null = null) =>
    nextDay(atFlamengo, (s) =>
      withCoach(s, toClubId, {
        stints: [{ clubId: FLA, from: "2023-01-01", until: today, left: how }, ...(toClubId ? [{ clubId: toClubId, from: today, until: null, left: null }] : [])],
        firings: how === "fired" ? [{ clubId: FLA, date: today, position: 17, targetPosition: 1 }] : [],
      }),
    );

  it("plays the night sacking after a firing, with the last results and the pressure before it", () => {
    const board = atFlamengo.boards[FLA];
    if (!board) throw new Error("no Flamengo board");
    const pressed = { ...atFlamengo, boards: { ...atFlamengo.boards, [FLA]: { ...board, games: 12, pressure: 0.9 } } };
    const before = runMoments(nextDay(pressed), pressed, [played(FLA, "vasco-rj", 0, 2)]).state;
    expect(before.history.coach.moments?.ultimatumOn).toBe(today);
    const fired = { ...left("fired"), history: { ...left("fired").history, coach: { ...left("fired").history.coach, moments: before.history.coach.moments } } };
    const after = runMoments(fired, { ...before, date: today }, [played("fluminense-rj", FLA, 3, 0)]).state;
    const sacking = queueOf(after).find((moment) => moment.kind === "sacking");
    expect(sacking).toMatchObject({ kind: "sacking", clubId: FLA, position: 17, targetPosition: 1, ultimatumOn: today });
    expect(sacking?.kind === "sacking" && sacking.run.map((mark) => [mark.opponentId, mark.goalsFor, mark.goalsAgainst])).toEqual([
      ["vasco-rj", 0, 2],
      ["fluminense-rj", 0, 3],
    ]);
  });

  it("prints the ultimatum only when the board is near its firing line", () => {
    const after = runMoments(nextDay(atFlamengo), atFlamengo, [played(FLA, "vasco-rj", 0, 2)]).state;
    expect(after.history.coach.moments?.ultimatumOn).toBeNull();
    expect((after.eventMemory?.news ?? []).filter((item) => item.kind === "career")).toEqual([]);
  });

  it("gives a send-off after three years and a title when he moves on", () => {
    expect(kindsOf(runMoments(left("moved", BAHIA), atFlamengo, []).state)).toEqual(["sendOff"]);
  });

  it("leaves a quiet note when he resigns, however long he stayed", () => {
    const quiet = queueOf(runMoments(left("resigned"), atFlamengo, []).state);
    expect(quiet).toMatchObject([{ kind: "quietExit", how: "resigned", titles: 1 }]);
  });

  it("leaves a quiet note when a short spell without titles ends", () => {
    const short = watched(withCoach(base, FLA, { stints: [{ clubId: FLA, from: "2025-06-01", until: null, left: null }] }));
    const ended = nextDay(short, (s) => withCoach(s, null, { stints: [{ clubId: FLA, from: "2025-06-01", until: today, left: "contractEnded" }] }));
    expect(queueOf(runMoments(ended, short, []).state)).toMatchObject([{ kind: "quietExit", how: "contractEnded" }]);
  });
});

/** A filed season where `clubId` finished second in Série A. */
const secondIn = (season: number, clubId: string): SeasonRecord => ({
  season,
  champions: { "serie-a": "palmeiras-sp" },
  topScorers: {},
  promoted: { A: [], B: [], C: [], D: [] },
  relegated: { A: [], B: [], C: [], D: [] },
  tables: { A: ["palmeiras-sp", clubId], B: [], C: [], D: [] },
});

describe("titles weighed by their story", () => {
  const won = (state: GameState) => withCoach(state, FLA, { trophies: [...state.history.coach.trophies, { season: 2026, competition: "serie-a", clubId: FLA }] });

  it("throws a quick party for a title in the coach's first season", () => {
    const before = watched(withCoach(base, FLA, { stints: [{ clubId: FLA, from: today, until: null, left: null }] }));
    const title = queueOf(runMoments(nextDay(before, won), before, []).state)[0];
    expect(title?.kind).toBe("title");
    expect(title?.kind === "title" && title.seconds).toBeLessThan(LONG_CELEBRATION_S);
    expect(title?.kind === "title" && title.story.careerTitles).toBe(1);
  });

  it("throws the long one after seven seasons of waiting and two second places with him", () => {
    const history = { ...base.history, seasons: [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((season) => secondIn(season, season >= 2024 ? FLA : "gremio-rs")) };
    const before = watched(withCoach({ ...base, history }, FLA, { stints: [{ clubId: FLA, from: "2019-01-01", until: null, left: null }] }));
    const title = queueOf(runMoments(nextDay(before, won), before, []).state).find((moment) => moment.kind === "title");
    expect(title?.kind === "title" && title.story).toMatchObject({ seasonInSpell: 8, lastWon: null, droughtFrom: 2019, runnerUps: [2024, 2025] });
    expect(title?.kind === "title" && title.seconds).toBeGreaterThanOrEqual(LONG_CELEBRATION_S);
  });
});

describe("tributes", () => {
  it("celebrates the coach's 100th game at the club once", () => {
    const before = watched(withCoach(base, FLA, { stints: [{ clubId: FLA, from: "2024-01-01", until: null, left: null }] }), () => ({ games: { [FLA]: [50, 30, 19] } }));
    const after = runMoments(nextDay(before), before, [played(FLA, "vasco-rj", 1, 0)]).state;
    expect(queueOf(after)).toMatchObject([{ kind: "milestone", milestone: "games", count: 100 }]);
    const again = runMoments(nextDay(after), after, [played(FLA, "botafogo-rj", 1, 0, addDays(today, 1))]).state;
    expect(kindsOf(again)).toEqual(["milestone"]);
  });

  it("is applauded as the visitor at a former club whose idol he is, but not at one where he stayed a year", () => {
    const longAgo = watched(withCoach(base, BAHIA, longAtFlamengo("2025-12-31", "contractEnded")));
    expect(kindsOf(runMoments(nextDay(longAgo), longAgo, [played(FLA, BAHIA, 2, 1)]).state)).toEqual(["homecoming"]);
    const brief = watched(withCoach(base, BAHIA, { stints: [{ clubId: FLA, from: "2025-01-01", until: "2025-12-31", left: "contractEnded" }, { clubId: BAHIA, from: "2025-12-31", until: null, left: null }] }));
    expect(kindsOf(runMoments(nextDay(brief), brief, [played(FLA, BAHIA, 2, 1)]).state)).toEqual([]);
  });

  const veteran = Object.values(base.players).find((p) => p.clubId === FLA);
  if (!veteran) throw new Error("no Flamengo player");
  const withApps = (apps: number) => {
    const players = { ...base.history.players, [FLA]: { ...base.history.players[FLA], [veteran.id]: { name: veteran.name, apps, goals: 4 } }, "vasco-rj": { [veteran.id]: { name: veteran.name, apps: 30, goals: 1 } } };
    return watched(withCoach({ ...base, history: { ...base.history, players } }, FLA, { stints: [{ clubId: FLA, from: "2020-01-01", until: null, left: null }] }));
  };

  it("pays tribute to an idol of the club who retires, not to a squad player", () => {
    const retired: DayEvent = { type: "playerRetired", playerId: veteran.id, clubId: FLA, name: veteran.name, age: 36 };
    expect(kindsOf(runMoments(nextDay(withApps(160)), withApps(160), [retired]).state)).toContain("idolRetired");
    expect(kindsOf(runMoments(nextDay(withApps(20)), withApps(20), [retired]).state)).not.toContain("idolRetired");
  });

  it("books a farewell match for an idol who announces his last season, and celebrates it when it is played", () => {
    const announced: DayEvent = { type: "playerWantsToRetire", playerId: veteran.id, clubId: FLA, name: veteran.name, age: 36, afterSeason: 2026 };
    const booked = runMoments(nextDay(withApps(160)), withApps(160), [announced]).state;
    const farewell = booked.friendlies?.find((friendly) => friendly.farewellOf?.playerId === veteran.id);
    expect(farewell).toMatchObject({ homeId: FLA, awayId: "vasco-rj", fee: 0 });
    if (!farewell) return;
    const played: DayEvent = { type: "friendlyPlayed", friendly: { ...farewell, result: { homeGoals: 4, awayGoals: 3 } }, gate: 0 };
    const after = runMoments(nextDay(booked), booked, [played]).state;
    expect(queueOf(after)).toMatchObject([{ kind: "testimonial", playerId: veteran.id, homeGoals: 4, awayGoals: 3 }]);
  });
});

describe("the story at the clubs he left", () => {
  const successorAt = (state: GameState, from: string): GameState => {
    const coaches = state.coaches;
    const successor = coaches && Object.values(coaches.coaches).find((coach) => coach.clubId === FLA);
    if (!coaches || !successor) throw new Error("no AI coach at Flamengo");
    const stints = successor.stints.map((stint, index) => (index === successor.stints.length - 1 ? { ...stint, from } : stint));
    return { ...state, coaches: { ...coaches, coaches: { ...coaches.coaches, [successor.id]: { ...successor, stints } } } };
  };
  const withResults = (state: GameState, flamengoGoals: number): GameState => {
    let set = 0;
    const fixtures = state.fixtures.map((f) => {
      if (set >= 10 || (f.homeId !== FLA && f.awayId !== FLA) || f.result) return f;
      set++;
      return { ...f, date: today, result: f.homeId === FLA ? { homeGoals: flamengoGoals, awayGoals: 1 } : { homeGoals: 1, awayGoals: flamengoGoals } };
    });
    return { ...state, fixtures };
  };
  const left = watched(successorAt(withCoach(atBahia, BAHIA, longAtFlamengo("2025-12-31", "contractEnded")), today), () => ({ games: { [FLA]: [20, 5, 5] } }));

  it("compares a worse successor with him in the papers, the fans singing his name", () => {
    const before = withResults(left, 0);
    const news = runMoments(nextDay(before), before, [played(FLA, "vasco-rj", 0, 1)]).state.eventMemory?.news ?? [];
    expect(news.filter((item) => item.kind === "career").map((item) => item.headline)).toEqual(["“Com o técnico era diferente”"]);
  });

  it("says so when the successor does better", () => {
    const before = withResults(left, 3);
    const news = runMoments(nextDay(before), before, [played(FLA, "vasco-rj", 3, 1)]).state.eventMemory?.news ?? [];
    expect(news.filter((item) => item.kind === "career").map((item) => item.headline)[0]).toMatch(/faz o Flamengo esquecer/);
  });
});

describe("former clubs asking him back", () => {
  const idolElsewhere = watched(withCoach(atBahia, BAHIA, longAtFlamengo("2025-12-31", "contractEnded")));
  const jobOpens = (state: GameState): GameState => {
    if (!state.coaches) throw new Error("no AI coaches");
    const board = state.boards[FLA];
    if (!board) throw new Error("no board");
    return { ...state, coaches: { ...state.coaches, openJobs: { [FLA]: today } }, boards: { ...state.boards, [FLA]: { ...board, position: 18 } } };
  };

  it("calls the idol back when the club in crisis opens its job", () => {
    const done = runMoments(nextDay(idolElsewhere, jobOpens), idolElsewhere, []);
    expect(kindsOf(done.state)).toEqual(["comeBack"]);
    expect(done.state.coach.offers).toMatchObject([{ clubId: FLA, isComeBack: true, expiresOn: addDays(today, 14) }]);
    expect(done.events).toMatchObject([{ type: "jobOffered", offer: { clubId: FLA } }]);
  });

  it("doesn't call when no job opens, nor a coach who was never its idol", () => {
    expect(kindsOf(runMoments(nextDay(idolElsewhere), idolElsewhere, []).state)).toEqual([]);
    const stranger = watched(withCoach(atBahia, BAHIA, { stints: [{ clubId: FLA, from: "2025-06-01", until: "2025-12-31", left: "contractEnded" }, { clubId: BAHIA, from: "2025-12-31", until: null, left: null }] }));
    expect(runMoments(nextDay(stranger, jobOpens), stranger, []).state.coach.offers).toEqual([]);
  });
});

describe("the coach's players' achievements", () => {
  const player = { playerId: "p1", name: "Kauã", clubId: FLA, role: "atacante" as const, age: 22, apps: 38, goals: 21, assists: 9, average: 7.8 };
  const awards = (clubId: string): DayEvent => ({
    type: "seasonAwarded",
    season: 2026,
    awards: { competition: "serie-a", bolaDeOuro: { ...player, clubId }, runnersUp: [], bolaDePrata: [], topScorer: { playerId: "p1", name: "Kauã", clubId, goals: 21 }, bestYoung: null, ballonDor: [] },
  });
  const coach = watched(withCoach(base, FLA, { stints: [{ clubId: FLA, from: today, until: null, left: null }] }));

  it("celebrates his player's Bola de Ouro and golden boot, one moment each", () => {
    expect(queueOf(runMoments(nextDay(coach), coach, [awards(FLA)]).state)).toMatchObject([
      { kind: "playerAward", award: "bolaDeOuro", players: [{ name: "Kauã" }] },
      { kind: "playerAward", award: "topScorer" },
    ]);
  });

  it("ignores another club's winners", () => {
    expect(kindsOf(runMoments(nextDay(coach), coach, [awards("palmeiras-sp")]).state)).toEqual([]);
  });
});

describe("one moment at a time", () => {
  const three = watched(base, () => ({
    queue: ["a", "b", "c"].map((id): Moment => ({ id, kind: "playerAward", date: today, clubId: FLA, award: "topScorer", players: [], season: 2026 })),
  }));

  it("shows the oldest moment, then none more that day, then the next one the day after", () => {
    const record = three.history.coach;
    expect(nextMoment(record, today)?.id).toBe("a");
    const closed = closeMoment(record, today);
    expect(nextMoment(closed, today)).toBeNull();
    expect(nextMoment(closed, addDays(today, 1))?.id).toBe("b");
    expect(closed.moments?.past).toEqual([["playerAward", today, FLA]]);
  });
});

describe("determinism and the rest of the game", () => {
  const scene = watched(withCoach(base, BAHIA, longAtFlamengo("2025-12-31", "contractEnded")));
  const day = () => runMoments(nextDay(scene), scene, [played(FLA, BAHIA, 1, 1)]);

  it("finds the same moments from the same day", () => {
    expect(day()).toStrictEqual(day());
  });

  it("changes nothing in the game beyond the coach's moments and the papers' stories", () => {
    const after = day().state;
    const strip = (state: GameState) => ({ ...state, eventMemory: undefined, history: { ...state.history, coach: { ...state.history.coach, moments: undefined } } });
    expect(strip(after)).toStrictEqual(strip(nextDay(scene)));
  });
});

describe("saves", () => {
  it("opens a save from before moments quietly: what already happened is not celebrated again", () => {
    const old = withCoach(base, FLA, { stints: [{ clubId: FLA, from: "2019-01-01", until: null, left: null }], trophies: [{ season: 2025, competition: "serie-a", clubId: FLA }] });
    const after = advanceDay(old, {}).state;
    expect(after.history.coach.moments).toMatchObject({ queue: [], idolOf: [FLA], seen: { closedStints: 0, trophies: 1 } });
  });

  it("round-trips the moments", () => {
    const after = runMoments(nextDay(watched(base)), watched(base), [played(FLA, "vasco-rj", 2, 0)]).state;
    expect(loadGame(saveGame(after)).history.coach.moments).toStrictEqual(after.history.coach.moments);
  });
});

describe("retirement", () => {
  it("puts the farewell first, leaves the club and hears from no club again", () => {
    const retired = retireCoach(watched(base));
    expect(nextMoment(retired.history.coach, retired.date)).toMatchObject({ kind: "retirement", clubId: FLA });
    expect(retired.coachClubId).toBeNull();
    expect(retired.history.coach.stints.at(-1)).toMatchObject({ left: "retired", until: today });
    let later = retired;
    for (let i = 0; i < 45; i++) later = advanceDay(later, {}).state;
    expect(later.coach.offers).toEqual([]);
    expect(kindsOf(later)).toEqual(["retirement"]);
  });
});

describe("hot-seat", () => {
  it("queues a waiting coach's title in his own record", () => {
    const game = loadNewGame(4, { coachClubId: FLA, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bia", clubId: "palmeiras-sp" }] } });
    const after = nextDay(game, (s) => ({
      ...s,
      waitingCoaches: s.waitingCoaches?.map((waiting) => ({ ...waiting, record: { ...waiting.record, trophies: [{ season: 2026, competition: "serie-a", clubId: "palmeiras-sp" }] } })),
    }));
    const done = runMoments(after, game, []).state;
    expect(kindsOf(done)).toEqual([]);
    expect(done.waitingCoaches?.[0]?.record.moments?.queue.map((moment) => moment.kind)).toEqual(["title"]);
  });
});
