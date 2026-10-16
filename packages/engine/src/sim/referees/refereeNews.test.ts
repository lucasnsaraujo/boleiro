import { describe, expect, it } from "vitest";
import { EVENT_BANK } from "../events/eventBank.js";
import { eventMemoryOf } from "../events/eventMemory.js";
import { recordNews } from "../events/recordNews.js";
import { loadNewGame } from "../loadNewGame.js";
import type { RefereeCallEvent } from "./refereeCalls.js";

const CLUB = "flamengo-rj";
const start = loadNewGame(5, { coachClubId: CLUB });
const RIVAL = Object.values(start.clubs).find((club) => club.division === "A" && club.id !== CLUB)?.id ?? "";
const rivalPlayer = Object.values(start.players).find((p) => p.clubId === RIVAL);
const ownPlayer = Object.values(start.players).find((p) => p.clubId === CLUB);

const wrongCall: RefereeCallEvent = {
  type: "refereeCall",
  fixtureId: "f1",
  competitionId: "serie-a",
  referee: "Wilton Pereira Sampaio",
  call: { type: "wrongCall", minute: 63, clubId: RIVAL, playerId: rivalPlayer?.id ?? "", call: "goalShouldNotStand", againstId: CLUB },
};
const varCall: RefereeCallEvent = {
  type: "refereeCall",
  fixtureId: "f1",
  competitionId: "serie-a",
  referee: null,
  call: { type: "varCheck", minute: 41, clubId: CLUB, playerId: ownPlayer?.id ?? "", decision: "goalRuledOut", seconds: 100 },
};

describe("the referee in the papers", () => {
  it("prints a wrong call that stood against the coach's club, naming the referee, the player and the minute", () => {
    const papered = recordNews(start, start.date, [wrongCall], {});
    const story = eventMemoryOf(papered).news.find((item) => item.kind === "controversy");
    expect(story?.clubIds).toEqual([CLUB, RIVAL]);
    expect(`${story?.headline} ${story?.body}`).toContain(rivalPlayer?.name ?? "?");
    expect(`${story?.headline} ${story?.body}`).toMatch(/63'/);
    expect(`${story?.headline} ${story?.body}`).toMatch(/Wilton Pereira Sampaio|arbitragem/);
  });

  it("prints VAR changing a call with how long the review took, and leaves out a check that changed nothing", () => {
    const stood: RefereeCallEvent = { ...varCall, call: { ...varCall.call, type: "varCheck", decision: "goalStands", seconds: 60 } as RefereeCallEvent["call"] };
    const papered = recordNews(start, start.date, [varCall, stood], {});
    const stories = eventMemoryOf(papered).news.filter((item) => item.kind === "var");
    expect(stories).toHaveLength(1);
    expect(stories[0]?.headline).toBe(`VAR anula gol do ${start.clubs[CLUB]?.shortName}`);
    expect(stories[0]?.body).toContain("1 min 40 s");
  });

  it("calls the coach to a press conference about the referee only after a wrong call went against his club", () => {
    const pressReferee = EVENT_BANK.find((type) => type.id === "press-referee");
    if (!pressReferee) throw new Error("the bank has no referee press conference");
    const scene = (state: typeof start, clubId: string) => ({ state, clubId, squad: [], date: start.date, played: [], random: () => 0 });
    const papered = recordNews(start, start.date, [wrongCall], {});
    expect(pressReferee.look).toBe("press");
    expect(pressReferee.cast(scene(papered, CLUB))).toEqual({ rivalId: RIVAL });
    expect(pressReferee.cast(scene(papered, RIVAL))).toBeNull();
    expect(pressReferee.cast(scene(start, CLUB))).toBeNull();
  });
});
