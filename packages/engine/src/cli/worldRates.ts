import { parseArgs } from "node:util";
import { resultOnlyRates, TOLERANCE_STANDARD_ERRORS } from "./resultOnlyRates.js";

const { values } = parseArgs({ options: { seed: { type: "string", default: "1" }, leagues: { type: "string", default: "36" } } });
const started = performance.now();
const { matches, gaps } = resultOnlyRates(Number(values.seed), Number(values.leagues));
console.log(`# Result-only vs full pipeline, ${values.leagues} synthetic leagues, seed ${values.seed}, ${((performance.now() - started) / 1000).toFixed(1)}s\n`);
console.log(`Matches: full ${matches.full}, result-only ${matches.resultOnly}. Tolerance: ${TOLERANCE_STANDARD_ERRORS} standard errors of the difference.\n`);
console.log("| metric | full | result-only | standard errors apart |");
console.log("|---|---|---|---|");
const shown = (metric: string, value: number) => (metric === "goals per match" ? value.toFixed(3) : `${(100 * value).toFixed(1)}%`);
for (const gap of gaps) console.log(`| ${gap.metric} | ${shown(gap.metric, gap.full)} | ${shown(gap.metric, gap.resultOnly)} | ${gap.standardErrors.toFixed(2)} |`);
const outside = gaps.filter((gap) => gap.standardErrors > TOLERANCE_STANDARD_ERRORS);
if (outside.length) {
  console.log(`\nOutside tolerance: ${outside.map((gap) => gap.metric).join(", ")}`);
  process.exitCode = 1;
}
