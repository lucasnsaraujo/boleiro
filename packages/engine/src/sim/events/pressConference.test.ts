import { describe, expect, it } from "vitest";
import { coachesByClub } from "../coach/aiCoaches.js";
import { addDays } from "../dates.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { clubMood } from "../morale/clubMood.js";
import { eventMemoryOf, eventsOf, pendingEventOf } from "./eventMemory.js";
import type { EventType, PressQuestionType } from "./eventType.js";
import { fillSlots } from "./fillSlots.js";
import { answerEvent, runEvents } from "./runEvents.js";

const CLUB = "flamengo-rj";
const start = loadNewGame(5, { coachClubId: CLUB });
const AI_CLUB = Object.values(start.clubs).find((club) => club.division === "A" && club.id !== CLUB)?.id ?? "";

const question = (id: string, morale: number, fits = true): PressQuestionType => ({
  id,
  cast: (_scene, cast) => (fits ? cast : null),
  asks: [`${id}: pergunta um?`, `${id}: pergunta dois?`, `${id}: pergunta três?`],
  choices: [
    { label: `${id} sim`, effects: { morale } },
    { label: `${id} talvez`, effects: { fans: 1 } },
    { label: `${id} não`, effects: { board: 1 } },
  ],
  assistantChoice: 2,
});

const conference = (fields: Partial<EventType> = {}): EventType => ({
  id: "conference",
  area: "press",
  topic: "press",
  look: "press",
  weight: 1,
  cooldownDays: 400,
  cast: () => ({}),
  texts: [{ headline: "Coletiva no {club}", body: "“Primeira pergunta?”" }],
  choices: [
    { label: "abre sim", effects: { morale: 2 } },
    { label: "abre talvez", effects: { fans: 2 } },
    { label: "abre não", effects: { board: 2 } },
  ],
  followUps: [question("a", 3), question("b", 4), question("c", 5), question("never", 9, false)],
  ...fields,
});

/** Runs the days' events until one waits for the coach of `clubId`. */
function untilPending(state: GameState, bank: readonly EventType[], clubId = CLUB): GameState {
  let next = state;
  for (let day = 0; day < 200 && !pendingEventOf(next, clubId); day++) next = runEvents({ ...next, date: addDays(state.date, day + 1) }, addDays(state.date, day), [], bank).state;
  return next;
}

describe("a press conference", () => {
  it("asks its opening question and two follow-ups that fit the day, one at a time", () => {
    const bank = [conference()];
    const asked = untilPending(start, bank);
    const pending = pendingEventOf(asked, CLUB);
    expect(pending?.questions).toHaveLength(3);
    expect(pending?.questions?.[0]?.id).toBe("conference");
    expect(pending?.questions?.map((q) => q.id)).not.toContain("never");
    expect(pending?.body).toBe("“Primeira pergunta?”");
    expect(pending?.choices.map((c) => c.label)).toEqual(["Abre sim", "Abre talvez", "Abre não"]);

    const first = answerEvent(asked, CLUB, 0, bank);
    expect(clubMood(first.state, CLUB).squad).toBe(clubMood(asked, CLUB).squad + 2);
    expect(first.event.questionsLeft).toBe(2);
    const second = pendingEventOf(first.state, CLUB);
    expect(second?.body).toMatch(/pergunta/);
    expect(second?.choices).toHaveLength(3);
    expect(second?.assistantChoice).toBe(2);

    const secondId = second?.questions?.[1]?.id ?? "";
    const done = answerEvent(answerEvent(first.state, CLUB, 0, bank).state, CLUB, 1, bank);
    expect(done.event.questionsLeft).toBe(0);
    expect(pendingEventOf(done.state, CLUB)).toBeNull();
    const record = eventsOf(done.state, { typeId: "conference", clubId: CLUB }).at(-1);
    expect(record?.answers).toEqual([0, 0, 1]);
    expect(record?.questionIds?.[1]).toBe(secondId);
    const morale = { a: 3, b: 4, c: 5 }[secondId as "a" | "b" | "c"] ?? 0;
    expect(clubMood(done.state, CLUB).squad).toBe(Math.min(100, clubMood(asked, CLUB).squad + 2 + morale));
    expect(eventMemoryOf(done.state).news.filter((item) => item.clubIds[0] === CLUB && item.kind === "event")).toHaveLength(1);
  });

  it("has the assistant answer every question left when the coach leaves it to him", () => {
    const bank = [conference()];
    const asked = untilPending(start, bank);
    const first = answerEvent(asked, CLUB, 1, bank);
    const rest = answerEvent(first.state, CLUB, null, bank);
    expect(rest.event.byAssistant).toBe(true);
    expect(rest.event.questionsLeft).toBe(0);
    expect(pendingEventOf(rest.state, CLUB)).toBeNull();
    expect(eventsOf(rest.state, { typeId: "conference", clubId: CLUB }).at(-1)?.answers).toEqual([1, 2, 2]);
  });

  it("is answered whole by the assistant when the coach handed him the press", () => {
    const handed: GameState = { ...start, coach: { ...start.coach, assistantAreas: ["press"] } };
    const ran = untilPending(handed, [conference({ cooldownDays: 30 })], "none");
    const records = eventsOf(ran, { typeId: "conference", clubId: CLUB });
    expect(pendingEventOf(ran, CLUB)).toBeNull();
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) expect(record.answers).toEqual([0, 2, 2]);
  });

  it("asks only the opening question when no follow-up fits", () => {
    const bank = [conference({ followUps: [question("never", 9, false)] })];
    const pending = pendingEventOf(untilPending(start, bank), CLUB);
    expect(pending?.questions).toHaveLength(1);
  });
});

describe("event texts", () => {
  it("files an event's story under its topic", () => {
    const bank: EventType[] = [{ id: "sick", area: "players", topic: "health", weight: 1, cooldownDays: 30, cast: () => ({}), texts: [{ headline: "Gripe no {club}", body: "corpo" }], effects: { morale: -1 } }];
    const ran = untilPending(start, bank, "none");
    const stories = eventMemoryOf(ran).news.filter((item) => item.headline.startsWith("Gripe"));
    expect(stories.length).toBeGreaterThan(0);
    for (const story of stories) expect(story.topic).toBe("health");
  });

  it("names the AI club's own coach", () => {
    const coach = coachesByClub(start.coaches ?? { coaches: {} }).get(AI_CLUB)?.name;
    expect(coach).toBeTruthy();
    const bank: EventType[] = [{ id: "praise", area: "board", topic: "board", weight: 1, cooldownDays: 30, cast: () => ({}), texts: [{ headline: "Diretoria elogia {coach}", body: "corpo" }], effects: { board: 1 } }];
    const ran = untilPending(start, bank, "none");
    expect(eventMemoryOf(ran).news.some((item) => item.clubIds[0] === AI_CLUB && item.headline === `Diretoria elogia ${coach}`)).toBe(true);
  });

  it("joins a preposition to the coach the text falls back on", () => {
    const slots = { player: "", teammate: "", club: "Flamengo", rival: "", age: "", position: "", stadium: "", coach: "o técnico" };
    expect(fillSlots("Renovação de {coach} na pauta", slots)).toBe("Renovação do técnico na pauta");
    expect(fillSlots("Crítica dura a {coach}", slots)).toBe("Crítica dura ao técnico");
    expect(fillSlots("Confiança em {coach}", slots)).toBe("Confiança no técnico");
    expect(fillSlots("{coach} rebate", slots)).toBe("O técnico rebate");
  });
});
