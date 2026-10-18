import type { CompetitionKey } from "@boleiro/engine/sim/history/history";
import clubWorldCup from "../../../../assets/competitions/club-world-cup.webp";
import copaDoBrasil from "../../../../assets/competitions/copa-do-brasil.svg";
import intercontinentalCup from "../../../../assets/competitions/intercontinental-cup.webp";
import libertadores from "../../../../assets/competitions/libertadores.svg";
import serieA from "../../../../assets/competitions/serie-a.svg";
import serieB from "../../../../assets/competitions/serie-b.svg";
import sulAmericana from "../../../../assets/competitions/sudamericana.svg";

const LOGOS: Partial<Record<CompetitionKey, string>> = {
  "serie-a": serieA,
  "serie-b": serieB,
  "copa-do-brasil": copaDoBrasil,
  libertadores,
  "sul-americana": sulAmericana,
  "club-world-cup": clubWorldCup,
  "intercontinental-cup": intercontinentalCup,
};

/** The real logo of a competition the trophy shows (data/SOURCES.md); null for one without, which shows a trophy. */
export const competitionLogoOf = (key: CompetitionKey): string | null => LOGOS[key] ?? null;
