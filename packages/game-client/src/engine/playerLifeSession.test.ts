import { expect, test } from "vitest";
import { bundledGameFiles } from "./bundledGameFiles.js";
import { createEngineSession } from "./createEngineSession.js";

const CLUB = "flamengo-rj";

function session() {
  const own = createEngineSession(bundledGameFiles);
  own.apply({ type: "newGame", seed: 3, choices: { coachClubId: CLUB } });
  return own;
}

test("the coach retires one of his players by command, and the inbox says so", () => {
  const game = session();
  const [player] = Object.values(game.read(["players"]).players).filter((p) => p.clubId === CLUB);
  if (!player) throw new Error("no Flamengo player");
  const command = { type: "retirePlayer", playerId: player.id } as const;
  expect(JSON.parse(JSON.stringify(command))).toEqual(command);
  game.apply(command);
  expect(game.read(["players"]).players[player.id]).toBeUndefined();
  expect(game.inbox().at(-1)?.text).toBe(`${player.name} se aposenta aos ${player.age} anos`);
});

test("the coach asks a veteran who announced his last season to stay, once", () => {
  const game = session();
  const { players } = game.read(["players", "season"]);
  const [veteran] = Object.values(players).filter((p) => p.clubId === CLUB);
  if (!veteran) throw new Error("no Flamengo player");
  expect(() => game.apply({ type: "persuadeToStay", playerId: veteran.id })).toThrow(/doesn't want to retire/);
  const saved = JSON.parse(game.save()) as { game: { players: Record<string, typeof veteran> } };
  saved.game.players[veteran.id] = { ...veteran, retiring: { afterSeason: 2026, hasBeenAsked: false } };
  game.apply({ type: "load", save: JSON.stringify(saved) });
  const answer = game.apply({ type: "persuadeToStay", playerId: veteran.id });
  expect(typeof answer.stays).toBe("boolean");
  expect(game.read(["players"]).players[veteran.id]?.retiring).toEqual(answer.stays ? undefined : { afterSeason: 2026, hasBeenAsked: true });
  expect(game.inbox().at(-1)?.text).toMatch(new RegExp(`^${veteran.name} (aceita jogar mais um ano|não muda de ideia)`));
});

test("a player can't be retired during a match day", () => {
  const game = session();
  while (game.apply({ type: "playToMatchDay" }).stop !== "matchDay");
  game.apply({ type: "startRound" });
  const [player] = Object.values(game.read(["players"]).players).filter((p) => p.clubId === CLUB);
  expect(() => game.apply({ type: "retirePlayer", playerId: player?.id ?? "" })).toThrow(/match day is under way/);
});

test("a request on the board's desk for a player who retires leaves it, and the board never answers it", () => {
  const game = session();
  const [player] = Object.values(game.read(["players"]).players).filter((p) => p.clubId === CLUB);
  if (!player) throw new Error("no Flamengo player");
  game.apply({ type: "ask", request: { kind: "sell", playerId: player.id } });
  game.apply({ type: "retirePlayer", playerId: player.id });
  expect(game.desk().pending).toEqual([]);
  game.apply({ type: "playToMatchDay" });
  expect(game.desk().answers.filter((a) => a.request.playerId === player.id)).toEqual([]);
});
