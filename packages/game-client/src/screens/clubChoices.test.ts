import { expect, test } from "vitest";
import { parseClubs } from "@boleiro/data/clubs";
import type { Board } from "@boleiro/engine/sim/coach/boardExpectations";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { boardGoal, clubChoices, filterClubs, statesOf, type ClubFilter } from "./clubChoices.js";

const CLUBS = parseClubs(bundledGameFiles.clubs);

const ALL: ClubFilter = { query: "", division: null, state: null };

function board(expectation: Board["expectation"], targetPosition: number, tableSize = 20): Board {
  return { expectation, targetPosition, tableSize, position: targetPosition, games: 0, pressure: 0 };
}

test("only clubs in Série A to D can be chosen, Série A first, then by name", () => {
  const choices = clubChoices(CLUBS, null);
  expect(choices.every(({ club }) => club.division !== null)).toBe(true);
  expect(choices.length).toBe(CLUBS.filter((club) => club.division !== null).length);
  expect(choices[0]?.club.division).toBe("A");
  expect(choices.at(-1)?.club.division).toBe("D");
  const serieA = choices.filter(({ club }) => club.division === "A").map(({ club }) => club.shortName);
  expect(serieA).toEqual(serieA.toSorted((a, b) => a.localeCompare(b, "pt-BR")));
});

test("each club carries its board's goal once the boards are known", () => {
  const choices = clubChoices(CLUBS, { "bahia-ba": board("continental", 6) });
  expect(choices.find(({ club }) => club.id === "bahia-ba")?.goal).toBe("Libertadores (até 6º)");
  expect(choices.find(({ club }) => club.id === "vitoria-ba")?.goal).toBeNull();
});

test("search ignores accents and case and matches the full or short name", () => {
  const choices = clubChoices(CLUBS, null);
  expect(filterClubs(choices, { ...ALL, query: "vitoria" }).map(({ club }) => club.id)).toContain("vitoria-ba");
  expect(filterClubs(choices, { ...ALL, query: "ESPORTE CLUBE BAHIA" }).map(({ club }) => club.id)).toEqual(["bahia-ba"]);
});

test("division and state filters narrow the list together", () => {
  const choices = clubChoices(CLUBS, null);
  const baA = filterClubs(choices, { ...ALL, division: "A", state: "BA" });
  expect(baA.map(({ club }) => club.id).toSorted()).toEqual(["bahia-ba", "vitoria-ba"]);
  expect(filterClubs(choices, { ...ALL, division: "D" }).every(({ club }) => club.division === "D")).toBe(true);
});

test("the state filter offers only states that have a national club, in order", () => {
  const states = statesOf(clubChoices(CLUBS, null));
  expect(states).toEqual(states.toSorted());
  expect(states).toContain("BA");
});

test("board goals read like a newspaper line, with the target place", () => {
  expect(boardGoal(board("title", 1), "A")).toBe("Título");
  expect(boardGoal(board("promotion", 4), "B")).toBe("Acesso (até 4º)");
  expect(boardGoal(board("promotion", 8), "C")).toBe("Quadrangular do acesso (até 8º)");
  expect(boardGoal(board("promotion", 1, 6), "D")).toBe("1º do grupo");
  expect(boardGoal(board("topHalf", 10), "A")).toBe("Metade de cima (até 10º)");
  expect(boardGoal(board("avoidRelegation", 16), "A")).toBe("Não cair (até 16º)");
  expect(boardGoal(board("avoidRelegation", 4, 6), "D")).toBe("Passar de fase (até 4º)");
});
