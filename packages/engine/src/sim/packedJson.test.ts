import { describe, expect, it } from "vitest";
import { packJson, unpackJson } from "./packedJson.js";

const roundTrip = (value: unknown) => JSON.stringify(unpackJson(packJson(value)));

describe("packed JSON", () => {
  it("reads back exactly what JSON.stringify writes, key order included", () => {
    const value = {
      players: { b: { id: "b", age: 30, condition: { fatigue: 1.5, injuredUntil: null } }, a: { age: 21, id: "a", condition: { fatigue: 0, injuredUntil: "2026-02-01" } } },
      marks: [{ season: 2026, strength: 42 }, { season: 2027, strength: 43.5 }, { season: 2028, strength: 45.7 }],
      list: [1, "two", null, true, [{ season: 1, strength: 2 }]],
      left: { kept: 1, dropped: undefined },
      empty: [{}, {}, []],
    };
    expect(roundTrip(value)).toBe(JSON.stringify(value));
  });

  it("keeps a list whose first item looks like its marks", () => {
    const value = { marks: ["~0", "~", "x"], shape: [{ a: 1 }, { a: 2 }], again: [["~"], ["~x", 1]] };
    expect(roundTrip(value)).toBe(JSON.stringify(value));
  });

  it("keeps keys that look like its marks or its own fields", () => {
    const value = { list: [{ "~1": 1, a: 2 }, { "~1": 3, a: 4 }], shapes: { once: true }, packed: 1, value: [{ shapes: 1 }, { shapes: 2 }] };
    expect(roundTrip(value)).toBe(JSON.stringify(value));
  });

  it("keeps a key named __proto__ as JSON.parse reads it", () => {
    const text = '{"list":[{"__proto__":1,"a":2},{"__proto__":3,"a":4}],"one":{"__proto__":{"x":1}}}';
    expect(JSON.stringify(unpackJson(packJson(JSON.parse(text))))).toBe(text);
  });

  it("writes objects that share their keys smaller than JSON", () => {
    const marks = Array.from({ length: 200 }, (_, i) => ({ season: 2026 + i, strength: 40 + (i % 7) }));
    expect(packJson({ marks }).length).toBeLessThan(0.6 * JSON.stringify({ marks }).length);
  });

  it("reads JSON that was never packed as it is", () => {
    expect(unpackJson(JSON.stringify({ version: 4, list: [{ a: 1 }] }))).toEqual({ version: 4, list: [{ a: 1 }] });
  });
});
