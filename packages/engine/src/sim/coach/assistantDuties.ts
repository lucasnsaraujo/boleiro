import type { Coach } from "./coach.js";

/** The parts of the club the assistant can run for the coach, in the order the assistant's screen lists them. */
export const ASSISTANT_DUTIES = ["lineup", "contracts", "youth", "ticketPrice", "selling"] as const;
export type AssistantDuty = (typeof ASSISTANT_DUTIES)[number];

// SPEC §8 (assistant): by default the assistant handles the lineup and contracts. He also keeps the
// ticket price he set at the start (the stadium screen's switch, on until the coach prices them himself).
const DEFAULTS: Record<AssistantDuty, boolean> = { lineup: true, contracts: true, youth: false, ticketPrice: true, selling: false };

/** Whether the coach's assistant runs `duty` for him: his own choice, else the default. */
export function doesAssistantHandle(coach: Pick<Coach, "assistantDuties">, duty: AssistantDuty): boolean {
  return coach.assistantDuties?.[duty] ?? DEFAULTS[duty];
}

/** The coach with his assistant running `duty` or not; a choice back at the default is forgotten, so the save stays as it was. */
export function withAssistantDuty(coach: Coach, duty: AssistantDuty, isOn: boolean): Coach {
  const duties = { ...coach.assistantDuties };
  if (isOn === DEFAULTS[duty]) Reflect.deleteProperty(duties, duty);
  else duties[duty] = isOn;
  const next = { ...coach, assistantDuties: duties };
  if (!Object.keys(duties).length) Reflect.deleteProperty(next, "assistantDuties");
  return next;
}

/** The starters of his last match a coach who picks his own team keeps when he leaves the lineup to the game; none while his assistant picks it. */
export function startersKept(coach: Pick<Coach, "assistantDuties">, lastEleven: readonly string[] | undefined): ReadonlySet<string> | undefined {
  return doesAssistantHandle(coach, "lineup") || !lastEleven?.length ? undefined : new Set(lastEleven);
}
