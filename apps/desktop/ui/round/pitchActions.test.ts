import { expect, test } from "vitest";
import type { RoundMatch } from "@boleiro/game-client/round/liveRoundOf";
import { pitchActionsOf } from "./pitchActions.js";

const names = { b9: "Everaldo", v4: "Wagner Leonardo", v9: "Renato Kayzer", b2: "Gilberto", b14: "Cauly", v1: "Lucas Arcanjo", v10: "Matheuzinho" };

const match: RoundMatch = {
  fixtureId: "ours",
  competitionId: "a",
  homeId: "vit",
  awayId: "bahia",
  events: [
    { type: "goal", minute: 10, clubId: "bahia", playerId: "b9", kind: "header" },
    { type: "card", minute: 20, clubId: "vit", playerId: "v4", card: "red" },
    { type: "penaltyMiss", minute: 33, clubId: "vit", playerId: "v10", keeperId: "b1", isSaved: false },
    { type: "halfTime", minute: 45 },
    { type: "goal", minute: 52, clubId: "vit", playerId: "v9", kind: "penalty" },
    { type: "injury", minute: 60, clubId: "bahia", playerId: "b2", days: 10 },
    { type: "substitution", minute: 61, clubId: "bahia", playerId: "b14", offId: "b2" },
    { type: "card", minute: 70, clubId: "bahia", playerId: "b14", card: "secondYellow" },
    { type: "penaltyMiss", minute: 80, clubId: "bahia", playerId: "b9", keeperId: "v1", isSaved: true },
    { type: "fullTime", minute: 90 },
  ],
};

test("every goal, card, injury, substitution and missed penalty becomes a pitch action at its minute, for the side it happened to, with the player's name", () => {
  expect(pitchActionsOf(match, names)).toEqual([
    { kind: "goal", minute: 10, side: "away", playerId: "b9", tag: "Everaldo, de cabeça", setPiece: null },
    { kind: "card", minute: 20, side: "home", playerId: "v4", tag: "Expulso: Wagner Leonardo", card: "red" },
    { kind: "chance", minute: 33, side: "home", playerId: "v10", tag: "Matheuzinho perde o pênalti", outcome: "wide", setPiece: "penalty" },
    { kind: "halfTime", minute: 45 },
    { kind: "goal", minute: 52, side: "home", playerId: "v9", tag: "Renato Kayzer, de pênalti", setPiece: "penalty" },
    { kind: "injury", minute: 60, side: "away", playerId: "b2", tag: "Gilberto se machucou" },
    { kind: "substitution", minute: 61, side: "away", playerId: "b2", tag: "Entra Cauly, sai Gilberto" },
    { kind: "card", minute: 70, side: "away", playerId: "b14", tag: "Expulso: Cauly", card: "red" },
    { kind: "chance", minute: 80, side: "away", playerId: "b9", tag: "Everaldo bate, Lucas Arcanjo defende", outcome: "saved", setPiece: "penalty" },
  ]);
});

test("an own goal goes in for the side it counts for, under the name of the opponent who put it in", () => {
  const ownGoal: RoundMatch = { ...match, events: [{ type: "goal", minute: 7, clubId: "bahia", playerId: "v4", kind: "ownGoal" }] };
  expect(pitchActionsOf(ownGoal, names)).toEqual([{ kind: "goal", minute: 7, side: "away", playerId: "v4", tag: "Wagner Leonardo, contra", setPiece: null }]);
});

test("a free kick goal is struck from a dead ball, and a player the round has no name for still gets a tag", () => {
  const freeKick: RoundMatch = { ...match, events: [{ type: "goal", minute: 18, clubId: "vit", playerId: "nobody", kind: "freeKick" }] };
  expect(pitchActionsOf(freeKick, names)).toEqual([{ kind: "goal", minute: 18, side: "home", playerId: "nobody", tag: "Um jogador, de falta", setPiece: "freeKick" }]);
});

test("the shootout after full time and the squad overruling the coach are not played on the pitch", () => {
  const shootout: RoundMatch = {
    ...match,
    events: [
      { type: "fullTime", minute: 90 },
      { type: "shootoutKick", minute: 90, clubId: "vit", playerId: "v9", isScored: true },
    ],
  };
  expect(pitchActionsOf(shootout, names)).toEqual([]);
});
