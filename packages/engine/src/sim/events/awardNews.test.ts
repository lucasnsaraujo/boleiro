import { describe, expect, it } from "vitest";
import type { DayEvent } from "../advanceDay.js";
import type { AwardedPlayer, SeasonAwards } from "../history/history.js";
import { loadNewGame } from "../loadNewGame.js";
import { eventMemoryOf } from "./eventMemory.js";
import { recordNews } from "./recordNews.js";

const CLUB = "flamengo-rj";
const start = loadNewGame(5, { coachClubId: CLUB });
const AI_CLUB = Object.values(start.clubs).find((club) => club.division === "A" && club.id !== CLUB)?.id ?? "";
const storiesOf = (events: DayEvent[]) => eventMemoryOf(recordNews(start, start.date, events, {})).news;
const record = { type: "recordBroken", scope: "club", competition: null, kind: "longestUnbeaten", clubId: CLUB, playerId: null, name: null, value: 14, previous: 13 } as const;

describe("the newspaper", () => {
  it("prints a record a human coach's club breaks, and a league's record whoever breaks it", () => {
    const [own] = storiesOf([record]);
    expect(own).toMatchObject({ kind: "record", clubIds: [CLUB] });
    expect(own?.headline).toContain("14 jogos");
    expect(storiesOf([{ ...record, clubId: AI_CLUB }])).toEqual([]);
    const league = storiesOf([{ ...record, clubId: AI_CLUB, scope: "league", competition: "serie-a", kind: "mostSeasonGoals", playerId: "p1", name: "Fulano", value: 30, previous: 29 }]);
    expect(league).toEqual([expect.objectContaining({ kind: "record", clubIds: [AI_CLUB] })]);
    expect(league[0]?.headline).toContain("Fulano");
  });

  it("prints the season's Bola de Ouro and Ballon d'Or", () => {
    const winner: AwardedPlayer = { playerId: "p1", name: "Fulano", clubId: AI_CLUB, role: "meia", age: 27, apps: 34, goals: 9, assists: 11, average: 7.6 };
    const awards: SeasonAwards = {
      competition: "serie-a",
      bolaDeOuro: winner,
      runnersUp: [],
      bolaDePrata: [winner],
      topScorer: null,
      bestYoung: null,
      ballonDor: [{ playerId: "tm-418:3", name: "Beltrano", clubId: "tm-418", clubName: "Real Madrid", score: 95, titles: ["champions-league"], apps: null, goals: null, average: null }],
    };
    const stories = storiesOf([{ type: "seasonAwarded", season: 2026, awards }]);
    expect(stories.map((s) => s.kind)).toEqual(["award", "award"]);
    expect(stories.map((s) => s.headline).join(" ")).toMatch(/Fulano.*Bola de Ouro|Bola de Ouro.*Fulano/);
    expect(stories.map((s) => s.headline).join(" ")).toContain("Beltrano");
  });
});
