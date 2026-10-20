import { describe, expect, it } from "vitest";
import { randomStream, seededRandom } from "./random.js";
describe("randomStream", () => {
    it("continues from a saved state exactly where the original stream goes", () => {
        const original = randomStream(99);
        original.next();
        original.next();
        const resumed = randomStream(original.state());
        expect([resumed.next(), resumed.next()]).toEqual([original.next(), original.next()]);
    });
    it("produces the same sequence as seededRandom for the same seed", () => {
        const stream = randomStream(5);
        const random = seededRandom(5);
        expect([stream.next(), stream.next()]).toEqual([random(), random()]);
    });
});
