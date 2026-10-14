import { expect, test } from "vitest";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { bundledGameFiles } from "@boleiro/game-client/engine/bundledGameFiles";
import { answerText, pendingText } from "./requestText.js";

const game = newGameFromFiles(5, { coachClubId: "sport-pe" }, bundledGameFiles);
const own = Object.values(game.players).find((p) => p.clubId === "sport-pe");
if (!own) throw new Error("no player");

test("a pending request says when the board answers: tomorrow, or the day the window opens", () => {
  expect(pendingText({ ...game, date: "2026-01-01" }, { kind: "renew", playerId: own.id, years: 2 })).toBe("A diretoria responde amanhã.");
  expect(pendingText({ ...game, date: "2026-01-01" }, { kind: "sell", playerId: own.id })).toBe("Fica na mesa até a janela abrir, em 5 jan.");
  expect(pendingText({ ...game, date: "2026-01-04" }, { kind: "sell", playerId: own.id })).toBe("A diretoria responde amanhã.");
  expect(pendingText({ ...game, date: "2026-10-01" }, { kind: "loanOut", playerId: own.id })).toBe("Fica na mesa até a janela abrir, em 5 jan.");
  expect(pendingText({ ...game, date: "2026-03-03" }, { kind: "sell", playerId: own.id })).toBe("Fica na mesa até a janela abrir, em 20 jul.");
});

test("an answer reads as a yes, or a no with the board's reason", () => {
  expect(answerText({ date: "2026-01-05", request: { kind: "sell", playerId: own.id }, name: "Zé", approved: true, reason: null })).toBe("Venda de Zé: aprovada");
  expect(answerText({ date: "2026-01-05", request: { kind: "sign", playerId: own.id }, name: "Zé", approved: false, reason: "transferBudget" })).toBe(
    "Contratação de Zé: recusada, sem verba",
  );
  expect(answerText({ date: "2026-01-05", request: { kind: "loanIn", playerId: own.id }, name: "Zé", approved: true, reason: null })).toBe("Empréstimo de Zé: aprovado");
});
