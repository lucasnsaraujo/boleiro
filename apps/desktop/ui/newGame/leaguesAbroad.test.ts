import { expect, test } from "vitest";
import { CLUBS_ABROAD } from "../clubs/clubCatalog.js";
import { LEAGUES_ABROAD, leagueAbroadOf } from "./leaguesAbroad.js";

test("every league abroad is offered with its country, and each of its clubs names it", () => {
  expect(LEAGUES_ABROAD.find((league) => league.value === "gb-eng-1")?.label).toBe("Premier League · Inglaterra");
  expect(LEAGUES_ABROAD.find((league) => league.value === "ar-2")?.label).toBe("Primera Nacional · Argentina");
  const arsenal = CLUBS_ABROAD.find((club) => club.id === "tm-11");
  expect(arsenal && leagueAbroadOf(arsenal)?.value).toBe("gb-eng-1");
  for (const club of CLUBS_ABROAD) expect(leagueAbroadOf(club)).not.toBeNull();
});
