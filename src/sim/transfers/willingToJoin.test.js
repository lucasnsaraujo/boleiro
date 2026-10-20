import { describe, expect, it } from "vitest";
import { willingToJoin } from "./willingToJoin.js";
const brazilian = { id: "p1", age: 26, nationalities: ["Brazil"], wage: 100_000 };
const big = { tier: "A", fanbase: 20_000_000 };
const small = { tier: "D", fanbase: 50_000 };
const midB = { tier: "B", fanbase: 500_000 };
const move = (overrides) => ({ player: brazilian, from: "B", to: big, wage: 100_000, ...overrides });
describe("willingToJoin", () => {
    it("makes a step up to a big Série A club very likely", () => {
        expect(willingToJoin(move({}))).toBeGreaterThan(0.8);
    });
    it("makes a drop from Série A to Série D for the same wage unlikely", () => {
        expect(willingToJoin(move({ from: "A", to: small }))).toBeLessThan(0.15);
    });
    it("lets a better wage win a reluctant player over", () => {
        const flat = willingToJoin(move({ from: "A", to: midB }));
        expect(willingToJoin(move({ from: "A", to: midB, wage: 200_000 }))).toBeGreaterThan(flat + 0.2);
    });
    it("makes a veteran far readier to drop a division than a player in his prime", () => {
        const prime = willingToJoin(move({ from: "A", to: midB }));
        expect(willingToJoin(move({ from: "A", to: midB, player: { ...brazilian, age: 33 } }))).toBeGreaterThan(prime + 0.15);
    });
    it("almost never brings a European in his prime from abroad, but often brings veterans and returning Brazilians", () => {
        const european = { id: "e1", age: 26, nationalities: ["Spain"], wage: 300_000 };
        expect(willingToJoin({ player: european, from: "abroad", to: big, wage: 300_000 })).toBeLessThan(0.03);
        expect(willingToJoin({ player: { ...european, age: 33 }, from: "abroad", to: big, wage: 300_000 })).toBeGreaterThan(0.3);
        expect(willingToJoin({ player: { ...brazilian, age: 31 }, from: "abroad", to: big, wage: 100_000 })).toBeGreaterThan(0.4);
    });
    it("makes a player readier to drop a division on loan than for good", () => {
        expect(willingToJoin(move({ from: "A", to: midB, loan: true }))).toBeGreaterThan(willingToJoin(move({ from: "A", to: midB })) + 0.2);
    });
    it("keeps foreigners away from the lower divisions", () => {
        const argentine = { id: "a1", age: 28, nationalities: ["Argentina"], wage: 50_000 };
        expect(willingToJoin({ player: argentine, from: "abroad", to: small, wage: 50_000 })).toBeLessThan(0.05);
    });
});
