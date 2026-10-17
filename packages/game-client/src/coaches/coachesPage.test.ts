import { describe, expect, test } from "vitest";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { createEngineSession } from "../engine/createEngineSession.js";

function session() {
  const opened = createEngineSession(bundledGameFiles);
  opened.apply({ type: "newGame", seed: 3, choices: { coachClubId: "bahia-ba" } });
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
    expect(page.world.length).toBe(50);
  });

  test("gives the leading coach's profile his place in the ranking", () => {
    const leader = page.coaches[0];
    expect(leader && played.coachProfile(leader.key)?.ranking).toEqual({ position: 1, points: leader?.points });
  });
});
