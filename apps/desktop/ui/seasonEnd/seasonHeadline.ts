import type { Division } from "@boleiro/data/players";
import type { CompetitionKey } from "@boleiro/engine/sim/history/history";
import type { Placing } from "@boleiro/game-client/seasonEnd/seasonReview";

export type Stamp = "title" | "promoted" | "relegated";
export type SeasonHeadline = { stamp: Stamp | null; line: string };

const DIVISIONS: readonly Division[] = ["A", "B", "C", "D"];

/** The season in a stamp and one line, as the back page would put it. */
export function seasonHeadline(placing: Placing, titles: readonly CompetitionKey[]): SeasonHeadline {
  const { division, move } = placing;
  const step = move === "promoted" ? -1 : move === "relegated" ? 1 : 0;
  const next = DIVISIONS[DIVISIONS.indexOf(division) + step];
  const isChampion = titles.includes(`serie-${division.toLowerCase()}`);
  const line =
    move === "promoted"
      ? `Sobe para a Série ${next}`
      : move === "relegated"
        ? next
          ? `Cai para a Série ${next}`
          : "Fica só no estadual"
        : isChampion
          ? `Campeão da Série ${division}`
          : `Fica na Série ${division}`;
  return { stamp: isChampion ? "title" : move, line };
}
