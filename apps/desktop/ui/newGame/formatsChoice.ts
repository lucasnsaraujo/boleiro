import { RAPIDO, REALISTA, type Formats } from "@boleiro/engine/sim/formats";

export const FORMATS_MODES = [
  { mode: "rapido", label: "Rápido" },
  { mode: "realista", label: "Realista" },
  { mode: "personalizar", label: "Personalizar" },
] as const;
export type FormatsMode = (typeof FORMATS_MODES)[number]["mode"];

/** Hot-seat coaches in different countries play on the same days by default; one coach gets the real calendars. */
export const defaultFormatsMode = (coachCount: number): FormatsMode => (coachCount > 1 ? "rapido" : "realista");

export function formatsOfMode(mode: FormatsMode, custom: Formats): Formats {
  if (mode === "rapido") return RAPIDO;
  if (mode === "realista") return REALISTA;
  return custom;
}

/** Each of Personalizar's choices: its key, its title and its options' labels. */
export const CUSTOM_CHOICES = [
  { key: "calendar", title: "Calendário", options: [{ value: "unified", label: "Único" }, { value: "real", label: "Real" }] },
  { key: "leagueLegs", title: "Ligas", options: [{ value: 1, label: "1 turno" }, { value: 2, label: "2 turnos" }] },
  { key: "continentalGroups", title: "Copas continentais", options: [{ value: "groups-3", label: "3 jogos" }, { value: "groups-6", label: "6 jogos" }, { value: "league-phase", label: "Fase de liga" }] },
  { key: "knockouts", title: "Mata-mata", options: [{ value: "single", label: "Jogo único" }, { value: "late-two-legs", label: "Ida e volta das quartas" }, { value: "two-legs", label: "Ida e volta" }] },
] as const;

const CALENDAR_TEXT: Record<Formats["calendar"], string> = { unified: "Todas as ligas nos mesmos dias", real: "Calendário real de cada país" };
const LEGS_TEXT: Record<Formats["leagueLegs"], string> = { 1: "ligas em turno único", 2: "ligas em turno e returno" };
const GROUPS_TEXT: Record<Formats["continentalGroups"], string> = { "groups-3": "grupos de 3 jogos", "groups-6": "grupos de 6 jogos", "league-phase": "fase de liga como a da Champions" };
const KNOCKOUTS_TEXT: Record<Formats["knockouts"], string> = { single: "mata-mata em jogo único", "late-two-legs": "ida e volta só das quartas em diante", "two-legs": "mata-mata em ida e volta" };

/** One line under the mode: what it plays. */
export function formatsSummary(mode: FormatsMode, formats: Formats): string {
  if (mode === "rapido") return "Todas as ligas jogam nos mesmos dias, com grupos de 3 jogos e ida e volta só das quartas em diante.";
  if (mode === "realista") return "Cada país no seu calendário real, com os formatos de hoje.";
  return `${CALENDAR_TEXT[formats.calendar]}, ${LEGS_TEXT[formats.leagueLegs]}, ${GROUPS_TEXT[formats.continentalGroups]}, ${KNOCKOUTS_TEXT[formats.knockouts]}.`;
}
