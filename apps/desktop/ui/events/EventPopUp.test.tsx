import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { Club } from "@boleiro/data/clubs";
import type { PendingEvent } from "@boleiro/engine/sim/events/eventMemory";
import { EventPopUp } from "./EventPopUp.js";

afterEach(cleanup);

const club: Club = {
  id: "flamengo-rj",
  transfermarktId: "614",
  name: "Clube de Regatas do Flamengo",
  shortName: "Flamengo",
  state: "RJ",
  division: "A",
  stadium: "Maracanã",
  capacity: 78_838,
  pitch: "natural",
  colours: { primary: "#C8102E", secondary: "#000000" },
  fanbase: 1,
  sources: { names: "", state: "", division: "", stadium: "", pitch: "", colours: "", fanbase: "" },
};

const event: PendingEvent = {
  typeId: "tv-interview",
  date: "2026-03-01",
  clubId: club.id,
  area: "press",
  look: "card",
  headline: "Programa de TV convida o técnico",
  body: "O programa de domingo quer o senhor ao vivo.",
  setting: "Por telefone",
  choices: [
    { label: "Aceitar e ir ao estúdio", effects: { fans: 2, board: 1, morale: -1 } },
    { label: "Recusar", effects: { fans: -1, money: -1_200_000 } },
  ],
  assistantChoice: 0,
  expiresOn: "2026-03-04",
};

function popUp(onAnswer = vi.fn()) {
  render(<EventPopUp event={event} club={club} rival={null} player={null} today="2026-03-02" standing={null} isBusy={false} hasFailed={false} answered={null} onAnswer={onAnswer} onClose={vi.fn()} />);
  return { onAnswer, dialog: screen.getByRole("dialog", { name: event.headline }) };
}

test("each answer shows what it moves, signed, with money in reais", () => {
  popUp();
  const refuse = screen.getByRole("radio", { name: /Recusar/ });
  expect(within(refuse).getByLabelText("Torcida −1")).toBeTruthy();
  expect(within(refuse).getByLabelText("Caixa −R$ 1,2 mi")).toBeTruthy();
  expect(within(screen.getByRole("radio", { name: /Aceitar/ })).getByLabelText("Moral −1")).toBeTruthy();
  expect(screen.getByText("Sem resposta até quarta (4 mar), o auxiliar decide.")).toBeTruthy();
});

test("a number key picks an answer and Enter sends it once, even with the answer button focused", () => {
  const { onAnswer, dialog } = popUp();
  const send = screen.getByRole("button", { name: /^Responder$/ });
  expect(send).toHaveProperty("disabled", true);
  fireEvent.keyDown(dialog, { key: "2" });
  expect(screen.getByRole("radio", { name: /Recusar/ }).getAttribute("aria-checked")).toBe("true");
  send.focus();
  fireEvent.keyDown(send, { key: "Enter" });
  fireEvent.click(send);
  expect(onAnswer).toHaveBeenCalledTimes(1);
  expect(onAnswer).toHaveBeenCalledWith(1);
});

test("leaving it to the assistant answers with no choice of the coach's", () => {
  const { onAnswer } = popUp();
  fireEvent.click(screen.getByRole("button", { name: /Deixa com o auxiliar/ }));
  expect(onAnswer).toHaveBeenCalledWith(null);
});
