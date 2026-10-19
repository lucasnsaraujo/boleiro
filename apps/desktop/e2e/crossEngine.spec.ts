import { expect, test, type Page } from "@playwright/test";
import { gunzipImports } from "@boleiro/data/gunzipImports";
import type { DailyHashScript, DayHash } from "@boleiro/game-client/engine/dailyHashes";
import { runnerImport } from "vite";

// guess: four months of a solo career and two of a hot-seat game reach several live rounds with
// substitutions, a transfer window and both coaches' turns, in under a minute per engine.
const SCRIPTS: Record<string, DailyHashScript> = {
  "a solo career": { seed: 53, choices: { coachClubId: "flamengo-rj" }, days: 120 },
  "a hot-seat game": {
    seed: 3,
    choices: { coachClubId: "flamengo-rj", hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: "palmeiras-sp" }] } },
    days: 60,
  },
};

type Played = { days: DayHash[]; dump: Record<string, string> | null };

type NodeHashes = typeof import("@boleiro/game-client/engine/dailyHashes");
let nodeHashes: Promise<NodeHashes> | null = null;

async function playInNode(script: DailyHashScript): Promise<Played> {
  // Vite's module runner gives Node the data packs the way the app's build does (`?gunzip` imports); loaded once a test needs it.
  nodeHashes ??= runnerImport<NodeHashes>("@boleiro/game-client/engine/dailyHashes", { configFile: false, plugins: [gunzipImports()], logLevel: "error" }).then(
    ({ module }) => module,
  );
  return (await nodeHashes).dailyHashes(script);
}

async function playInBrowser(page: Page, script: DailyHashScript): Promise<Played> {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.boleiroDailyHashes === "function");
  return page.evaluate((played) => {
    if (!window.boleiroDailyHashes) throw new Error("not an e2e build");
    return window.boleiroDailyHashes(played);
  }, script);
}

/** The path to the first value that differs between two saves' JSON, with both values. */
function firstDifference(a: unknown, b: unknown, path: string): string | null {
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return Object.is(a, b) ? null : `${path}: ${JSON.stringify(a)} in Node, ${JSON.stringify(b)} here`;
  }
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const difference = firstDifference((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`);
    if (difference) return difference;
  }
  return null;
}

/** The first day the browser's save differs from Node's, down to the first field that differs; null when every day agrees. */
async function firstDivergence(page: Page, script: DailyHashScript, node: DayHash[], browser: DayHash[]): Promise<string | null> {
  const day = node.findIndex((nodeDay, i) => JSON.stringify(nodeDay) !== JSON.stringify(browser[i]));
  if (day < 0) return node.length === browser.length ? null : `Node played ${node.length} days, this browser ${browser.length}`;
  const date = node[day]?.date ?? "";
  if (date !== browser[day]?.date) return `day ${day + 1} is ${date} in Node, ${browser[day]?.date} here`;
  const dumped = { ...script, days: day + 1, dumpOn: date };
  const [inNode, here] = [(await playInNode(dumped)).dump ?? {}, (await playInBrowser(page, dumped)).dump ?? {}];
  for (const shard of Object.keys({ ...inNode, ...here })) {
    const difference = firstDifference(JSON.parse(inNode[shard] ?? "null"), JSON.parse(here[shard] ?? "null"), shard);
    if (difference) return `${date}: ${difference}`;
  }
  return `${date}: the hashes differ but the saves read the same`;
}

for (const [name, script] of Object.entries(SCRIPTS)) {
  test(`${name} saves the same game every day in this browser as in Node`, async ({ page }) => {
    // guess: about 15 s per engine on a dev machine, three times that on CI's 2-core runner.
    test.setTimeout(240_000);
    const node = await playInNode(script);
    const browser = await playInBrowser(page, script);
    expect(node.days).toHaveLength(script.days);
    expect(await firstDivergence(page, script, node.days, browser.days)).toBeNull();
  });
}
