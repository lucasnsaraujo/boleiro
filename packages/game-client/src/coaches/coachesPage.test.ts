import { describe, expect, test } from "vitest";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { createEngineSession } from "../engine/createEngineSession.js";

function session() {
  const opened = createEngineSession(bundledGameFiles);
  opened.apply({ type: "newGame", seed: 10, choices: { coachClubId: "bahia-ba" } });
  return opened;
}

describe("the coaches screen before the first season ends", () => {
  const opening = session();
  const page = opening.coaches();

  test("has no ranking yet and shows the player's own career from his club", () => {
    expect(page.season).toBeNull();
    expect(page.coaches).toEqual([]);
    expect(page.you).toMatchObject({ isHuman: true, clubId: "bahia-ba", ranking: null });
    expect(page.you.stints).toEqual([{ clubId: "bahia-ba", from: "2026-01-01", until: null, left: null }]);
  });

  test("opens any club's AI coach by the club's id", () => {
    expect(opening.coachProfile("palmeiras-sp")).toMatchObject({ name: "Abel Ferreira", isReal: true, clubId: "palmeiras-sp", age: 47 });
  });
});

test("a save from before AI coaches loads with every club's coach drawn from its seed", () => {
  const saved = session();
  const old = JSON.parse(saved.save()) as { game: Record<string, unknown> };
  delete old.game.coaches;
  const loaded = createEngineSession(bundledGameFiles);
  loaded.apply({ type: "load", save: JSON.stringify(old) });
  expect(loaded.coachProfile("palmeiras-sp")).toEqual(saved.coachProfile("palmeiras-sp"));
  expect(loaded.read(["coaches"]).coaches).toEqual(saved.read(["coaches"]).coaches);
});

describe("the coaches screen after a season", () => {
  const played = session();
  const days = 365;
  played.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
  const page = played.coaches();

  test("ranks the coaches, the player among them wherever he stands, and the clubs at home and in the world", () => {
    expect(page.season).toBe(2026);
    expect(page.seasons).toEqual([2026]);
    expect(page.coaches.slice(0, 50).map((row) => row.position)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(page.coaches.find((row) => row.isSeated)).toMatchObject({ isHuman: true });
    expect(page.national[0]?.points).toBeGreaterThan(page.national[1]?.points ?? Infinity);
    expect(page.world.length).toBeGreaterThanOrEqual(10);
  });

  test("shows a season the rankings no longer read as its standings were kept", () => {
    const saved = JSON.parse(played.save()) as { game: { coaches: { standings?: unknown[] } } };
    // Raw points, before the country's weight the ranking applies when read.
    const palmeiras = played.coachProfile("palmeiras-sp");
    const coach = palmeiras?.key ?? "";
    const old = { season: 2019, clubs: [["palmeiras-sp", "br", 5000]], coaches: [[coach, "br", 900], ["human:", "br", 10]], national: [["palmeiras-sp", 4000]] };
    saved.game.coaches.standings = [old, ...(saved.game.coaches.standings ?? [])];
    const loaded = createEngineSession(bundledGameFiles);
    loaded.apply({ type: "load", save: JSON.stringify(saved) });
    const past = loaded.coaches(2019);
    expect(past.seasons).toEqual([2019, 2026]);
    expect(past.season).toBe(2019);
    const brazil = (past.world[0]?.points ?? 0) / 5000;
    expect(brazil).toBeGreaterThan(0.2);
    expect(brazil).toBeLessThanOrEqual(1);
    expect(past.coaches.map((row) => [row.key, row.position, row.points])).toEqual([
      [coach, 1, Math.round(900 * brazil)],
      ["human:", 2, Math.round(10 * brazil)],
    ]);
    expect(past.coaches[0]?.name).toBe(palmeiras?.name);
    expect(past.national).toEqual([{ position: 1, clubId: "palmeiras-sp", points: 4000, country: "br" }]);
    expect(past.world.map((row) => [row.position, row.clubId, row.country])).toEqual([[1, "palmeiras-sp", "br"]]);
    expect(past.you.ranking).toEqual({ position: 2, points: Math.round(10 * brazil) });
    expect(past.waitingCountries).toEqual([]);
  });

  test("marks the coaches the game invented, never a real one, an ex-star or a human", () => {
    const real = page.coaches.find((row) => !row.isHuman && played.coachProfile(row.key)?.isReal);
    const invented = page.coaches.find((row) => !row.isHuman && !played.coachProfile(row.key)?.isReal && !played.coachProfile(row.key)?.formerPlayer);
    expect(real?.isInvented).toBe(false);
    expect(invented?.isInvented).toBe(true);
    expect(page.coaches.filter((row) => row.isHuman).map((row) => row.isInvented)).toEqual([false]);
  });

  test("names the leagues the world ranking still lacks: Europe's first season ends in July, South America's with the year", () => {
    expect(page.waitingCountries).toContain("gb-eng");
    expect(page.waitingCountries).not.toContain("ar");
    expect(session().coaches().waitingCountries).toEqual([]);
  });

  test("gives the leading coach's profile his place in the ranking", () => {
    const leader = page.coaches[0];
    expect(leader && played.coachProfile(leader.key)?.ranking).toEqual({ position: 1, points: leader?.points });
  });
});

describe("a coach's rivals on his profile", () => {
  const played = session();
  for (let step = 0; step < 20 && played.apply({ type: "playToMatchDay" }).stop !== "matchDay"; step++);
  const round = played.apply({ type: "startRound" });
  played.apply({ type: "finishRound" });
  const coachMatch = round.matches.find((m) => m.fixtureId === round.coach?.fixtureId);
  const opponentClub = coachMatch?.homeId === "bahia-ba" ? coachMatch.awayId : coachMatch?.homeId;

  test("list the coach he faced with their record, and the other coach's profile lists him back", () => {
    const opponent = played.coachProfile(opponentClub ?? "");
    const [rival] = played.coaches().you.rivals;
    expect(rival).toMatchObject({ key: opponent?.key, name: opponent?.name, meetings: 1 });
    expect((rival?.wins ?? 0) + (rival?.losses ?? 0) + (rival?.draws ?? 0)).toBe(1);
    expect(opponent?.rivals.map((r) => r.key)).toEqual([played.coaches().you.key]);
  });
});
