import { transferFlow } from "./transferFlow.js";

const SEASONS = Number(process.argv[2] ?? 10);
const SEED = Number(process.argv[3] ?? 1);

const percent = (value: number) => `${(100 * value).toFixed(1)}%`;
const started = performance.now();
const { flows, top } = transferFlow(SEED, SEASONS);
console.log(`${SEASONS} seasons, seed ${SEED}, ${((performance.now() - started) / 1000).toFixed(1)}s`);
console.log("season europe abroad domestic free  pre   loans  foreign A / B / C / D / state");
for (const f of flows) {
  const counts = [f.season, f.toEurope, f.fromAbroad, f.domestic, f.freeAgents, f.preContracts, f.loans];
  const shares = [f.foreignShare.A, f.foreignShare.B, f.foreignShare.C, f.foreignShare.D, f.foreignShare.state].map(percent).join(" / ");
  console.log(`${counts.map((c, i) => String(c).padEnd([7, 7, 7, 9, 6, 6, 7][i] ?? 6)).join("")}${shares}`);
}
console.log("top transfers (BRL):");
for (const t of top) console.log(`  ${t.season} ${t.name}: ${t.from ?? "abroad"} → ${t.to ?? "Europe"} (${t.kind}) R$${(t.fee / 1e6).toFixed(1)}M`);
