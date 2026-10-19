import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Division } from "@boleiro/data/players";
import { realDivisionRates, realSerieARates } from "../engine/calibration.js";
import { DIVISION_GAPS, realCupUpsets } from "../engine/cupUpsets.js";
import { CARD_RATES, LEAGUE_ABROAD_CARD_RATES, realCardsPerGame, type CardCompetition } from "../sim/discipline/cardRates.js";
import { compareMean, compareShare, type Comparison } from "./calibrationBands.js";
import { realAbroadRates } from "./realAbroadRates.js";
import { gitCommit } from "./gitCommit.js";
import { goalsPerMatch, goalsVariance, mergeScoreTallies, type ScoreTally } from "./scoreTally.js";
import { v1WorldStart } from "./v1World.js";
import { worldCalibrationRun, type WorldCalibrationRun } from "./worldCalibrationRun.js";

const TABLES_START = "<!-- tables:start -->";
const TABLES_END = "<!-- tables:end -->";

// The tolerances of the engine's calibration tests (engine/calibration.test.ts); abroad takes Série B's.
const FLOORS: Record<Division, { share: number; goals: number }> = { A: { share: 0.02, goals: 0.1 }, B: { share: 0.02, goals: 0.1 }, C: { share: 0.025, goals: 0.1 }, D: { share: 0.04, goals: 0.2 } };
const ABROAD_FLOOR = FLOORS.B;
const CUP_SHARE_FLOOR = 0.05;
// A cup group the simulation filled with fewer matches than this says nothing about its rates.
const MIN_CUP_GAMES = 30;
const YELLOWS_FLOOR = 0.3;
const REDS_FLOOR = 0.05;
// ESPN's card sample: 760 Série A and 760 Série B matches, 141 Copa do Brasil (cardRates.ts); C, D and the states borrow rates, so they have no real sample.
const REAL_CARD_GAMES: Partial<Record<CardCompetition, number>> = { A: 760, B: 760, cup: 141 };

const pct = (share: number) => (100 * share).toFixed(1);
const signed = (value: number, digits: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`;
const share = (tally: ScoreTally, of: "home" | "draw" | "away") => tally[of] / Math.max(1, tally.matches);

type Real = { matches: number; home: number; draw: number; away: number; goalsPerGame: number; goalsVariance: number | null };

/** One league's simulated results against its real ones: the cells of a table row and which metrics fell outside their band. */
function leagueRow(label: string, sim: ScoreTally, real: Real, floor: { share: number; goals: number }, seedGoals: readonly number[] | null) {
  const variance = real.goalsVariance ?? goalsVariance(sim);
  const comparisons: [string, Comparison, number][] = [
    ["home", compareShare(real.home, share(sim, "home"), real.matches, sim.matches, floor.share), 100],
    ["draw", compareShare(real.draw, share(sim, "draw"), real.matches, sim.matches, floor.share), 100],
    ["away", compareShare(real.away, share(sim, "away"), real.matches, sim.matches, floor.share), 100],
    ["goals", compareMean(real.goalsPerGame, goalsPerMatch(sim), variance, real.matches, sim.matches, floor.goals), 1],
  ];
  const failed = comparisons.filter(([, c]) => !c.pass).map(([name, c, scale]) => `${name} ${signed((c.simulated - c.real) * scale, scale === 1 ? 2 : 1)} (band ${(c.band * scale).toFixed(scale === 1 ? 2 : 1)})`);
  const cell = ([, c, scale]: [string, Comparison, number]) => (scale === 1 ? `${c.simulated.toFixed(2)} / ${c.real.toFixed(2)}` : `${pct(c.simulated)} / ${pct(c.real)}`);
  const spread = seedGoals ? ` | ${Math.min(...seedGoals).toFixed(2)}–${Math.max(...seedGoals).toFixed(2)}` : "";
  const row = `| ${label} | ${sim.matches} | ${real.matches} | ${comparisons.map(cell).join(" | ")}${spread} | ${failed.length ? `fail: ${failed.join("; ")}` : "pass"} |`;
  return { row, passed: failed.length === 0 };
}

const seedGoals = (runs: readonly WorldCalibrationRun[], pick: (run: WorldCalibrationRun) => ScoreTally | undefined) =>
  runs.map((run) => pick(run)).filter((tally): tally is ScoreTally => tally !== undefined && tally.matches > 0).map(goalsPerMatch);

function brazilTable(runs: readonly WorldCalibrationRun[]): { lines: string[]; passed: number; total: number } {
  const rows = (["A", "B", "C", "D"] as const).map((division) => {
    const sim = mergeScoreTallies(runs.map((run) => run.leagues[division]));
    const real: Real =
      division === "A"
        ? { ...realSerieARates(), goalsVariance: null }
        : { ...realDivisionRates(division), goalsVariance: null };
    return leagueRow(`Série ${division}`, sim, real, FLOORS[division], seedGoals(runs, (run) => run.leagues[division]));
  });
  return {
    lines: [
      "| Division | Games B | Games real | Home % B / real | Draw % B / real | Away % B / real | Goals/game B / real | Goals/game per seed | Verdict |",
      "|---|---|---|---|---|---|---|---|---|",
      ...rows.map((r) => r.row),
    ],
    passed: rows.filter((r) => r.passed).length,
    total: rows.length,
  };
}

function cardsTable(runs: readonly WorldCalibrationRun[]): { lines: string[]; passed: number; total: number } {
  const keys: { key: CardCompetition; label: string }[] = [
    { key: "A", label: "Série A" },
    { key: "B", label: "Série B" },
    { key: "C", label: "Série C" },
    { key: "D", label: "Série D" },
    { key: "cup", label: "Copa do Brasil and the continental cups" },
    { key: "state", label: "Estaduais" },
  ];
  let passed = 0;
  let total = 0;
  const lines = keys.map(({ key, label }) => {
    const games = runs.reduce((sum, run) => sum + (run.cards[key]?.games ?? 0), 0);
    const yellows = runs.reduce((sum, run) => sum + (run.cards[key]?.yellows ?? 0), 0) / games;
    const reds = runs.reduce((sum, run) => sum + (run.cards[key]?.reds ?? 0), 0) / games;
    const real = realCardsPerGame(key);
    const realGames = REAL_CARD_GAMES[key];
    if (!realGames) return `| ${label} | ${games} | ${yellows.toFixed(2)} | ${real.yellows.toFixed(2)} | ${reds.toFixed(3)} | ${real.reds.toFixed(3)} | no real sample, rates borrowed from ${key === "state" || key === "cup" ? "the Copa do Brasil" : "Série B"} |`;
    const yellow = compareMean(real.yellows, yellows, real.yellows, realGames, games, YELLOWS_FLOOR);
    const red = compareMean(real.reds, reds, real.reds, realGames, games, REDS_FLOOR);
    total += 2;
    passed += Number(yellow.pass) + Number(red.pass);
    const failed = [yellow.pass ? null : `yellows ${signed(yellows - real.yellows, 2)} (band ${yellow.band.toFixed(2)})`, red.pass ? null : `reds ${signed(reds - real.reds, 3)} (band ${red.band.toFixed(3)})`].filter(Boolean);
    return `| ${label} | ${games} | ${yellows.toFixed(2)} | ${real.yellows.toFixed(2)} | ${reds.toFixed(3)} | ${real.reds.toFixed(3)} | ${failed.length ? `fail: ${failed.join("; ")}` : "pass"} |`;
  });
  return { lines: ["| Competition | Games B | Yellows/game B | Yellows/game real | Reds/game B | Reds/game real | Verdict |", "|---|---|---|---|---|---|---|", ...lines], passed, total };
}

function cupUpsetsTable(runs: readonly WorldCalibrationRun[]): { lines: string[]; passed: number; total: number } {
  const real = realCupUpsets();
  let passed = 0;
  let judged = 0;
  const rows = DIVISION_GAPS.flatMap((gap) =>
    (["home", "away"] as const).map((venue) => {
      const key = `${gap}-${venue}` as const;
      const games = runs.reduce((sum, run) => sum + (run.cupUpsets[key]?.matches ?? 0), 0);
      const count = (field: "win" | "draw" | "loss") => runs.reduce((sum, run) => sum + (run.cupUpsets[key]?.[field] ?? 0), 0) / Math.max(1, games);
      const target = real.find((g) => g.gap === gap && g.venue === venue);
      if (!target) return `| ${gap} | ${venue} | ${games} | - | - | - | - | no real group |`;
      if (games < MIN_CUP_GAMES) return `| ${gap} | ${venue} | ${games} | ${target.matches} | - | - | - | too few simulated games, not judged |`;
      judged++;
      const comparisons = (["win", "draw", "loss"] as const).map((field) => ({ field, ...compareShare(target[field], count(field), target.matches, games, CUP_SHARE_FLOOR) }));
      const failed = comparisons.filter((c) => !c.pass).map((c) => `${c.field} ${signed((c.simulated - c.real) * 100, 0)} (band ${(c.band * 100).toFixed(0)})`);
      if (failed.length === 0) passed++;
      const cell = (c: (typeof comparisons)[number]) => `${(c.simulated * 100).toFixed(0)} / ${(c.real * 100).toFixed(0)}`;
      return `| ${gap} | ${venue} | ${games} | ${target.matches} | ${comparisons.map(cell).join(" | ")} | ${failed.length ? `fail: ${failed.join("; ")}` : "pass"} |`;
    }),
  );
  return {
    lines: ["| Gap | Favourite plays | Games B | Games real | Favourite wins % B / real | Draws % B / real | Loses % B / real | Verdict |", "|---|---|---|---|---|---|---|---|", ...rows],
    passed,
    total: judged,
  };
}

/** Goals per game and home share of each Brazilian division in each season of the runs, next to the real figure, to show whether the leagues drift away from it. */
function driftTable(runs: readonly WorldCalibrationRun[], seasons: number): string[] {
  const divisions = ["A", "B", "C", "D"] as const;
  const real = { A: realSerieARates(), B: realDivisionRates("B"), C: realDivisionRates("C"), D: realDivisionRates("D") };
  const header = `| Division | Real | ${Array.from({ length: seasons }, (_, i) => `Season ${i + 1}`).join(" | ")} |`;
  return [
    "Goals per game, then home win % in brackets, over all seeds.",
    "",
    header,
    `|---|---|${"---|".repeat(seasons)}`,
    ...divisions.map((division) => {
      const cells = Array.from({ length: seasons }, (_, i) => {
        const tally = mergeScoreTallies(runs.map((run) => run.leaguesBySeason[i]?.[division]).filter((t): t is ScoreTally => t !== undefined));
        return `${goalsPerMatch(tally).toFixed(2)} (${pct(share(tally, "home"))})`;
      });
      return `| Série ${division} | ${real[division].goalsPerGame.toFixed(2)} (${pct(real[division].home)}) | ${cells.join(" | ")} |`;
    }),
  ];
}

const LEAGUE_NAMES = new Map<string, string>();
function nameLeagues(): void {
  const start = v1WorldStart(1);
  for (const [id, country] of Object.entries(start.world ?? {})) {
    country.structure.levels.forEach((level, i) => LEAGUE_NAMES.set(`${id}-${i + 1}`, `${level.name} (${id.toUpperCase()}${i + 1})`));
  }
}

function abroadTables(runs: readonly WorldCalibrationRun[]) {
  const real = realAbroadRates();
  const keys = new Set(runs.flatMap((run) => [...run.abroadLeagues.keys()]));
  const merged = (key: string): { seasons: number; tally: ScoreTally; perSeed: number[] } => {
    const entries = runs.map((run) => run.abroadLeagues.get(key)).filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
    return { seasons: entries.reduce((sum, e) => sum + e.seasons, 0), tally: mergeScoreTallies(entries.map((e) => e.tally)), perSeed: entries.map((e) => goalsPerMatch(e.tally)) };
  };
  const compared: string[] = [];
  const unreferenced: string[] = [];
  let passed = 0;
  let total = 0;
  const failedKeys: string[] = [];
  for (const key of [...keys].sort()) {
    const sim = merged(key);
    const target = real.get(key);
    const name = LEAGUE_NAMES.get(key) ?? key;
    if (!target) {
      unreferenced.push(`| ${name} | ${sim.seasons} | ${sim.tally.matches} | ${pct(share(sim.tally, "home"))} | ${pct(share(sim.tally, "draw"))} | ${pct(share(sim.tally, "away"))} | ${goalsPerMatch(sim.tally).toFixed(2)} |`);
      continue;
    }
    const realRates: Real = {
      matches: target.matches,
      home: target.home / target.matches,
      draw: target.draw / target.matches,
      away: target.away / target.matches,
      goalsPerGame: target.goals / target.matches,
      goalsVariance: target.goalsSquared / target.matches - (target.goals / target.matches) ** 2,
    };
    const row = leagueRow(`${name}`, sim.tally, realRates, ABROAD_FLOOR, sim.perSeed);
    total++;
    if (row.passed) passed++;
    else failedKeys.push(key);
    compared.push(row.row.replace(/^\| ([^|]*) \| (\d+) \|/, (_, label: string, games: string) => `| ${label} | ${sim.seasons} / ${target.seasons} | ${games} |`));
  }
  const cards = [...real.entries()]
    .filter(([, r]) => r.cardMatches > 0)
    .map(([key, r]) => {
      const rates = LEAGUE_ABROAD_CARD_RATES[key] ?? CARD_RATES.A;
      const gameYellows = rates.home.yellows + rates.away.yellows;
      const gameReds = rates.home.reds + rates.away.reds;
      return `| ${LEAGUE_NAMES.get(key) ?? key} | ${r.cardMatches} | ${(r.yellows / r.cardMatches).toFixed(2)} | ${gameYellows.toFixed(2)} | ${(r.reds / r.cardMatches).toFixed(3)} | ${gameReds.toFixed(3)} |`;
    });
  return {
    compared: [
      "| League | League seasons B / real | Games B | Games real | Home % B / real | Draw % B / real | Away % B / real | Goals/game B / real | Goals/game per seed-run | Verdict |",
      "|---|---|---|---|---|---|---|---|---|---|",
      ...compared,
    ],
    unreferenced: ["| League | League seasons | Games | Home % | Draw % | Away % | Goals/game |", "|---|---|---|---|---|---|---|", ...unreferenced],
    cards: ["| League | Real games with cards | Yellows/game real | Yellows/game, full tier abroad | Reds/game real | Reds/game, full tier abroad |", "|---|---|---|---|---|---|", ...cards],
    passed,
    total,
    failedKeys,
  };
}

function othersTable(runs: readonly WorldCalibrationRun[]): string[] {
  const labels = [...new Set(runs.flatMap((run) => [...run.others.keys()]))].sort();
  return [
    "| Competition | Games | Home % | Draw % | Away % | Goals/game |",
    "|---|---|---|---|---|---|",
    ...labels.map((label) => {
      const tally = mergeScoreTallies(runs.flatMap((run) => run.others.get(label) ?? []));
      return `| ${label} | ${tally.matches} | ${pct(share(tally, "home"))} | ${pct(share(tally, "draw"))} | ${pct(share(tally, "away"))} | ${goalsPerMatch(tally).toFixed(2)} |`;
    }),
  ];
}

function abroadCupsTable(runs: readonly WorldCalibrationRun[]): string[] {
  const countries = [...new Set(runs.flatMap((run) => [...run.abroadCups.keys()]))].sort();
  return [
    "| Cup of | Games | Home % | Draw % | Away % | Goals/game |",
    "|---|---|---|---|---|---|",
    ...countries.map((id) => {
      const tally = mergeScoreTallies(runs.flatMap((run) => run.abroadCups.get(id) ?? []));
      return `| ${id.toUpperCase()} | ${tally.matches} | ${pct(share(tally, "home"))} | ${pct(share(tally, "draw"))} | ${pct(share(tally, "away"))} | ${goalsPerMatch(tally).toFixed(2)} |`;
    }),
  ];
}

function tables(runs: readonly WorldCalibrationRun[], seasons: number): string[] {
  const brazil = brazilTable(runs);
  const cards = cardsTable(runs);
  const cup = cupUpsetsTable(runs);
  const abroad = abroadTables(runs);
  return [
    TABLES_START,
    "",
    `Generated by \`pnpm calibration:report --seeds ${runs.length} --seasons ${seasons}\`: ${runs.length} seeds (1 to ${runs.length}) × ${seasons} seasons of the v1 world, no human coach, starting in 2026, at commit ${gitCommit()}.`,
    "",
    "## Verdicts at a glance",
    "",
    "| Check | Passed |",
    "|---|---|",
    `| Brazil league results (home, draw, away and goals per division) | ${brazil.passed} of ${brazil.total} divisions |`,
    `| Brazil cards (Série A, B and the Copa do Brasil, the ones with a real sample) | ${cards.passed} of ${cards.total} numbers |`,
    `| Copa do Brasil results by division gap and venue | ${cup.passed} of ${cup.total} groups |`,
    `| Leagues abroad with real results | ${abroad.passed} of ${abroad.total} leagues |`,
    "",
    "## Brazil's leagues",
    "",
    ...brazil.lines,
    "",
    "### Brazil's leagues by season",
    "",
    ...driftTable(runs, seasons),
    "",
    "## Brazil's cards",
    "",
    ...cards.lines,
    "",
    "## Copa do Brasil upsets",
    "",
    ...cup.lines,
    "",
    "## Leagues abroad: results",
    "",
    ...abroad.compared,
    "",
    "## Leagues abroad: cards",
    "",
    ...abroad.cards,
    "",
    "## Leagues abroad without a real reference",
    "",
    ...abroad.unreferenced,
    "",
    "## Other competitions the game plays with a full match engine",
    "",
    ...othersTable(runs),
    "",
    "## National cups abroad, result-only",
    "",
    ...abroadCupsTable(runs),
    "",
    TABLES_END,
  ];
}

const { values } = parseArgs({ options: { seeds: { type: "string", default: "8" }, seasons: { type: "string", default: "4" }, write: { type: "string" } } });
const seedCount = Number(values.seeds);
const seasonCount = Number(values.seasons);
nameLeagues();
const runs = Array.from({ length: seedCount }, (_, i) => {
  const started = performance.now();
  const run = worldCalibrationRun(i + 1, seasonCount);
  console.error(`seed ${i + 1}: ${((performance.now() - started) / 1000).toFixed(1)} s`);
  return run;
});
const output = tables(runs, seasonCount).join("\n");
if (values.write) {
  const file = readFileSync(values.write, "utf8");
  const [start, end] = [file.indexOf(TABLES_START), file.indexOf(TABLES_END)];
  if (start < 0 || end < start) throw new Error(`${values.write} has no ${TABLES_START} … ${TABLES_END} block`);
  writeFileSync(values.write, file.slice(0, start) + output + file.slice(end + TABLES_END.length));
} else console.log(output);
