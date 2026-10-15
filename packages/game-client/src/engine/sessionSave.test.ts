import { expect, test } from "vitest";
import { bundledGameFiles } from "./bundledGameFiles.js";
import { createEngineSession } from "./createEngineSession.js";
import { twoCountryGame } from "./twoCountryGame.js";

// The app's files without South America, for a game of Brazil alone.
const BRAZIL_ONLY = { ...bundledGameFiles, world: [] };

function worldSession() {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "load", save: twoCountryGame() });
  return session;
}

function playUntil(session: ReturnType<typeof createEngineSession>, date: string) {
  while (session.read(["date"]).date < date) session.apply({ type: "advance", days: [{}] });
}

test("a Brazil game in shards is its game shard and the session's own state, the same parts a whole save holds", () => {
  const session = createEngineSession(BRAZIL_ONLY);
  session.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  session.apply({ type: "ask", request: { kind: "sign", playerId: "x" } });
  const shards = session.saveShards();
  const { game, desk, turningPoints }: Record<string, unknown> = JSON.parse(session.save());
  expect(Object.keys(shards).sort()).toEqual(["game", "session"]);
  expect(JSON.parse(shards.game ?? "")).toEqual(game);
  expect(JSON.parse(shards.session ?? "")).toMatchObject({ desk, turningPoints });
});

test("a live round keeps its day in a shard of its own, which the minutes shown leave as it was", () => {
  const session = createEngineSession(BRAZIL_ONLY);
  session.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  session.apply({ type: "playToMatchDay" });
  session.apply({ type: "startRound" });
  const kickOff = session.saveShards();
  expect(Object.keys(kickOff).sort()).toEqual(["game", "live", "session"]);
  session.apply({ type: "seeMinute", minute: 30 });
  const later = session.saveShards();
  expect(later.live).toBe(kickOff.live);
  expect(later.game).toBe(kickOff.game);
  expect(later.session).not.toBe(kickOff.session);
  const twin = createEngineSession(bundledGameFiles);
  twin.apply({ type: "load", save: later });
  expect(twin.liveRound()).toEqual(session.liveRound());
  session.apply({ type: "finishRound" });
  expect(Object.keys(session.saveShards()).sort()).toEqual(["game", "session"]);
});

test("a new game keeps each South American country in a shard of its own, next to the world's", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  const countries = ["ar", "bo", "cl", "co", "ec", "pe", "py", "uy", "ve"].map((id) => `country-${id}`);
  expect(Object.keys(session.saveShards()).sort()).toEqual([...countries, "game", "session", "world"]);
});

test("a world game saved in shards, again after days only one country played, loads back the same session", () => {
  const session = worldSession();
  playUntil(session, "2026-02-20");
  session.saveShards();
  playUntil(session, "2026-03-10");
  const twin = createEngineSession(bundledGameFiles);
  twin.apply({ type: "load", save: session.saveShards() });
  expect(JSON.parse(twin.save())).toEqual(JSON.parse(session.save()));
  expect(Object.keys(session.saveShards()).sort()).toEqual(["country-aa", "country-bb", "game", "session", "world"]);
});

test("the shards of a game saved again match those of the same game saved fresh", () => {
  const session = worldSession();
  playUntil(session, "2026-03-03");
  session.saveShards();
  playUntil(session, "2026-03-20");
  const fresh = createEngineSession(bundledGameFiles);
  fresh.apply({ type: "load", save: session.save() });
  expect(session.saveShards()).toEqual(fresh.saveShards());
});

test("a save from before positions loads with every player's positions and every club's usual lineup from the pack", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  const saved = JSON.parse(session.save());
  const { usualLineups, players } = structuredClone(saved.game);
  delete saved.game.usualLineups;
  for (const player of Object.values<{ positions?: unknown }>(saved.game.players)) delete player.positions;

  const old = createEngineSession(bundledGameFiles);
  old.apply({ type: "load", save: JSON.stringify(saved) });
  const loaded = old.read(["usualLineups", "players"]);
  expect(loaded.usualLineups).toEqual(usualLineups);
  expect(loaded.players).toEqual(players);
});
