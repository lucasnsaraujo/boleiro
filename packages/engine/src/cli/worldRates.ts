import { parseArgs } from "node:util";
import { resultOnlyRates } from "./resultOnlyRates.js";

const { values } = parseArgs({ options: { seed: { type: "string", default: "1" }, leagues: { type: "string", default: "36" } } });
const started = performance.now();
const { matches, gaps } = resultOnlyRates(Number(values.seed), Number(values.leagues));
console.log(`# Result-only vs full pipeline, ${values.leagues} synthetic leagues, seed ${values.seed}, ${((performance.now() - started) / 1000).toFixed(1)}s\n`);
console.log(`Matches: full ${matches.full}, result-only ${matches.resultOnly}.\n`);
console.log("| metric | full | result-only | gap | tolerance | standard errors apart |");
console.log("|---|---|---|---|---|---|");
const isGoals = (metric: string) => metric === "goals per match";
const shown = (metric: string, value: number) => (isGoals(metric) ? value.toFixed(3) : `${(100 * value).toFixed(1)}%`);
const points = (metric: string, value: number) => (isGoals(metric) ? value.toFixed(3) : `${(100 * value).toFixed(1)} pt`);
for (const { metric, full, resultOnly, tolerance, standardErrors } of gaps) {
  console.log(`| ${metric} | ${shown(metric, full)} | ${shown(metric, resultOnly)} | ${points(metric, resultOnly - full)} | ${points(metric, tolerance)} | ${standardErrors.toFixed(2)} |`);
}
const outside = gaps.filter((gap) => Math.abs(gap.full - gap.resultOnly) >= gap.tolerance);
if (outside.length) {
  console.log(`\nOutside tolerance: ${outside.map((gap) => gap.metric).join(", ")}`);
  process.exitCode = 1;
}
