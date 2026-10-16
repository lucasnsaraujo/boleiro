/**
 * What the coach can ask the board. `sign` buys a player from another club, signs a free agent,
 * signs a pre-contract with a player in his last six months, or triggers a loanee's purchase clause;
 * with `fee` it is an offer of that many BRL to his club, and with `wage` the monthly wage offered him.
 * `payClause` pays a player's release clause to his club, which can't refuse it; `wage` is the wage offered him.
 * `sell` puts one of his players up for the best Brazilian offer. `renew` extends a contract by `years`.
 * `loanIn` borrows a player from a bigger club; `loanOut` lends a young player to a lower division.
 */
export type CoachRequest =
  | { kind: "sign"; playerId: string; fee?: number; wage?: number }
  | { kind: "payClause"; playerId: string; wage?: number }
  | { kind: "sell"; playerId: string }
  | { kind: "renew"; playerId: string; years: number }
  | { kind: "loanIn"; playerId: string }
  | { kind: "loanOut"; playerId: string };
