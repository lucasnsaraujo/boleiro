import { describe, expect, it } from "vitest";
import { loadClubs } from "./clubs.js";
import { loadPlayers, loadTeams, parsePlayers } from "./players.js";
describe("loadPlayers", () => {
    it("links every player to a club in clubs.csv", () => {
        const clubIds = new Set(loadClubs().map((club) => club.id));
        const players = loadPlayers();
        expect(players.length).toBeGreaterThan(0);
        expect(players.filter((player) => !clubIds.has(player.clubId))).toEqual([]);
    });
    it("reads each player's age and nationalities", () => {
        const rossi = loadPlayers().find((player) => player.name === "Agustín Rossi");
        expect(rossi).toMatchObject({ nationalities: ["Argentina", "Italy"] });
        expect(rossi?.age).toBeGreaterThan(25);
        expect(loadPlayers().filter((player) => player.age === null).length).toBeLessThan(20);
    });
});
describe("parsePlayers", () => {
    const header = "division,club_id,club,name,group,age,nationality,strength";
    const row = (fields) => `${header}\nA,${fields.club_id ?? "flamengo-rj"},Flamengo,Rossi,${fields.group ?? "GK"},${fields.age ?? "29"},Argentina,${fields.strength ?? "70"}`;
    it("reads a good row", () => {
        expect(parsePlayers(row({}))).toMatchObject([{ clubId: "flamengo-rj", group: "GK", strength: 70, age: 29 }]);
    });
    it.each([
        ["an unknown position group", { group: "WING" }],
        ["a missing club", { club_id: "" }],
        ["a strength that is not a number", { strength: "strong" }],
        ["a strength outside 1–99", { strength: "120" }],
        ["an age that is not a number", { age: "old" }],
    ])("refuses a row with %s instead of dropping it", (_, fields) => {
        expect(() => parsePlayers(row(fields))).toThrow();
    });
});
describe("loadTeams", () => {
    it("builds the twenty Série A squads", () => {
        const teams = loadTeams("A");
        expect(teams).toHaveLength(20);
        expect(teams.every((team) => team.players.length >= 18)).toBe(true);
    });
});
