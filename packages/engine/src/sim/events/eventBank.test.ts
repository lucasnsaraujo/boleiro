import { describe, expect, it } from "vitest";
import { addDays } from "../dates.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { rivalsOf } from "../morale/rivalsOf.js";
import { CLASH_HEAT } from "../rivalries/coachRivalries.js";
import { squadsOfGame } from "../players/squadsByClub.js";
import { EVENT_BANK } from "./eventBank.js";
import { eventsOf, pendingEventOf, type Cast, type Effects, type EventTopic } from "./eventMemory.js";
import { byCast, type ChoiceType, type EventScene } from "./eventType.js";
import { runEvents } from "./runEvents.js";

const CLUB = "flamengo-rj";
const start = loadNewGame(5, { coachClubId: CLUB });
const squad = squadsOfGame(start).get(CLUB) ?? [];
const rivalId = [...(rivalsOf(start.clubs).get(CLUB) ?? [])].sort()[0] ?? "";
const SLOTS = new Set(["player", "teammate", "club", "rival", "age", "position", "stadium", "coach"]);
const TOPICS: readonly EventTopic[] = ["players", "squad", "board", "fans", "press", "staff", "rivals", "sponsors", "life", "discipline", "health"];
const monthlyWages = squad.reduce((sum, player) => sum + player.wage, 0);

const sceneOf = (state: GameState): EventScene => ({ state, clubId: CLUB, squad, date: state.date, played: [], random: () => 0.5 });

/** The cast a type picks today, or one with everybody in it when its precondition rules today out. */
function castFor(cast: (scene: EventScene) => Cast | null, scene: EventScene): Cast {
  return cast(scene) ?? { playerId: squad[0]?.id ?? "", teammateId: squad[1]?.id ?? "", rivalId };
}

function expectInBounds(effects: Effects, label: string) {
  for (const key of ["morale", "fans", "board"] as const) expect(Math.abs(effects[key] ?? 0), `${label}: ${key}`).toBeLessThanOrEqual(8);
  expect(effects.rivalry ?? 0, `${label}: rivalry`).toBeGreaterThanOrEqual(-3);
  expect(effects.rivalry ?? 0, `${label}: rivalry`).toBeLessThanOrEqual(6);
  expect(Number.isInteger(effects.outDays ?? 0) && (effects.outDays ?? 0) >= 0 && (effects.outDays ?? 0) <= 30, `${label}: outDays ${effects.outDays}`).toBe(true);
  expect(Math.abs(effects.money ?? 0), `${label}: money`).toBeLessThanOrEqual(3 * monthlyWages);
}

const textsOfChoices = (choices: readonly ChoiceType[] = []) => choices.flatMap((c) => [c.label, c.detail ?? "", c.news ?? ""]);

describe("the event bank", () => {
  it("holds at least 150 types across every topic, each with three or more wordings and a cooldown", () => {
    expect(EVENT_BANK.length).toBeGreaterThanOrEqual(150);
    expect(new Set(EVENT_BANK.map((type) => type.id)).size).toBe(EVENT_BANK.length);
    expect(new Set(EVENT_BANK.map((type) => type.topic))).toEqual(new Set(TOPICS));
    for (const type of EVENT_BANK) {
      expect(type.texts.length, type.id).toBeGreaterThanOrEqual(3);
      expect(new Set(type.texts.map((text) => text.headline)).size, `${type.id} repeats a headline`).toBe(type.texts.length);
      expect(type.cooldownDays, type.id).toBeGreaterThan(0);
      if (typeof type.weight === "number") expect(type.weight, type.id).toBeGreaterThan(0);
      if (type.choices) {
        expect(type.choices.length, type.id).toBeGreaterThanOrEqual(2);
        expect(type.choices.length, type.id).toBeLessThanOrEqual(3);
        expect(type.choices[type.assistantChoice ?? 0], `${type.id}: the assistant's answer`).toBeDefined();
      } else {
        expect(type.effects, `${type.id} neither asks nor moves anything`).toBeDefined();
      }
    }
  });

  it("asks three answers to every question of a press conference, with follow-ups that have three wordings", () => {
    const press = EVENT_BANK.filter((type) => type.look === "press");
    expect(press.length).toBeGreaterThanOrEqual(5);
    for (const type of press) {
      expect(type.choices, type.id).toHaveLength(3);
      expect(type.followUps?.length, `${type.id} has follow-up questions`).toBeGreaterThanOrEqual(8);
      for (const question of type.followUps ?? []) {
        expect(question.asks.length, question.id).toBeGreaterThanOrEqual(3);
        expect(question.choices, question.id).toHaveLength(3);
        expect(question.choices[question.assistantChoice ?? 0], question.id).toBeDefined();
      }
    }
  });

  it("names only the slots the game fills", () => {
    for (const type of EVENT_BANK) {
      const followUps = (type.followUps ?? []).flatMap((question) => [...question.asks, ...textsOfChoices(question.choices)]);
      const texts = [...type.texts.flatMap((t) => [t.headline, t.body]), type.setting ?? "", ...textsOfChoices(type.choices), ...followUps];
      for (const text of texts) for (const [, slot] of text.matchAll(/\{(\w+)\}/g)) expect(SLOTS, `${type.id}: {${slot}}`).toContain(slot);
    }
  });

  it("keeps every consequence inside the bands a match moves", () => {
    const scene = sceneOf(start);
    for (const type of EVENT_BANK) {
      const cast = castFor(type.cast, scene);
      if (type.effects) expectInBounds(byCast(type.effects, scene, cast), type.id);
      for (const [index, choice] of (type.choices ?? []).entries()) expectInBounds(byCast(choice.effects, scene, cast), `${type.id} #${index + 1}`);
      for (const question of type.followUps ?? []) {
        const asked = question.cast(scene, cast) ?? cast;
        for (const [index, choice] of question.choices.entries()) expectInBounds(byCast(choice.effects, scene, asked), `${question.id} #${index + 1}`);
      }
    }
  });

  it("leaves a press clash with the rival's coach to the coach's own words: no assistant answer and no follow-up question starts one", () => {
    const scene = sceneOf(start);
    const clashes = (choice: ChoiceType | undefined, cast: Cast) => (choice ? (byCast(choice.effects, scene, cast).rivalry ?? 0) >= CLASH_HEAT : false);
    const asked = EVENT_BANK.filter((type) => type.choices?.some((choice) => clashes(choice, castFor(type.cast, scene))));
    expect(asked.length).toBeGreaterThan(0);
    for (const type of EVENT_BANK) {
      const cast = castFor(type.cast, scene);
      expect(clashes(type.choices?.[type.assistantChoice ?? 0], cast), `${type.id}: the assistant's answer`).toBe(false);
      for (const question of type.followUps ?? []) for (const choice of question.choices) expect(clashes(choice, question.cast(scene, cast) ?? cast), question.id).toBe(false);
    }
  });

  it("gives a coach's club a few dozen events a season and a Série A club the AI runs a handful", () => {
    const aiClub = Object.values(start.clubs).find((club) => club.division === "A" && club.id !== CLUB)?.id ?? "";
    let state = start;
    for (let day = 0; day < 365; day++) {
      const date = addDays(start.date, day);
      state = runEvents({ ...state, date: addDays(date, 1) }, date, []).state;
    }
    const count = (clubId: string) => eventsOf(state, { clubId }).length + (pendingEventOf(state, clubId) ? 1 : 0);
    expect(count(CLUB)).toBeGreaterThanOrEqual(15);
    expect(count(CLUB)).toBeLessThanOrEqual(60);
    expect(count(aiClub)).toBeGreaterThanOrEqual(2);
    expect(count(aiClub)).toBeLessThanOrEqual(15);
  });
});
