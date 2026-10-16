import { RAPIDO } from "@boleiro/engine/sim/formats";
import { beforeAll, expect, test } from "vitest";
import { bundledGameFiles } from "./bundledGameFiles.js";
import { createEngineSession } from "./createEngineSession.js";

const ARSENAL = "tm-11";
// The season needs the board to keep its coach all year.
const SEED = 4;
const MAX_STEPS = 800;

let session: ReturnType<typeof createEngineSession>;
let rounds = 0;

beforeAll(() => {
  session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: SEED, choices: { coachClubId: ARSENAL, formats: RAPIDO } });
  for (let step = 0; step < MAX_STEPS && session.read(["season"]).season === 2026; step++) {
    if (session.apply({ type: "playToMatchDay" }).daysPlayed > 0) continue;
    session.apply({ type: "startRound" });
    session.apply({ type: "finishRound" });
    rounds++;
  }
}, 600_000);

test("a career at an English club plays its season through commands, its rounds live", () => {
  expect(session.read(["season"]).season).toBe(2027);
  expect(rounds).toBeGreaterThan(20);
});

test("the year turns with England's season filed from its own tables and its pyramid moved", () => {
  const { world, clubs, competitions } = session.read(["world", "clubs", "competitions"]);
  const record = world?.["gb-eng"]?.seasons.at(-1);
  expect(record?.season).toBe(2026);
  for (const id of record?.relegated[0] ?? []) expect(clubs[id]?.abroad?.level).toBe(1);
  expect(record?.relegated[0]).toHaveLength(3);
  expect(record?.continental["champions-league"]).toHaveLength(5);
  const premier = Object.values(competitions).find((c) => c.kind === "league" && c.season === 2027 && c.abroad?.country === "gb-eng" && c.abroad.level === 0);
  for (const id of record?.promoted[1] ?? []) expect(premier?.clubIds).toContain(id);
});
