import { expect, test } from "vitest";
import type { Placing } from "./seasonReview.js";
import { seasonHeadline } from "./seasonHeadline.js";

const placing = (division: Placing["division"], position: number, move: Placing["move"] = null): Placing => ({ division, position, tableSize: 20, move });

test("a league title is the headline, even when it also brings promotion", () => {
  expect(seasonHeadline(placing("B", 1, "promoted"), ["serie-b", "state-ba"])).toEqual({ stamp: "title", line: "Sobe para a Série A" });
  expect(seasonHeadline(placing("A", 1), ["serie-a"])).toEqual({ stamp: "title", line: "Campeão da Série A" });
});

test("a promotion says where the club goes up to", () => {
  expect(seasonHeadline(placing("C", 3, "promoted"), [])).toEqual({ stamp: "promoted", line: "Sobe para a Série B" });
});

test("a relegation says where the club goes down to, out of the national leagues from Série D", () => {
  expect(seasonHeadline(placing("A", 18, "relegated"), [])).toEqual({ stamp: "relegated", line: "Cai para a Série B" });
  expect(seasonHeadline(placing("D", 60, "relegated"), [])).toEqual({ stamp: "relegated", line: "Fica só no estadual" });
});

test("a season with no title and no move keeps the club where it is", () => {
  expect(seasonHeadline(placing("A", 9), ["copa-do-brasil"])).toEqual({ stamp: null, line: "Fica na Série A" });
});
