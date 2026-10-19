import type { Tier } from "../sim/gameState.js";
import { millions } from "./millions.js";
import { seasonRevenues } from "./seasonRevenues.js";

const SEASONS = Number(process.argv[2] ?? 10);
const SEED = Number(process.argv[3] ?? 1);
const TIERS: readonly Tier[] = ["A", "B", "C", "D", "state"];

const quantile = (sorted: readonly number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

const started = performance.now();
const { clubSeasons, forcedSales, lateWageClosings } = seasonRevenues(SEED, SEASONS);
console.log(`${SEASONS} seasons, seed ${SEED}, ${((performance.now() - started) / 1000).toFixed(1)}s`);
console.log(`forced sales ${forcedSales}, late-wage closings ${lateWageClosings}`);
console.log("tier   n     min      p10      median   p90      max      (revenue without player sales, per club-season)");
for (const tier of TIERS) {
  const values = clubSeasons.filter((c) => c.tier === tier).map((c) => c.revenue).sort((a, b) => a - b);
  const row = [0, 0.1, 0.5, 0.9, 1].map((q) => millions(quantile(values, q)).padEnd(9)).join("");
  console.log(`${tier.padEnd(7)}${String(values.length).padEnd(6)}${row}`);
}
const last = clubSeasons.filter((c) => c.season === Math.max(...clubSeasons.map((s) => s.season)));
const richest = [...last].sort((a, b) => b.cash - a.cash).slice(0, 5);
console.log("richest cash at the end:", richest.map((c) => `${c.clubId} (${c.tier}) ${millions(c.cash)}`).join(", "));
