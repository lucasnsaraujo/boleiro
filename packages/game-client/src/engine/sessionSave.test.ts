import { loadNewGame } from "@boleiro/engine/sim/loadNewGame";
import type { CountryStructure, WorldClub } from "@boleiro/engine/sim/world/world";
import { expect, test } from "vitest";
import { EMPTY_DESK } from "../market/boardDesk.js";
import { bundledGameFiles } from "./bundledGameFiles.js";
import { createEngineSession } from "./createEngineSession.js";
import { writeSessionSave } from "./sessionSave.js";

const structure = (id: string, window: [string, string]): CountryStructure => ({
  id,
  levels: [{ name: "Liga", legs: 2, promoted: 0, relegated: 0 }],
  window,
  continental: [],
});
const club = (id: string): WorldClub => ({ id, name: id, positions: "GDDDDMMMMAA", strengths: Array.from({ length: 11 }, () => 60) });
const clubs = (country: string) => [Array.from({ length: 6 }, (_, i) => club(`${country}-${i}`))];

/** A session holding a game with two result-only countries: `aa` plays from March, `bb` from August. */
function worldSession() {
  const world = loadNewGame(3, {
    coachClubId: "bahia-ba",
    world: [
      { structure: structure("aa", ["03-02", "06-30"]), levels: clubs("aa") },
      { structure: structure("bb", ["08-01", "11-30"]), levels: clubs("bb") },
    ],
  });
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "load", save: writeSessionSave({ game: world, desk: EMPTY_DESK, turningPoints: [], live: null }) });
  return session;
}

function playUntil(session: ReturnType<typeof createEngineSession>, date: string) {
  while (session.read(["date"]).date < date) session.apply({ type: "advance", days: [{}] });
}

test("a Brazil game in shards is its game shard and the session's own state, the same parts a whole save holds", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  session.apply({ type: "ask", request: { kind: "sign", playerId: "x" } });
  const shards = session.saveShards();
  const { game, ...own }: Record<string, unknown> = JSON.parse(session.save());
  expect(Object.keys(shards).sort()).toEqual(["game", "session"]);
  expect(JSON.parse(shards.game ?? "")).toEqual(game);
  expect(JSON.parse(shards.session ?? "")).toEqual(own);
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
