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
  render(<EventPopUp event={event} club={club} rival={null} player={null} today="2026-03-02" standing={null} isBusy={false} hasFailed={false} answered={null} onAnswer={onAnswer} onNext={vi.fn()} onClose={vi.fn()} />);
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

const answers = (prefix: string) => [
  { label: `“${prefix} um.”`, effects: { morale: 2 } },
  { label: `“${prefix} dois.”`, effects: { fans: 3, rivalry: 4 } },
  { label: `“${prefix} três.”`, effects: { board: 1 } },
];

const conference: PendingEvent = {
  ...event,
  typeId: "press-rival",
  look: "press",
  headline: "Coletiva: o Vasco na pauta",
  body: "“E o próximo jogo?”",
  choices: answers("Segunda"),
  questions: [
    { id: "press-rival", ask: "“O Vasco provoca. Responde?”", choices: answers("Primeira"), assistantChoice: 2 },
    { id: "q-next-match", ask: "“E o próximo jogo?”", choices: answers("Segunda"), assistantChoice: 0 },
    { id: "q-title", ask: "“Dá para falar em título?”", choices: answers("Terceira"), assistantChoice: 0 },
  ],
  answers: [1],
};

test("a press conference asks one question at a time, counting them, and offers the next once an answer lands", () => {
  const onNext = vi.fn();
  const props = { event: conference, club, rival: null, player: null, today: "2026-03-02", standing: null, isBusy: false, hasFailed: false, onAnswer: vi.fn(), onNext, onClose: vi.fn() };
  const { rerender } = render(<EventPopUp {...props} answered={null} />);
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByRole("heading", { name: "“E o próximo jogo?”" })).toBeTruthy();
  expect(dialog.textContent).toMatch(/Pergunta 2 de 3/);
  expect(within(dialog).getAllByRole("radio")).toHaveLength(3);
  const landed = { type: "eventAnswered" as const, clubId: club.id, typeId: "press-rival", choice: 0, byAssistant: false, topic: conference.headline, answer: "“Segunda um.”", headline: "", questionsLeft: 1 };
  rerender(<EventPopUp {...props} answered={landed} />);
  expect(within(dialog).getByRole("status").textContent).toMatch(/Falta uma pergunta/);
  fireEvent.click(within(dialog).getByRole("button", { name: /Próxima pergunta/ }));
  expect(onNext).toHaveBeenCalledTimes(1);
  expect(within(dialog).getByRole("button", { name: "Fechar" })).toBeTruthy();
});
