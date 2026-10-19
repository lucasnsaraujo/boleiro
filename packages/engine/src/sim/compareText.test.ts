import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
// A new game and its first month, hashed in a fresh Node whose ICU takes the computer's language from LC_ALL.
const GAME_HASH = `
import { createHash } from "node:crypto";
import { advanceDay } from "./packages/engine/src/sim/advanceDay.ts";
import { loadNewGame } from "./packages/engine/src/sim/loadNewGame.ts";
import { saveGame } from "./packages/engine/src/sim/saveGame.ts";
let state = loadNewGame(7, { coachClubId: "flamengo-rj" });
for (let day = 0; day < 30; day++) state = advanceDay(state, {}).state;
console.log(new Intl.Collator().resolvedOptions().locale, createHash("sha256").update(saveGame(state)).digest("hex"));
`;

function gameOnComputerIn(locale: string): { locale: string; hash: string } {
  const out = execFileSync(`${ROOT}node_modules/.bin/tsx`, ["-e", GAME_HASH], { cwd: ROOT, env: { ...process.env, LC_ALL: locale, LANG: locale }, encoding: "utf8" });
  const [resolved = "", hash = ""] = out.trim().split(" ");
  return { locale: resolved, hash };
}

describe("text sorts", () => {
  it("deal one seed the same game on English, Brazilian and Czech computers", () => {
    const games = ["en_US.UTF-8", "pt_BR.UTF-8", "cs_CZ.UTF-8"].map(gameOnComputerIn);
    expect(games.map((game) => game.locale)).toEqual(["en-US", "pt-BR", "cs-CZ"]);
    expect(new Set(games.map((game) => game.hash)).size).toBe(1);
  }, 120_000);
});
