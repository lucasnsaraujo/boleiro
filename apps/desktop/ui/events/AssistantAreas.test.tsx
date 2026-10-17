import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, test } from "vitest";
import { doesAssistantHandle } from "@boleiro/engine/sim/coach/assistantDuties";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { ServicesContext } from "../app/ServicesContext.js";
import { AssistantAreas } from "./AssistantAreas.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

test("the assistant runs the contracts until the coach switches him off, and the switch reaches the game", async () => {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba" } });
  render(
    <ServicesContext value={{ engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } }}>
      <AssistantAreas />
    </ServicesContext>,
  );
  const contracts = await screen.findByRole("checkbox", { name: "Contratos" });
  expect(contracts).toHaveProperty("checked", true);
  await userEvent.click(contracts);
  expect(contracts).toHaveProperty("checked", false);
  expect(doesAssistantHandle((await engine.read(["coach"])).coach, "contracts")).toBe(false);
});
