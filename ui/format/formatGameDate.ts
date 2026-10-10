import type { IsoDate } from "../../src/sim/gameState.js";

const LONG_DATE = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function formatGameDate(date: IsoDate): string {
  return LONG_DATE.format(new Date(`${date}T00:00:00Z`));
}
