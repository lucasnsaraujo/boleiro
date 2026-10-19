/**
 * What the coach can ask the board. `sign` buys a player from another club, signs a free agent,
 * signs a pre-contract with a player in his last six months, or triggers a loanee's purchase clause;
 * with `fee` it is an offer of that many BRL to his club, with `wage` the monthly wage offered him, and with
 * `years` the length of his contract (a half for six months). An offer to another human coach's club goes to his desk.
 * `payClause` pays a player's release clause to his club, which can't refuse it; `wage` and `years` are the contract offered him.
 * `sell` puts one of his players up for the best offer of a Brazilian club the AI runs. `renew` extends a contract by `years` (a half
 * for six months), at `wage` a month or, left out, at what the player asks.
 * `loanIn` borrows a player from a bigger club the AI runs; `loanOut` lends a young player to one in a lower division;
 * `recall` calls back a player the coach lent out before his loan ends.
 */
export type CoachRequest =
  | { kind: "sign"; playerId: string; fee?: number; wage?: number; years?: number }
  | { kind: "payClause"; playerId: string; wage?: number; years?: number }
  | { kind: "sell"; playerId: string }
  | { kind: "renew"; playerId: string; years: number; wage?: number }
  | { kind: "loanIn"; playerId: string }
  | { kind: "loanOut"; playerId: string }
  | { kind: "recall"; playerId: string };
