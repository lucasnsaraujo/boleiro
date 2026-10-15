import { RAPIDO, REALISTA, type Formats } from "../sim/formats.js";
import { loadEurope } from "../sim/world/loadEurope.js";
import { loadSouthAmerica } from "../sim/world/loadSouthAmerica.js";
import { millions } from "./millions.js";
import { seasonRevenues } from "./seasonRevenues.js";

const SEED = Number(process.argv[2] ?? 1);
const CLUBS = ["flamengo-rj", "palmeiras-sp", "fortaleza-ce", "goias-go", "remo-pa", "ferroviaria-sp"];
const MODES: [string, Formats][] = [
  ["Realista", REALISTA],
  ["Rápido", RAPIDO],
  ["one-leg leagues, single ties", { ...RAPIDO, leagueLegs: 1, knockouts: "single" }],
];

const world = [...loadSouthAmerica(2026), ...loadEurope(2026)];
console.log(`Season 2026, seed ${SEED}, whole world, no coach: revenue without player sales, its tickets, and wages, per club`);
for (const [name, formats] of MODES) {
  const started = performance.now();
  const { clubSeasons, forcedSales, lateWageClosings, state } = seasonRevenues(SEED, 1, { world, formats });
  console.log(`\n## ${name} (${((performance.now() - started) / 1000).toFixed(1)}s; forced sales ${forcedSales}, late-wage closings ${lateWageClosings})`);
  console.log("club               tier  revenue   tickets   wages     revenue/wages");
  for (const clubId of CLUBS) {
    const season = clubSeasons.find((c) => c.clubId === clubId);
    const books = state.finances[clubId]?.lastSeason;
    if (!season || !books) continue;
    const wages = books.costs.wages;
    const row = [millions(season.revenue), millions(books.revenue.tickets), millions(wages)].map((v) => v.padEnd(10)).join("");
    console.log(`${clubId.padEnd(19)}${season.tier.padEnd(6)}${row}${(season.revenue / wages).toFixed(2)}`);
  }
}
