import { expect, test } from "vitest";
import { doesAssistantHandle } from "@boleiro/engine/sim/coach/assistantDuties";
import { bundledGameFiles } from "./bundledGameFiles.js";
import { createEngineSession } from "./createEngineSession.js";

const ANA = { name: "Ana", clubId: "flamengo-rj" };
const BRUNO = { name: "Bruno", clubId: "palmeiras-sp" };

test("the coach hands contracts to his assistant or takes them back, and the save keeps his choice", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 5, choices: { coachClubId: "bahia-ba" } });
  expect(doesAssistantHandle(session.read(["coach"]).coach, "contracts")).toBe(true);
  session.apply({ type: "setAssistantDuty", duty: "contracts", isOn: false });
  expect(doesAssistantHandle(session.read(["coach"]).coach, "contracts")).toBe(false);
  const loaded = createEngineSession(bundledGameFiles);
  loaded.apply({ type: "load", save: session.save() });
  expect(doesAssistantHandle(loaded.read(["coach"]).coach, "contracts")).toBe(false);
});

test("a game never switched writes the same save as before the switch existed", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 5, choices: { coachClubId: "bahia-ba" } });
  const before = session.save();
  session.apply({ type: "setAssistantDuty", duty: "contracts", isOn: false });
  session.apply({ type: "setAssistantDuty", duty: "contracts", isOn: true });
  expect(session.save()).toBe(before);
  expect(before).not.toContain("assistantDuties");
});

test("each hot-seat coach has his own switch", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 3, choices: { coachClubId: ANA.clubId, hotSeat: { coachName: ANA.name, otherCoaches: [BRUNO] } } });
  session.apply({ type: "setAssistantDuty", duty: "contracts", isOn: false });
  session.apply({ type: "passTurn" });
  expect(session.read(["coachName"]).coachName).toBe(BRUNO.name);
  expect(doesAssistantHandle(session.read(["coach"]).coach, "contracts")).toBe(true);
});
