import { randomStream } from "../../engine/random.js";
import type { ContinentalCompetition, ContinentalCup, GameState } from "../gameState.js";
import { openNextStage } from "../openNextStage.js";
import { shuffle } from "../shuffle.js";
import { cupStageDates } from "./conmebolCups.js";
import type { ContinentalField } from "./continentalField.js";

// The draws come from a stream of their own, so opening the cups leaves the game's main stream as it was.
const DRAW_STREAM_SALT = 0xc0b1e;

/** The game with the season's CONMEBOL cups opened on the field: competitions, first-stage fixtures and their draws. */
export function openContinentalCups(state: GameState, field: ContinentalField | null): GameState {
  if (!field) return state;
  const random = randomStream((state.seed ^ DRAW_STREAM_SALT ^ state.season) >>> 0).next;
  const libertadoresClubs = field.libertadores.flat();
  const cups: { cup: ContinentalCup; entries: string[][]; drawn: string[] }[] = [
    { cup: "libertadores", entries: field.libertadores, drawn: libertadoresClubs },
    // Libertadores clubs drop into the Sul-Americana, so its draws know them too.
    { cup: "sul-americana", entries: field.sulAmericana, drawn: [...field.sulAmericana.flat(), ...libertadoresClubs] },
    { cup: "recopa", entries: [field.recopa], drawn: field.recopa },
  ];
  const competitions = { ...state.competitions };
  const fixtures = [...state.fixtures];
  for (const { cup, entries, drawn } of cups) {
    const clubIds = entries.flat();
    if (clubIds.length < 2) continue;
    const competition: ContinentalCompetition = {
      id: `${cup}-${state.season}`,
      kind: "continental",
      cup,
      season: state.season,
      clubIds,
      entries,
      countries: field.countries,
      stages: [],
      stageDates: cupStageDates(cup, state.season),
      drawOrder: shuffle(drawn, random),
    };
    const opened = openNextStage(competition, [], {});
    competitions[competition.id] = opened.competition;
    fixtures.push(...opened.fixtures);
  }
  return { ...state, competitions, fixtures };
}
