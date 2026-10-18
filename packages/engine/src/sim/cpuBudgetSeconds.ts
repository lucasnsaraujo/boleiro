/** The CPU seconds `referenceWorkload` takes on the machine the game's speed budgets were set on, an Apple M4 Pro. */
const REFERENCE_MACHINE_SECONDS = 0.075;
const RUNS = 5;
const PLAYERS = 50_000;
const CLUBS = 400;

/**
 * A fixed workload shaped like the engine's days: seeded draws, string-keyed lookups spread over a large roster, records
 * copied on every change and a table sorted each day. No game code runs in it, so it times the machine, never the engine.
 */
function referenceWorkload(): number {
  let seed = 1;
  const random = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 2 ** 32;
  };
  const playerAt = () => `player-${Math.floor(random() * PLAYERS)}`;
  const roster = new Map(Array.from({ length: PLAYERS }, (_, i) => [`player-${i}`, { rating: 40 + random() * 50, goals: 0 }]));
  const clubs = Array.from({ length: CLUBS }, (_, i) => ({ id: `club-${i}`, points: 0 }));
  let leader = "";
  for (let day = 0; day < 100; day++) {
    for (let match = 0; match < 300; match++) {
      let attack = 0;
      for (let slot = 0; slot < 11; slot++) attack += roster.get(playerAt())?.rating ?? 0;
      const scorerId = playerAt();
      const scorer = roster.get(scorerId);
      if (scorer && random() < attack / 1000) roster.set(scorerId, { ...scorer, goals: scorer.goals + 1 });
      const club = clubs[match % CLUBS];
      if (club) clubs[match % CLUBS] = { ...club, points: club.points + (attack > 550 ? 3 : 0) };
    }
    leader = [...clubs].sort((a, b) => b.points - a.points || (a.id < b.id ? -1 : 1))[0]?.id ?? "";
  }
  return leader.length;
}

function referenceWorkloadSeconds(): number {
  const started = process.cpuUsage();
  if (referenceWorkload() === 0) throw new Error("the reference workload found no leader");
  const used = process.cpuUsage(started);
  return (used.user + used.system) / 1e6;
}

/**
 * A speed budget set on the reference machine, in CPU seconds on this one: as many times longer as this machine takes
 * over the reference workload, and never shorter than the budget itself. So the reference machine keeps the budget as
 * set, and a slower one, such as CI's 2-core runner, gets the same budget for its speed.
 */
export function cpuBudgetSeconds(budget: number): number {
  const runs = Array.from({ length: RUNS }, referenceWorkloadSeconds).sort((a, b) => a - b);
  const median = runs[Math.floor(RUNS / 2)] ?? REFERENCE_MACHINE_SECONDS;
  return budget * Math.max(1, median / REFERENCE_MACHINE_SECONDS);
}
