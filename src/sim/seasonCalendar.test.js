import { describe, expect, it } from "vitest";
import { seasonCalendar } from "./seasonCalendar.js";
const DAY = 86_400_000;
const days = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;
const counts = { A: 38, B: 38, C: 27, D: 22 };
describe("seasonCalendar", () => {
    for (const season of [2026, 2027, 2031]) {
        describe(`season ${season}`, () => {
            const calendar = seasonCalendar(season, counts);
            const reserved = [...calendar.stateChampionshipDates, ...calendar.copaDoBrasilRounds.flatMap((round) => round.dates)];
            it("gives each league the dates it asks for, inside the season year", () => {
                for (const division of ["A", "B", "C", "D"]) {
                    const dates = calendar.leagueDates[division];
                    expect(dates).toHaveLength(counts[division]);
                    expect(dates.every((date) => date.startsWith(`${season}-`))).toBe(true);
                }
            });
            it("leaves at least two rest days between any two of a club's possible games", () => {
                for (const dates of Object.values(calendar.leagueDates)) {
                    const all = [...dates, ...reserved].sort();
                    for (let i = 1; i < all.length; i++)
                        expect(days(all[i - 1] ?? "", all[i] ?? "")).toBeGreaterThanOrEqual(3);
                }
            });
            it("reserves 11 state championship dates from January and the Copa do Brasil from February to December", () => {
                expect(calendar.stateChampionshipDates).toHaveLength(11);
                expect(calendar.stateChampionshipDates[0]?.slice(5, 7)).toBe("01");
                expect(calendar.copaDoBrasilRounds[0]?.dates[0]?.slice(5, 7)).toBe("02");
                expect(calendar.copaDoBrasilRounds.at(-1)?.dates.at(-1)?.slice(5, 7)).toBe("12");
            });
            it("plays league rounds on weekends and midweek", () => {
                const weekdays = new Set(calendar.leagueDates.A.map((date) => new Date(date).getUTCDay()));
                expect(weekdays.has(3)).toBe(true);
                expect(weekdays.has(0) || weekdays.has(6)).toBe(true);
            });
        });
    }
    it("throws when a league needs more dates than its window holds", () => {
        expect(() => seasonCalendar(2026, { ...counts, D: 200 })).toThrow();
    });
});
