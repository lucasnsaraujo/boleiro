import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import type { TalkTone } from "@boleiro/engine/sim/live/teamTalk";
import { HalfTimeTalk, KickOffTalk } from "./TeamTalk.js";

afterEach(cleanup);

const trailing = { lead: -1, morale: 60, isDerby: false };

test("at half-time the coach picks one of four tones, the assistant's marked, in one click", () => {
  const onTalk = vi.fn();
  render(<HalfTimeTalk club="Flamengo" home="Vasco" away="Flamengo" score="1 × 0" moment={trailing} suggested="demand" given={null} isBusy={false} onTalk={onTalk} />);
  const card = screen.getByRole("region", { name: /Intervalo/ });
  const tones = within(card).getAllByRole("button", { name: /Calma|Confiança|Cobrança|Elogio/ });
  expect(tones.map((tone) => tone.getAttribute("aria-label")?.split(":")[0])).toEqual(["Calma", "Confiança", "Cobrança", "Elogio"]);
  expect(within(within(card).getByRole("button", { name: /^Cobrança/ })).getByText("Auxiliar sugere")).toBeTruthy();
  fireEvent.click(within(card).getByRole("button", { name: /^Elogio/ }));
  expect(onTalk).toHaveBeenCalledWith("praise");
  fireEvent.click(within(card).getByRole("button", { name: /Deixa com o auxiliar/ }));
  expect(onTalk).toHaveBeenLastCalledWith("demand");
});

test("the dressing room is the club's, with the club's own article: vestiário da Chapecoense", () => {
  render(<HalfTimeTalk club="Chapecoense" clubId="chapecoense-sc" home="Chapecoense" away="Avaí" score="0 × 0" moment={trailing} suggested="demand" given={null} isBusy={false} onTalk={vi.fn()} />);
  expect(screen.getByRole("region", { name: "Intervalo: vestiário da Chapecoense" })).toBeTruthy();
  cleanup();
  render(<HalfTimeTalk club="Flamengo" clubId="flamengo-rj" home="Vasco" away="Flamengo" score="1 × 0" moment={trailing} suggested="demand" given={null} isBusy={false} onTalk={vi.fn()} />);
  expect(screen.getByRole("region", { name: "Intervalo: vestiário do Flamengo" })).toBeTruthy();
});

test("once the talk is given the card tells how the dressing room took it", () => {
  render(<HalfTimeTalk club="Flamengo" home="Vasco" away="Flamengo" score="1 × 0" moment={trailing} suggested="demand" given={{ tone: "praise", form: -0.08, morale: 0 }} isBusy={false} onTalk={vi.fn()} />);
  const status = screen.getByRole("status");
  expect(status.textContent).toMatch(/Caiu mal/);
  expect(screen.queryByRole("button", { name: /^Calma/ })).toBeNull();
});

test("before kick-off the talk is optional: a tone picked toggles off when picked again", () => {
  const onPick = vi.fn();
  const { rerender } = render(<KickOffTalk moment={{ lead: 0, morale: 50, isDerby: true }} suggested="calm" picked={null} onPick={onPick} />);
  fireEvent.click(screen.getByRole("radio", { name: /Calma/ }));
  expect(onPick).toHaveBeenLastCalledWith("calm");
  rerender(<KickOffTalk moment={{ lead: 0, morale: 50, isDerby: true }} suggested="calm" picked="calm" onPick={onPick} />);
  expect(screen.getByRole("radio", { name: /Calma/ }).getAttribute("aria-checked")).toBe("true");
  fireEvent.click(screen.getByRole("radio", { name: /Calma/ }));
  expect(onPick).toHaveBeenLastCalledWith(null);
});

test("before kick-off the arrow keys move the talk round the four tones, focus going with it, one tab stop for the group", () => {
  function Picker() {
    const [picked, setPicked] = useState<TalkTone | null>(null);
    return <KickOffTalk moment={{ lead: 0, morale: 50, isDerby: false }} suggested="calm" picked={picked} onPick={setPicked} />;
  }
  render(<Picker />);
  const radios = screen.getAllByRole("radio");
  expect(radios.filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
  radios[0]?.focus();
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowRight" });
  const faith = screen.getByRole("radio", { name: /^Confiança/ });
  expect(faith.getAttribute("aria-checked")).toBe("true");
  expect(document.activeElement).toBe(faith);
  expect(faith.tabIndex).toBe(0);
  fireEvent.keyDown(faith, { key: "ArrowLeft" });
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowUp" });
  const praise = screen.getByRole("radio", { name: /^Elogio/ });
  expect(praise.getAttribute("aria-checked")).toBe("true");
  expect(document.activeElement).toBe(praise);
  expect(screen.getAllByRole("radio").filter((radio) => radio.tabIndex === 0)).toEqual([praise]);
});
