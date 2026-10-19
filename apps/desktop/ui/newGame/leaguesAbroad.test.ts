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

test("the market leagues are offered with their countries, and the Club World Cup's guests are not offered", () => {
  expect(["sa-1", "us-1", "mx-1"].map((value) => LEAGUES_ABROAD.find((league) => league.value === value)?.label)).toEqual([
    "Saudi Pro League · Arábia Saudita",
    "MLS · Estados Unidos",
    "Liga MX · México",
  ]);
  const lafc = CLUBS_ABROAD.find((club) => club.id === "tm-51828");
  expect(lafc && leagueAbroadOf(lafc)?.value).toBe("us-1");
  expect(CLUBS_ABROAD.some((club) => club.id === "tm-11391")).toBe(false);
});
