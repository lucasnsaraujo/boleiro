import { describe, expect, it } from "vitest";
import { leaguePhaseTable, openingEuropeanCups, playEuropeDay, type EuropeanCups } from "@boleiro/engine/sim/continental/uefaCups";
import { addDays } from "@boleiro/engine/sim/dates";
import { loadEurope } from "@boleiro/engine/sim/world/loadEurope";
import { playWorldDay, startCountry } from "@boleiro/engine/sim/world/resultOnlyWorld";
import type { World } from "@boleiro/engine/sim/world/world";
import { worldLeagueTables } from "./competitionTables.js";
import { uefaBracket, uefaLeaguePhase, uefaPlayoffs } from "./uefaTables.js";

let world: World = Object.fromEntries(loadEurope(2026).map(({ structure, levels }, i) => [structure.id, startCountry(structure, levels, 2026, i)]));
const opening = openingEuropeanCups(world, 2);
if (!opening) throw new Error("no European cups");
let europe: EuropeanCups = opening;
for (let date = "2026-08-01"; date < "2027-03-12"; date = addDays(date, 1)) {
  world = playWorldDay(world, date);
  europe = playEuropeDay(europe, world, date);
}
const [championsLeague] = europe.cups;
if (!championsLeague) throw new Error("no Champions League");

describe("the Champions League's pages", () => {
  it("show the league phase as one table of 36, the top eight to the round of 16 and 9th to 24th to the play-offs", () => {
    const [table] = uefaLeaguePhase(championsLeague).groups;
    expect(table?.rows.map((row) => row.clubId)).toEqual(leaguePhaseTable(championsLeague));
    expect(table?.rows.map((row) => row.zone)).toEqual([...Array<string>(8).fill("advance"), ...Array<string>(16).fill("playoff"), ...Array<null>(12).fill(null)]);
    expect(uefaLeaguePhase(championsLeague).zones.map((z) => z.label)).toEqual(["Oitavas", "Playoffs"]);
  });

  it("list the play-off ties with both legs and who went through", () => {
    const ties = uefaPlayoffs(championsLeague);
    expect(ties).toHaveLength(8);
    for (const tie of ties) {
      expect(tie.legs).toHaveLength(2);
      expect(tie.clubIds).toContain(tie.winnerId);
      expect(tie.legs[1]?.homeId).toBe(tie.clubIds[0]);
    }
  });

  it("draw the bracket from the round of 16, its first legs played and the later rounds still open", () => {
    const rounds = uefaBracket(championsLeague);
    expect(rounds.map((round) => [round.name, round.ties.length])).toEqual([
      ["Oitavas", 8],
      ["Quartas", 4],
      ["Semifinal", 2],
      ["Final", 1],
    ]);
    const [roundOf16, quarterFinals] = rounds;
    expect(roundOf16?.ties.every((tie) => tie?.legs[0]?.homeGoals !== null && tie?.winnerId === null)).toBe(true);
    expect(quarterFinals?.ties.every((tie) => tie === null)).toBe(true);
  });
});

describe("a European league's table", () => {
  it("marks England's Champions League and Europa League places", () => {
    const [premierLeague] = worldLeagueTables({ world }, "gb-eng");
    expect(premierLeague?.rows.slice(0, 9).map((row) => row.zone)).toEqual([
      ...Array<string>(5).fill("championsLeague"),
      ...Array<string>(3).fill("europaLeague"),
      null,
    ]);
    expect(premierLeague?.rows.slice(-3).map((row) => row.zone)).toEqual(["relegation", "relegation", "relegation"]);
  });
});
