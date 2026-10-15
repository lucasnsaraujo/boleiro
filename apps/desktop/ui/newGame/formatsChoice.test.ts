import { expect, test } from "vitest";
import { RAPIDO, REALISTA } from "@boleiro/engine/sim/formats";
import { defaultFormatsMode, formatsOfMode, formatsSummary } from "./formatsChoice.js";

test("a game with one coach starts on Realista and one with two or more on Rápido", () => {
  expect(defaultFormatsMode(1)).toBe("realista");
  expect(defaultFormatsMode(2)).toBe("rapido");
  expect(defaultFormatsMode(8)).toBe("rapido");
});

test("each mode plays its formats, Personalizar the coach's own", () => {
  const custom = { ...REALISTA, leagueLegs: 1 as const };
  expect(formatsOfMode("rapido", custom)).toEqual(RAPIDO);
  expect(formatsOfMode("realista", custom)).toEqual(REALISTA);
  expect(formatsOfMode("personalizar", custom)).toEqual(custom);
});

test("a custom mix reads as its choices", () => {
  expect(formatsSummary("personalizar", { calendar: "real", leagueLegs: 1, continentalGroups: "groups-6", knockouts: "single" })).toBe(
    "Calendário real de cada país, ligas em turno único, grupos de 6 jogos, mata-mata em jogo único.",
  );
  expect(formatsSummary("rapido", RAPIDO)).toMatch(/mesmos dias/);
});
