import { expect, test } from "vitest";
import { assistantTicketPrice } from "@boleiro/engine/sim/finances/setTicketPrice";
import { bundledGameFiles } from "./bundledGameFiles.js";
import { createEngineSession } from "./createEngineSession.js";

const CLUB = "flamengo-rj";
const ANA = { name: "Ana", clubId: CLUB };
const BRUNO = { name: "Bruno", clubId: "palmeiras-sp" };

function startAt(seed = 5) {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed, choices: { coachClubId: CLUB } });
  return session;
}

test("a new game's coach has his club's level-1 assistant running the lineup, the contracts and the ticket price", () => {
  const page = startAt().assistant();
  expect(page.assistant.level).toBe(1);
  expect(page.duties).toEqual({ lineup: true, contracts: true, youth: false, ticketPrice: true, selling: false });
  expect(page.candidates.filter((c) => !c.formerPlayer).map((c) => c.level)).toEqual([2, 3, 4, 5]);
});

test("the coach hires a better assistant, a save keeps him, and when fired the club's own is back", () => {
  const session = startAt();
  const [cheapest] = session.assistant().candidates;
  if (!cheapest) throw new Error("nobody to hire");
  expect(session.apply({ type: "hireAssistant", candidateId: cheapest.id })).toEqual({ refusal: null });
  expect(session.assistant().assistant).toMatchObject({ name: cheapest.name, level: cheapest.level });

  const loaded = createEngineSession(bundledGameFiles);
  loaded.apply({ type: "load", save: session.save() });
  expect(loaded.assistant().assistant).toMatchObject({ name: cheapest.name, level: cheapest.level, wage: cheapest.wage });

  loaded.apply({ type: "fireAssistant" });
  expect(loaded.assistant().assistant.level).toBe(1);
});

test("a save from before assistants loads with the club's own one, and a game that never hired writes no assistant", () => {
  const session = startAt();
  const save = session.save();
  expect(save).not.toContain('"assistant"');
  const loaded = createEngineSession(bundledGameFiles);
  loaded.apply({ type: "load", save });
  expect(loaded.assistant().assistant).toEqual(session.assistant().assistant);
  expect(loaded.save()).toBe(save);
});

test("handing the ticket price back to the assistant sets his price again", () => {
  const session = startAt();
  const price = assistantTicketPrice(session.read(["clubs", "economy"]), CLUB);
  session.apply({ type: "setAssistantDuty", duty: "ticketPrice", isOn: false });
  session.apply({ type: "priceTickets", price: price + 10 });
  expect(session.assistant().duties.ticketPrice).toBe(false);
  session.apply({ type: "setAssistantDuty", duty: "ticketPrice", isOn: true });
  expect(session.assistant().duties.ticketPrice).toBe(true);
  expect(session.read(["finances"]).finances[CLUB]?.ticketPrice).toBe(price);
});

test("each hot-seat coach hires his own assistant", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 3, choices: { coachClubId: ANA.clubId, hotSeat: { coachName: ANA.name, otherCoaches: [BRUNO] } } });
  const [cheapest] = session.assistant().candidates;
  if (!cheapest) throw new Error("nobody to hire");
  session.apply({ type: "hireAssistant", candidateId: cheapest.id });
  session.apply({ type: "passTurn" });
  expect(session.read(["coachName"]).coachName).toBe(BRUNO.name);
  expect(session.assistant().assistant.level).toBe(1);
});

test("each hot-seat coach is offered strangers of his own", () => {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 3, choices: { coachClubId: ANA.clubId, hotSeat: { coachName: ANA.name, otherCoaches: [BRUNO] } } });
  const strangers = () => session.assistant().candidates.filter((c) => !c.formerPlayer);
  const anas = strangers();
  session.apply({ type: "passTurn" });
  const brunos = strangers();
  expect(brunos.map((c) => c.level)).toEqual(anas.map((c) => c.level));
  for (const [index, stranger] of brunos.entries()) {
    expect(stranger.id).not.toBe(anas[index]?.id);
    expect(stranger.name).not.toBe(anas[index]?.name);
  }
});

test("in the live round each player is read off by no more than the coach's assistant's error, and a better one reads closer", () => {
  const largestMisread = (hireBest: boolean) => {
    const session = startAt();
    if (hireBest) {
      const best = session.assistant().candidates.find((c) => c.level === 5);
      if (!best) throw new Error("no level-5 assistant to call");
      expect(session.apply({ type: "hireAssistant", candidateId: best.id })).toEqual({ refusal: null });
    }
    for (let step = 0; step < 40 && session.apply({ type: "playToMatchDay" }).stop !== "matchDay"; step++);
    const coach = session.apply({ type: "startRound" }).coach;
    if (!coach?.assistantReads) throw new Error("no coach side in the round");
    const reads = coach.assistantReads;
    return Math.max(...coach.squad.map((p) => Math.abs((reads[p.id] ?? p.strength) - p.strength)));
  };
  const own = largestMisread(false);
  const best = largestMisread(true);
  expect(own).toBeLessThanOrEqual(8);
  expect(best).toBeLessThanOrEqual(1);
  expect(best).toBeLessThan(own);
});
