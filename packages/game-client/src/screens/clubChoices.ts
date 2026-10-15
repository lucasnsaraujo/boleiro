import type { Club, State } from "@boleiro/data/clubs";
import type { Division } from "@boleiro/data/players";
import type { Board } from "@boleiro/engine/sim/coach/boardExpectations";

export type NationalClub = Club & { division: Division };
export type ClubChoice = { club: NationalClub; goal: string | null };
export type ClubFilter = { query: string; division: Division | null; state: State | null };

/** The board's goal for the season in a few words, as a sports page would put it. */
export function boardGoal({ expectation, targetPosition }: Pick<Board, "expectation" | "targetPosition">, division: Division): string {
  const upTo = `(até ${targetPosition}º)`;
  switch (expectation) {
    case "title":
      return "Título";
    case "continental":
      return `Libertadores ${upTo}`;
    case "promotion":
      if (division === "D") return `${targetPosition}º do grupo`;
      return division === "C" ? `Quadrangular do acesso ${upTo}` : `Acesso ${upTo}`;
    case "topHalf":
      return `Metade de cima ${upTo}`;
    case "avoidRelegation":
      return division === "D" ? `Passar de fase ${upTo}` : `Não cair ${upTo}`;
  }
}

function isNational(club: Club): club is NationalClub {
  return club.division !== null;
}

/** The clubs a new game can start at, Série A first, then by name; `goal` waits for the boards. */
export function clubChoices(clubs: readonly Club[], boards: Readonly<Record<string, Board>> | null): ClubChoice[] {
  return clubs
    .filter(isNational)
    .toSorted((a, b) => a.division.localeCompare(b.division) || a.shortName.localeCompare(b.shortName, "pt-BR"))
    .map((club) => {
      const board = boards?.[club.id];
      return { club, goal: board ? boardGoal(board, club.division) : null };
    });
}

function folded(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Whether the club's name or short name holds the query, ignoring case and accents. */
export function matchesQuery(club: Pick<Club, "name" | "shortName">, query: string): boolean {
  const wanted = folded(query.trim());
  return wanted === "" || folded(club.name).includes(wanted) || folded(club.shortName).includes(wanted);
}

export function filterClubs(choices: readonly ClubChoice[], { query, division, state }: ClubFilter): ClubChoice[] {
  return choices.filter(({ club }) => (division === null || club.division === division) && (state === null || club.state === state) && matchesQuery(club, query));
}

export function statesOf(choices: readonly ClubChoice[]): State[] {
  return [...new Set(choices.flatMap(({ club }) => (club.state ? [club.state] : [])))].sort();
}
