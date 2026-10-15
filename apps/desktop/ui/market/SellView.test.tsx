import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import type { BidAnswer, BidOutcome } from "@boleiro/engine/sim/transfers/answerBid";
import { coachMarketOf, withCoachMarket } from "@boleiro/engine/sim/transfers/coachMarket";
import { listPlayer } from "@boleiro/engine/sim/transfers/listPlayer";
import { bundledGameFiles } from "@boleiro/game-client/engine/bundledGameFiles";
import { SellView } from "./SellView.js";

afterEach(cleanup);

const COACH = "sport-pe";
const game: GameState = { ...newGameFromFiles(5, { coachClubId: COACH }, bundledGameFiles), date: "2026-01-10" };
const [sold, listed] = Object.values(game.players)
  .filter((p) => p.clubId === COACH)
  .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
if (!sold || !listed) throw new Error("Sport has players");

const offered = withCoachMarket(listPlayer(game, listed.id, "expensive"), {
  ...coachMarketOf(listPlayer(game, listed.id, "expensive")),
  bids: { [sold.id]: { playerId: sold.id, buyerId: "vitoria-ba", fee: 10_000_000, feeEur: null, ceiling: 11_000_000, isFinal: false, madeOn: game.date, until: "2026-01-12" } },
});

function renderSell(state: GameState) {
  const onAnswer = vi.fn<(playerId: string, answer: BidAnswer) => Promise<BidOutcome>>(async () => "sold");
  const onList = vi.fn();
  render(<SellView state={state} tabs={null} onAnswer={onAnswer} onList={onList} />);
  return { onAnswer, onList };
}

test("a club's offer shows its fee and deadline, and accepting it answers for that player", async () => {
  const { onAnswer } = renderSell(offered);
  const card = screen.getByRole("article", { name: `Proposta por ${sold.name}` });
  expect(within(card).getByText(/Responder até/)).toBeTruthy();
  await userEvent.click(within(card).getByRole("button", { name: "Aceitar R$ 10 mi" }));
  expect(onAnswer).toHaveBeenCalledWith(sold.id, { kind: "accept" });
  expect(await screen.findByText(`${sold.name} vendido para Vitória.`)).toBeTruthy();
});

test("a counter-offer opens a fifth over the offer and goes up with +", async () => {
  const { onAnswer } = renderSell(offered);
  await userEvent.click(screen.getByRole("button", { name: "Aumentar contraproposta" }));
  await userEvent.click(screen.getByRole("button", { name: "Contraproposta" }));
  const [, answer] = onAnswer.mock.calls[0] ?? [];
  expect(answer).toMatchObject({ kind: "counter" });
  expect(answer?.kind === "counter" && answer.fee).toBeGreaterThan(12_000_000);
});

test("a buyer's last word can only be taken or turned down", () => {
  const bid = coachMarketOf(offered).bids[sold.id];
  if (!bid) throw new Error("no bid");
  renderSell(withCoachMarket(offered, { ...coachMarketOf(offered), bids: { [sold.id]: { ...bid, isFinal: true } } }));
  expect(screen.queryByRole("button", { name: "Contraproposta" })).toBeNull();
  expect(screen.getByText("Última oferta do Vitória: não aceita contraproposta.")).toBeTruthy();
});

test("a listed player's price mode switches, and another player goes up for sale from the list", async () => {
  const { onList } = renderSell(offered);
  const listing = screen.getByRole("group", { name: `Preço de ${listed.name}` });
  expect(within(listing).getByRole("button", { name: "Caro e lento" }).getAttribute("aria-pressed")).toBe("true");
  await userEvent.click(within(listing).getByRole("button", { name: "Barato e rápido" }));
  expect(onList).toHaveBeenCalledWith(listed.id, "cheap");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Jogador para vender" }), sold.id);
  await userEvent.click(screen.getByRole("button", { name: "Pôr à venda" }));
  expect(onList).toHaveBeenCalledWith(sold.id, "cheap");
});

test("with no offer on the table it says how to get one", () => {
  renderSell(game);
  expect(screen.getByRole("heading", { name: "Nenhuma proposta na mesa" })).toBeTruthy();
});
