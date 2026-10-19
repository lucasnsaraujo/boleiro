import { cpus, loadavg } from "node:os";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { advanceDay } from "../sim/advanceDay.js";
import { cpuBudgetSeconds } from "../sim/cpuBudgetSeconds.js";
import type { GameState } from "../sim/gameState.js";
import { loadNewGame } from "../sim/loadNewGame.js";
import { loadShards, saveShards } from "../sim/saveShards.js";
import { type AbroadLeagueTallies, tallyFinishedAbroad } from "./abroadSeasons.js";
import type { ScoreTally } from "./scoreTally.js";
import { syntheticWorldStart, v1WorldStart } from "./v1World.js";

const TABLES_START = "<!-- tables:start -->";
const TABLES_END = "<!-- tables:end -->";
const SYNTHETIC_CLUBS = 4000;
const MEBIBYTE = 1024 * 1024;
const REFERENCE_MACHINE_SECONDS = 0.065;

const cpuSeconds = (usage: NodeJS.CpuUsage) => (usage.user + usage.system) / 1e6;
const median = (values: readonly number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? Number.NaN;
const megabytes = (bytes: number) => (bytes / MEBIBYTE).toFixed(1);
const bytesOf = (shards: Record<string, string>) => Object.values(shards).reduce((sum, text) => sum + Buffer.byteLength(text), 0);

/** Collects garbage when node runs with --expose-gc, so the heap numbers show what the game holds. */
function collect(): void {
  const gc: unknown = (globalThis as { gc?: unknown }).gc;
  if (typeof gc === "function") gc();
}

type Measured<T> = { value: T; cpu: number; wall: number };
function measure<T>(work: () => T): Measured<T> {
  const cpu = process.cpuUsage();
  const wall = performance.now();
  const value = work();
  return { value, cpu: cpuSeconds(process.cpuUsage(cpu)), wall: (performance.now() - wall) / 1000 };
}

/** Plays the state's season to the day it ends, the day after being the next season's first, and says how long its slowest day took. */
function playSeason(start: GameState, finished?: AbroadLeagueTallies): { state: GameState; worstDay: number } {
  let state = start;
  let worstDay = 0;
  const cups = new Map<string, ScoreTally>();
  for (;;) {
    const day = measure(() => advanceDay(state, {}));
    worstDay = Math.max(worstDay, day.cpu);
    if (finished) tallyFinishedAbroad(state, day.value.state, finished, cups);
    state = day.value.state;
    if (day.value.events.some((e) => e.type === "seasonEnded")) return { state, worstDay };
  }
}

type SeasonRow = { season: number; cpu: number; wall: number; worstDay: number; heapMb: string; rssMb: string };

function playSeasons(start: GameState, seasons: number, finished: AbroadLeagueTallies): { rows: SeasonRow[]; last: GameState } {
  const rows: SeasonRow[] = [];
  let state = start;
  for (let i = 0; i < seasons; i++) {
    const played = measure(() => playSeason(state, finished));
    state = played.value.state;
    collect();
    const memory = process.memoryUsage();
    rows.push({ season: start.season + i, cpu: played.cpu, wall: played.wall, worstDay: played.value.worstDay, heapMb: megabytes(memory.heapUsed), rssMb: megabytes(memory.rss) });
  }
  return { rows, last: state };
}

function saveRow(label: string, state: GameState): string {
  const first = measure(() => saveShards(state));
  const shards = first.value;
  const loaded = measure(() => loadShards(shards));
  if (loaded.value.season !== state.season) throw new Error("the save loaded another season");
  const next = advanceDay(state, {}).state;
  const incremental = measure(() => saveShards(next, state));
  return `| ${label} | ${megabytes(bytesOf(shards))} | ${Object.keys(shards).length} | ${first.cpu.toFixed(2)} | ${loaded.cpu.toFixed(2)} | ${megabytes(bytesOf(incremental.value))} | ${incremental.cpu.toFixed(2)} |`;
}

function worldSection(label: string, build: (seed: number) => { state: GameState; clubs: number }, seeds: number, seasons: number): { lines: string[]; saveLine: string } {
  const finishedAbroad: AbroadLeagueTallies = new Map();
  let firstSeedState: GameState | undefined;
  let players = 0;
  const runs: { buildCpu: number; rows: SeasonRow[]; clubs: number }[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const built = measure(() => build(seed));
    collect();
    const { rows, last } = playSeasons(built.value.state, seasons, finishedAbroad);
    if (seed === 1) {
      firstSeedState = last;
      players = Object.keys(built.value.state.players).length;
    }
    runs.push({ buildCpu: built.cpu, rows, clubs: built.value.clubs });
  }
  const lines = [
    `### ${label}`,
    "",
    `${runs[0]?.clubs} clubs, ${players} players in the full tier. Setup (building the world): ${median(runs.map((r) => r.buildCpu)).toFixed(2)} s CPU, median of ${seeds}.`,
    "",
    "| Seed | Season | CPU s | Wall s | Slowest day, CPU ms | Heap MB after GC | RSS MB |",
    "|---|---|---|---|---|---|---|",
    ...runs.flatMap((run, i) => run.rows.map((row) => `| ${i + 1} | ${row.season} | ${row.cpu.toFixed(2)} | ${row.wall.toFixed(2)} | ${(row.worstDay * 1000).toFixed(0)} | ${row.heapMb} | ${row.rssMb} |`)),
    "",
    `League matches played abroad in the ${seeds * seasons} seasons run: ${[...finishedAbroad].filter(([key]) => !/-x\d+-\d+$/.test(key)).reduce((sum, [, e]) => sum + e.tally.matches, 0)} in the real countries, ${[...finishedAbroad].filter(([key]) => /-x\d+-\d+$/.test(key)).reduce((sum, [, e]) => sum + e.tally.matches, 0)} in cloned ones (finished league seasons only).`,
    "",
    `Median season: **${median(runs.flatMap((r) => r.rows.map((row) => row.cpu))).toFixed(2)} s CPU**; slowest ${Math.max(...runs.flatMap((r) => r.rows.map((row) => row.cpu))).toFixed(2)} s; first season of each seed, median ${median(runs.map((r) => r.rows[0]?.cpu ?? Number.NaN)).toFixed(2)} s.`,
  ];
  return { lines, saveLine: firstSeedState ? saveRow(label, firstSeedState) : "" };
}

/** The v1 world for `seasons` seasons from one seed, a save at the start of each: how big it gets, how long it takes to write and read. */
function saveGrowth(seasons: number): string[] {
  const lines = ["| Season start | Save MB | Shards | Save CPU s | Load CPU s | One day's autosave MB | One day's autosave CPU s |", "|---|---|---|---|---|---|---|"];
  let state = v1WorldStart(1);
  for (let i = 0; i < seasons; i++) {
    state = playSeason(state).state;
    collect();
    lines.push(saveRow(`${state.season}`, state));
  }
  return lines;
}

function machine(): string[] {
  const factor = cpuBudgetSeconds(1);
  return [
    `Machine: ${cpus()[0]?.model ?? "unknown"}, ${cpus().length} cores, node ${process.version}. Load average at start (1, 5, 15 min): ${loadavg().map((n) => n.toFixed(1)).join(", ")}.`,
    `Reference workload (\`cpuBudgetSeconds\`): this machine ran it ${factor.toFixed(2)} times the ${REFERENCE_MACHINE_SECONDS} s of the machine the budgets were set on (1.00 means as fast or faster).`,
  ];
}

const { values } = parseArgs({ options: { seeds: { type: "string", default: "3" }, seasons: { type: "string", default: "3" }, "save-seasons": { type: "string", default: "20" }, write: { type: "string" } } });
const seeds = Number(values.seeds);
const seasons = Number(values.seasons);

const lines = [TABLES_START, "", ...machine(), ""];
const brazil = worldSection("Brazil alone, the full tier without the world abroad", (seed) => {
  const state = loadNewGame(seed, { coachClubId: null });
  return { state, clubs: Object.keys(state.clubs).length };
}, seeds, seasons);
const v1 = worldSection("The v1 world", (seed) => {
  const state = v1WorldStart(seed);
  return { state, clubs: Object.keys(state.clubs).length + Object.values(state.world ?? {}).reduce((sum, c) => sum + Object.keys(c.clubs).length, 0) + Object.values(state.guests ?? {}).flat().length };
}, seeds, seasons);
const big = worldSection(`A synthetic world of at least ${SYNTHETIC_CLUBS} clubs`, (seed) => syntheticWorldStart(seed, SYNTHETIC_CLUBS), seeds, seasons);
lines.push("## Season CPU", "", ...brazil.lines, "", ...v1.lines, "", ...big.lines, "");
lines.push("## Save size, load and autosave", "", "First save of the world after its first season, then loaded back, then one day later saved again with the first save as the baseline (only the shards that changed are written).", "");
lines.push("| World | Save MB | Shards | Save CPU s | Load CPU s | One day's autosave MB | One day's autosave CPU s |", "|---|---|---|---|---|---|---|", brazil.saveLine, v1.saveLine, big.saveLine, "");
lines.push(`## Save size by season, the v1 world, seasons 1 to ${values["save-seasons"]}`, "", ...saveGrowth(Number(values["save-seasons"])), "");
lines.push(`Load average at the end: ${loadavg().map((n) => n.toFixed(1)).join(", ")}.`, "", TABLES_END);

const output = lines.join("\n");
if (values.write) {
  const file = readFileSync(values.write, "utf8");
  const [start, end] = [file.indexOf(TABLES_START), file.indexOf(TABLES_END)];
  if (start < 0 || end < start) throw new Error(`${values.write} has no ${TABLES_START} … ${TABLES_END} block`);
  writeFileSync(values.write, file.slice(0, start) + output + file.slice(end + TABLES_END.length));
} else console.log(output);
