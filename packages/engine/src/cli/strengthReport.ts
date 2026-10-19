import { strengthBySeason } from "./strengthBySeason.js";

const SEASONS = Number(process.argv[2] ?? 10);
const SEED = Number(process.argv[3] ?? 1);

const started = performance.now();
const { bands, retired, youth, injuries } = strengthBySeason(SEED, SEASONS);
console.log(`${SEASONS} seasons, seed ${SEED}, ${((performance.now() - started) / 1000).toFixed(1)}s`);
console.log(`retired ${retired}, youth players ${youth}, match injuries ${injuries}`);
console.log("season tier   players mean  p10   p90   mean age");
for (const b of bands) {
  const cells = [b.season, b.tier, b.players, b.mean.toFixed(1), b.p10.toFixed(1), b.p90.toFixed(1), b.meanAge.toFixed(1)];
  console.log(cells.map((c, i) => String(c).padEnd([7, 7, 8, 6, 6, 6, 6][i] ?? 6)).join(""));
}
