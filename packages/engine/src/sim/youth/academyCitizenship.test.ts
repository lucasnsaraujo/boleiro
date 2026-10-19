import { describe, expect, it } from "vitest";
import { RAPIDO } from "../formats.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadEurope } from "../world/loadEurope.js";
import { fillShortSquads } from "./fillShortSquads.js";

const ARSENAL = "tm-11";

describe("a club abroad short of players", () => {
  it("fills its squad with teenagers of its own country", () => {
    const start = loadNewGame(5, { coachClubId: ARSENAL, world: loadEurope(2026), formats: RAPIDO });
    const keepers = Object.values(start.players).filter((p) => p.clubId === ARSENAL && p.group === "GK");
    const outfield = Object.values(start.players).filter((p) => p.clubId === ARSENAL && p.group !== "GK").slice(0, 10);
    const gone = new Set([...keepers, ...outfield].map((p) => p.id));
    const short = { ...start, players: Object.fromEntries(Object.entries(start.players).filter(([id]) => !gone.has(id))) };
    const filled = fillShortSquads(short).state;
    const newcomers = Object.values(filled.players).filter((p) => p.clubId === ARSENAL && !(p.id in short.players));
    expect(newcomers.length).toBeGreaterThan(0);
    for (const kid of newcomers) expect(kid.nationalities).toEqual(["England"]);
  });
});
