import { parseArgs } from "node:util";
import { runCareer } from "./runCareer.js";

const { values } = parseArgs({ options: { seasons: { type: "string", default: "5" }, seed: { type: "string", default: "1" } } });
const seasons = Number(values.seasons);
const seed = Number(values.seed);

const started = performance.now();
const { lines, firings, final } = runCareer(seed, seasons);
console.log(`career mode, ${seasons} seasons, seed ${seed}, ${((performance.now() - started) / 1000).toFixed(1)}s`);
for (const line of lines) console.log(`${line.date}  ${line.text}`);
console.log(`final reputation ${final.coach.reputation}, club ${final.coachClubId ?? "none"}`);
console.log("\nboard firings during the league, all clubs (real Série A: 17 in 2024, at least 22 in 2025)");
for (const division of ["A", "B", "C", "D"] as const) {
  const rows = firings.filter((f) => f.division === division);
  const total = rows.reduce((sum, f) => sum + f.count, 0);
  console.log(`Série ${division}: ${rows.map((f) => f.count).join(", ")} per season, ${(total / rows.length).toFixed(1)} on average`);
}
