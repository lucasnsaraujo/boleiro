import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import { coachesByClub } from "../coach/aiCoaches.js";
import { humanKey } from "../coach/closeCoachSeason.js";
import { answerEvent } from "../events/runEvents.js";
import { eventMemoryOf, type PendingEvent } from "../events/eventMemory.js";
import type { Fixture, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { coachRivalriesOf, coachRivalryScore, recordCoachMeetings, winnerOf } from "./coachRivalries.js";
import { pairKeyOf, rivalryMemoryOf } from "./rivalryMemory.js";

const COACH = "flamengo-rj";
const start = loadNewGame(4, { coachClubId: COACH, hotSeat: { coachName: "Ana", otherCoaches: [] } });
const ANA = humanKey("Ana");
const firstGame = start.fixtures.filter((f) => (f.homeId === COACH || f.awayId === COACH) && f.date >= start.date).sort((a, b) => a.date.localeCompare(b.date))[0];
if (!firstGame) throw new Error("no Flamengo game");
let eve = start;
while (eve.date < firstGame.date) eve = advanceDay(eve, {}).state;
const opponentId = firstGame.homeId === COACH ? firstGame.awayId : firstGame.homeId;
const aiCoach = coachesByClub(eve.coaches ?? { coaches: {} }).get(opponentId);
if (!aiCoach) throw new Error(`no coach at ${opponentId}`);

const withRecord = (state: GameState, record: { meetings: number; anaWins: number; aiWins: number }): GameState => {
  const key = pairKeyOf(ANA, aiCoach.id);
  const [a, b] = key.split("|") as [string, string];
  const isAnaFirst = a === ANA;
  const rivalry = {
    a, b, meetings: record.meetings, draws: record.meetings - record.anaWins - record.aiWins, finals: 0, clashes: 0, lastMet: "2025-11-01",
    aWins: isAnaFirst ? record.anaWins : record.aiWins, bWins: isAnaFirst ? record.aiWins : record.anaWins,
  };
  return { ...state, rivalries: { coaches: { [key]: rivalry }, derbyWins: {} } };
};
const newsOf = (state: GameState) => eventMemoryOf(state).news.filter((n) => n.date === eve.date);

describe("coach against coach", () => {
  it("records each meeting of the human coach with the AI coach across the touchline", () => {
    const after = advanceDay(eve, {}).state;
    const [rivalry] = coachRivalriesOf(after, ANA);
    expect(rivalry).toMatchObject({ opponent: aiCoach.id, meetings: 1 });
    expect((rivalry?.wins ?? 0) + (rivalry?.losses ?? 0) + (rivalry?.draws ?? 0)).toBe(1);
  });

  it("weighs a final more than a league meeting", () => {
    const cup = Object.values(eve.competitions).find((c) => c.kind === "cup");
    if (!cup) throw new Error("no cup");
    const meeting = (fixture: Partial<Fixture>) => {
      const played: Fixture = { ...firstGame, ...fixture, result: { homeGoals: 1, awayGoals: 0 } };
      const [rivalry] = coachRivalriesOf(recordCoachMeetings(eve, [played], eve), ANA);
      return coachRivalryScore(rivalry ?? { meetings: 0, finals: 0, clashes: 0 });
    };
    expect(meeting({ competitionId: cup.id, stage: cup.stageDates.length - 1 })).toBeGreaterThan(meeting({}));
  });

  it("counts a heated press answer about the rival as a clash with its coach", () => {
    const rivalId = "fluminense-rj";
    const rivalCoach = coachesByClub(eve.coaches ?? { coaches: {} }).get(rivalId);
    const pending: PendingEvent = {
      typeId: "press-rival", date: eve.date, clubId: COACH, rivalId, area: "press", look: "press", headline: "Coletiva", body: "", setting: "",
      choices: [{ label: "calmo", effects: { rivalry: 1 } }, { label: "provoca", effects: { fans: 5, rivalry: 4 } }], assistantChoice: 0, expiresOn: eve.date,
    };
    const memory = eventMemoryOf(eve);
    const asked: GameState = { ...eve, eventMemory: { ...memory, pending: { ...memory.pending, [COACH]: pending } } };
    const answered = answerEvent(asked, COACH, 1).state;
    expect(rivalryMemoryOf(answered).coaches[pairKeyOf(ANA, rivalCoach?.id ?? "")]?.clashes).toBe(1);
  });
});

describe("coach rivalries in the newspaper", () => {
  it("call a meeting between old rivals a reencontro", () => {
    const after = advanceDay(withRecord(eve, { meetings: 6, anaWins: 2, aiWins: 2 }), {}).state;
    expect(newsOf(after).some((n) => n.kind === "rivalry" && n.headline.includes("Reencontro") && n.body.includes(aiCoach.name))).toBe(true);
  });

  it("call a coach who keeps losing to the same man a freguesia", () => {
    const record = withRecord(eve, { meetings: 3, anaWins: 3, aiWins: 0 });
    const won = Array.from({ length: 40 }, (_, seed) => advanceDay({ ...record, seed, rngState: seed }, {}).state).find((after) => {
      const played = after.fixtures.find((f) => f.id === firstGame.id);
      return played && winnerOf(played) === COACH;
    });
    if (!won) throw new Error("Flamengo never won in forty draws");
    expect(newsOf(won).some((n) => n.kind === "rivalry" && n.headline.includes("Freguesia") && n.headline.includes(aiCoach.name))).toBe(true);
  });

  it("let the rival's crowd boo a long-serving Flamengo coach when he visits Fluminense", () => {
    const today = eve.fixtures.filter((f) => f.date === eve.date);
    const fluGame = today.find((f) => f.homeId === "fluminense-rj" || f.awayId === "fluminense-rj");
    const fluOpponent = fluGame && (fluGame.homeId === "fluminense-rj" ? fluGame.awayId : fluGame.homeId);
    const fixtures = eve.fixtures.map((f) => {
      if (f.id === firstGame.id) return { ...f, homeId: "fluminense-rj", awayId: COACH };
      if (fluGame && f.id === fluGame.id && fluOpponent) return { ...f, homeId: opponentId, awayId: fluOpponent };
      return f;
    });
    const stint = { clubId: COACH, from: "2019-01-01", until: null, left: null };
    const idol: GameState = { ...eve, fixtures, history: { ...eve.history, coach: { ...eve.history.coach, stints: [stint] } } };
    const booed = newsOf(advanceDay(idol, {}).state).filter((n) => n.headline.includes("vaia"));
    expect(booed.map((n) => n.headline)).toEqual(["Torcida do Fluminense vaia Ana"]);
    expect(newsOf(advanceDay({ ...eve, fixtures }, {}).state).some((n) => n.headline.includes("vaia"))).toBe(false);
  });
});
