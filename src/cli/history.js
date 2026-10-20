import { parseArgs } from "node:util";
import { historyReport } from "./historyReport.js";
import { runCareer } from "./runCareer.js";
const { values } = parseArgs({ options: { seasons: { type: "string", default: "5" }, seed: { type: "string", default: "1" }, club: { type: "string" } } });
const seasons = Number(values.seasons);
const seed = Number(values.seed);
const started = performance.now();
const { final } = runCareer(seed, seasons);
const clubId = values.club ?? final.history.coach.stints.at(-1)?.clubId ?? "flamengo-rj";
if (!final.clubs[clubId])
    throw new Error(`no club ${clubId}`);
console.log(`career mode, ${seasons} seasons, seed ${seed}, ${((performance.now() - started) / 1000).toFixed(1)}s\n`);
for (const line of historyReport(final, clubId))
    console.log(line);
