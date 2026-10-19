import { loadNewGame } from "@boleiro/engine/sim/loadNewGame";
import type { CountryStructure, WorldClub } from "@boleiro/engine/sim/world/world";
import { EMPTY_DESK } from "../market/boardDesk.js";
import { writeSessionSave } from "./sessionSave.js";

const structure = (id: string, window: [string, string]): CountryStructure => ({
  id,
  levels: [{ name: "Liga", legs: 2, promoted: 0, relegated: 0 }],
  window,
  continental: [],
});
const club = (id: string): WorldClub => ({ id, name: id, positions: "GDDDDMMMMAA", strengths: Array.from({ length: 11 }, () => 60) });
const clubs = (country: string) => [Array.from({ length: 6 }, (_, i) => club(`${country}-${i}`))];

/**
 * For tests of world saves: Bahia's game with two six-club result-only countries, `aa` playing from 2 March and
 * `bb` from 1 August, as a save written whole for the `load` command.
 */
export function twoCountryGame(): string {
  const game = loadNewGame(3, {
    coachClubId: "bahia-ba",
    world: [
      { structure: structure("aa", ["03-02", "06-30"]), levels: clubs("aa") },
      { structure: structure("bb", ["08-01", "11-30"]), levels: clubs("bb") },
    ],
  });
  return writeSessionSave({ game, desk: EMPTY_DESK, turningPoints: [], live: null });
}
