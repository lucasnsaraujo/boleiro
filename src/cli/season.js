import { parseArgs } from "node:util";
import { historyReport } from "./historyReport.js";
import { realismReport } from "./realismReport.js";
import { runSeasons } from "./runSeasons.js";
import { seasonReport } from "./seasonReport.js";
const { values } = parseArgs({
    options: {
        seasons: { type: "string", default: "1" },
        seed: { type: "string", default: "1" },
        club: { type: "string" },
        report: { type: "boolean", default: false },
    },
});
const seasons = Number(values.seasons);
const seed = Number(values.seed);
const started = performance.now();
const { seasons: played, final } = runSeasons(seed, seasons);
console.log(`# Boleiro, ${seasons} season${seasons === 1 ? "" : "s"}, seed ${seed}, ${((performance.now() - started) / 1000).toFixed(1)}s\n`);
if (!values.report) {
    for (const { summary } of played)
        for (const line of seasonReport(summary))
            console.log(line);
    const clubId = values.club ?? final.history.seasons.at(-1)?.champions["serie-a"] ?? "flamengo-rj";
    if (!final.clubs[clubId])
        throw new Error(`no club ${clubId}`);
    console.log("## Club history\n");
    for (const line of historyReport(final, clubId))
        console.log(line);
    console.log("");
}
for (const line of realismReport(played.map((s) => s.stats)))
    console.log(line);
