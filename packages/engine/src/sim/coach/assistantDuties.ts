import type { Coach } from "./coach.js";

/** A part of the club the assistant can run for the coach. */
export type AssistantDuty = "contracts";

// SPEC §8 (assistant): by default the assistant handles the lineup and contracts.
const DEFAULTS: Record<AssistantDuty, boolean> = { contracts: true };

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
