import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { describe, expect, it } from "vitest";
import type { GameState } from "../gameState.js";
import { advanceDay } from "../advanceDay.js";
import { loadNewGame } from "../loadNewGame.js";
import { acceptNationalOffer } from "./nationalJobs.js";
import { syncNationalFixtures } from "./nationalFixtures.js";

const football = loadNationalFootball();
const start = loadNewGame(5, { coachClubId: "flamengo-rj", nationalFootball: football });

/** The game with its coach running `teamId` too, as if he took its federation's offer. */
function coaching(state: GameState, teamId: string): GameState {
  const nations = state.nations;
  if (!nations) throw new Error("the game has no national football");
  return acceptNationalOffer({ ...state, nations: { ...nations, offer: { teamId, expiresOn: "2026-12-31" } } }).state;
}

describe("a national coach's matches in the full tier", () => {
  it("puts his team's World Cup matches among the fixtures, with the competition's other matches of those days", () => {
    const game = syncNationalFixtures(coaching(start, "brazil"));
    const brazil = game.fixtures.filter((f) => f.homeId === "brazil" || f.awayId === "brazil");
    expect(brazil.map((f) => `${f.date} ${f.homeId}-${f.awayId}`)).toEqual(["2026-06-13 brazil-morocco", "2026-06-20 brazil-haiti", "2026-06-24 scotland-brazil"]);
    const competition = game.competitions[brazil[0]?.competitionId ?? ""];
    expect(competition?.kind).toBe("national");
    const sameDay = game.fixtures.filter((f) => f.competitionId === competition?.id && f.date === "2026-06-13");
    expect(sameDay.map((f) => `${f.homeId}-${f.awayId}`).sort()).toEqual(["brazil-morocco", "qatar-switzerland", "united-states-paraguay"]);
  });

  it("adds nothing twice when synced again", () => {
    const once = syncNationalFixtures(coaching(start, "brazil"));
    expect(syncNationalFixtures(once)).toBe(once);
  });

  it("leaves a game without a national coach as it was", () => {
    expect(syncNationalFixtures(start)).toBe(start);
  });
});

describe("a national coach's friendlies", () => {
  it("join the full tier alone, the day's other friendlies played result-only", () => {
    const game = coaching(start, "brazil");
    const nations = game.nations;
    if (!nations) throw new Error("the game has no national football");
    const friendly = (homeId: string, awayId: string) => ({ id: `friendly-2026-03-27-${homeId}`, competitionId: "friendlies-2026", round: "friendly", date: "2026-03-27", homeId, awayId, result: null });
    const competition = { id: "friendlies-2026", name: "Amistosos 2026", kind: "friendlies" as const, groups: {}, places: 0, knockout: [], opened: 0, until: "2026-12-31", winnerId: "" };
    const synced = syncNationalFixtures({ ...game, nations: { ...nations, competitions: { ...nations.competitions, [competition.id]: competition }, matches: [...nations.matches, friendly("brazil", "france"), friendly("spain", "italy"), friendly("japan", "mexico")] } });
    expect(synced.fixtures.filter((f) => f.date === "2026-03-27" && f.id.startsWith("national:")).map((f) => `${f.homeId}-${f.awayId}`)).toEqual(["brazil-france"]);
  });
});

describe("a national coach's competitions at the turn of the year", () => {
  it("keep their full-tier copy, fixtures and bans while the competition runs on", () => {
    const game = syncNationalFixtures(coaching(start, "spain"));
    const copy = Object.values(game.competitions).find((c) => c.kind === "national" && c.nationalId === "nations-league-2026");
    if (!copy) throw new Error("Spain's Nations League joined the full tier");
    let played = game;
    while (played.date < "2026-12-31") played = advanceDay(played, {}).state;
    const ban = { yellows: 0, phase: 0, bans: 1 };
    const eve = { ...played, discipline: { ...played.discipline, [copy.id]: { "some-player": ban } } };
    const after = advanceDay(eve, {}).state;
    expect(after.date).toBe("2027-01-01");
    expect(after.competitions[copy.id]).toBeDefined();
    expect(after.discipline[copy.id]?.["some-player"]).toEqual(ban);
    const own = (state: GameState) => state.fixtures.filter((f) => f.competitionId === copy.id).map((f) => f.id);
    expect(own(after)).toEqual(expect.arrayContaining(own(eve)));
  }, 300_000);
});
