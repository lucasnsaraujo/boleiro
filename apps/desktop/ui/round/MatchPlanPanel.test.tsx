import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { MatchPlan } from "@boleiro/engine/sim/coach/matchPlan";
import type { MatchPlanView } from "@boleiro/game-client/engine/createEngineSession";
import type { SquadPlayer } from "@boleiro/game-client/round/matchDayPlan";
import { MatchPlanPanel } from "./MatchPlanPanel.js";

afterEach(cleanup);

const player = (id: string, group: PositionGroup, strength: number, fatigue = 0): SquadPlayer => ({ id, name: id.toUpperCase(), group, strength, fatigue, status: null });
const squad = [
  player("gk", "GK", 70),
  player("d1", "DEF", 72),
  player("d2", "DEF", 71),
  player("d3", "DEF", 69),
  player("d4", "DEF", 68),
  player("d5", "DEF", 67),
  player("m1", "MID", 74, 30),
  player("m2", "MID", 73),
  player("m3", "MID", 70),
  player("a1", "ATT", 76),
  player("a2", "ATT", 65),
  player("gk2", "GK", 64),
  player("d6", "DEF", 66),
  player("m4", "MID", 71),
  player("a3", "ATT", 72),
];
const club = { id: "bahia-ba", shortName: "Bahia", colours: { primary: "#0000ff", secondary: "#ffffff" } };
const tactics = { formation: "5-3-2" as const, posture: "attacking" as const, penaltyTakerId: null };

function open(view: Partial<MatchPlanView> = {}) {
  const saved: MatchPlan[] = [];
  const onSave = vi.fn(async (plan: MatchPlan) => {
    saved.push(plan);
  });
  render(
    <MatchPlanPanel
      club={club}
      squad={squad}
      lineup={squad.slice(0, 11).map((p) => p.id)}
      tactics={tactics}
      view={{ plan: {}, keysTaken: [], isFinalsOnly: false, ...view }}
      onSave={onSave}
      onClose={() => undefined}
    />,
  );
  return { saved, panel: screen.getByRole("dialog", { name: "Plano de jogo" }) };
}

test("keeping the shape is one click, and the picture says what a defender sent off does to a 5-3-2", async () => {
  const { saved, panel } = open();
  expect(within(panel).getByRole("figure", { name: "5-3-2 com um defensor expulso fica 5-3-1" })).toBeTruthy();
  await userEvent.click(within(within(panel).getByRole("group", { name: "Expulsão e lesão" })).getByRole("button", { name: "Manter o desenho" }));
  expect(saved.at(-1)).toEqual({ keepsShape: true });
  await userEvent.click(within(within(panel).getByRole("group", { name: "Expulsão e lesão" })).getByRole("button", { name: "Me perguntar" }));
  expect(saved.at(-1)).toEqual({});
});

test("an energy floor is kept, and the page names who starts the match most tired", async () => {
  const { saved, panel } = open();
  await userEvent.click(within(within(panel).getByRole("group", { name: "Energia" })).getByRole("button", { name: "60%" }));
  expect(saved.at(-1)).toEqual({ energyFloor: 60 });
  expect(within(panel).getByText(/Mais cansado hoje/).textContent).toContain("M1");
});

test("a key is set by pressing it, and a game shortcut or another coach's key is refused with why", async () => {
  const { saved, panel } = open({ keysTaken: [{ key: "w", coachName: "Ana" }] });
  const cap = within(panel).getByRole("button", { name: /^Tempo técnico:/ });
  await userEvent.click(cap);
  await userEvent.keyboard("e");
  expect(within(panel).getByRole("alert").textContent).toBe("E já é um atalho do jogo.");
  await userEvent.keyboard("w");
  expect(within(panel).getByRole("alert").textContent).toBe("W é a tecla de Ana.");
  await userEvent.keyboard("p");
  expect(saved.at(-1)).toEqual({ timeOutKey: "p" });
  expect(within(panel).getByRole("button", { name: "Tempo técnico: P" })).toBeTruthy();
});

test("the tactics on the sheet are kept as a saved tactics, at most once", async () => {
  const { saved, panel } = open();
  await userEvent.click(within(panel).getByRole("button", { name: /Guardar a de agora: 5-3-2/ }));
  expect(saved.at(-1)).toEqual({ savedTactics: [{ ...tactics, penaltyTakerId: null }] });
  expect(within(panel).getByRole("button", { name: /já está salva/ })).toHaveProperty("disabled", true);
  await userEvent.click(within(panel).getByRole("button", { name: "Tirar a tática 1" }));
  expect(saved.at(-1)).toEqual({});
});

test("asking before the shootout is the switch's off side, and a planned substitution starts at the 70th minute", async () => {
  const { saved, panel } = open();
  await userEvent.click(within(panel).getByRole("switch"));
  expect(saved.at(-1)).toEqual({ asksBeforeShootout: true });
  await userEvent.click(within(panel).getByRole("button", { name: "Marcar troca" }));
  expect(saved.at(-1)?.minuteSubs).toEqual([{ minute: 70, offId: "d1", onId: "d6" }]);
});

test("a plan the game refuses goes back to how it was, with a word on it", async () => {
  const onSave = vi.fn(async () => {
    throw new Error("refused");
  });
  render(<MatchPlanPanel club={club} squad={squad} lineup={squad.slice(0, 11).map((p) => p.id)} tactics={tactics} view={{ plan: {}, keysTaken: [], isFinalsOnly: true }} onSave={onSave} onClose={() => undefined} />);
  const panel = screen.getByRole("dialog", { name: "Plano de jogo" });
  expect(within(panel).getByText(/Regra da casa:/)).toBeTruthy();
  await userEvent.click(within(within(panel).getByRole("group", { name: "Energia" })).getByRole("button", { name: "50%" }));
  await waitFor(() => expect(within(panel).getByRole("alert").textContent).toBe("O plano não mudou. Tente de novo."));
  expect(within(within(panel).getByRole("group", { name: "Energia" })).getByRole("button", { name: "Desligado" })).toHaveProperty("ariaPressed", "true");
});
