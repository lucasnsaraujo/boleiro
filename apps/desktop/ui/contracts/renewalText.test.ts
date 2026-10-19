import { expect, test } from "vitest";
import { NEUTRAL_TALKS, type Stance } from "@boleiro/engine/sim/transfers/contractTerms";
import { lengthsText, renewalSay, STANCE_LABELS } from "./renewalText.js";

const options = (stances: Stance[], ageAtEnd = 32) => [6, 12, 24, 36, 48, 60].map((months, i) => ({ months, stance: stances[i] ?? "refuses", ageAtEnd }));

test("a veteran wants his length and security, takes the lengths next to it for more, and refuses the rest", () => {
  const say = renewalSay({ age: 29, preferredMonths: 36, mood: NEUTRAL_TALKS, options: options(["refuses", "hard", "agrees", "wants", "agrees", "hard"], 33) }, () => "");
  expect(say).toBe("Quer 3 anos e segurança até os 33. Aceita 2 ou 4 anos se o salário subir. Por 6 meses, nem conversa.");
});

test("a young star wants a short deal to move up", () => {
  const say = renewalSay({ age: 21, preferredMonths: 12, mood: NEUTRAL_TALKS, options: options(["agrees", "wants", "agrees", "hard", "refuses", "refuses"]) }, () => "");
  expect(say).toBe("Quer 1 ano: acha que logo aparece clube maior. Aceita 6 meses ou 2 anos se o salário subir. Por 4 ou 5 anos, nem conversa.");
});

test("between two lengths he names both, and his mood comes first", () => {
  const mood = { morale: 50, hasAskedToLeave: true, offerFrom: "palmeiras-sp" };
  const say = renewalSay({ age: 26, preferredMonths: 30, mood, options: options(["hard", "agrees", "agrees", "agrees", "agrees", "hard"]) }, (id) => (id === "palmeiras-sp" ? "Palmeiras" : id));
  expect(say).toBe("Pediu para sair há pouco e tem proposta do Palmeiras na mesa. Quer entre 2 e 3 anos. Aceita 1 ou 4 anos se o salário subir.");
});

test("lengths read as Portuguese lists", () => {
  expect(lengthsText([6])).toBe("6 meses");
  expect(lengthsText([24, 48])).toBe("2 ou 4 anos");
  expect(lengthsText([6, 12, 24])).toBe("6 meses, 1 ano ou 2 anos");
  expect(STANCE_LABELS.refuses).toBe("Recusa");
});
