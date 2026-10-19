import { guestClubOf } from "@boleiro/engine/sim/continental/guestClubs";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { nationalTeamName } from "../format/nationalTeamName.js";
import type { RoundClub } from "./liveRoundOf.js";

// A club from abroad whose pack gives no colours shows in plain white and black.
const GUEST_COLOURS = { primary: "#FFFFFF", secondary: "#000000" };

/** A side of a match as the round and the match page show it: a club, a continental guest, or a national team by its Portuguese name; null for an unknown id. */
export function roundClubOf(state: Pick<GameState, "clubs" | "world" | "guests" | "nations">, id: string): RoundClub | null {
  const club = state.clubs[id];
  if (club) return { id, shortName: club.shortName, colours: club.colours, stadium: club.stadium };
  const guest = guestClubOf(state, id);
  if (guest) return { id, shortName: guest.name, colours: guest.colours ?? GUEST_COLOURS, stadium: "" };
  const team = state.nations?.teams[id];
  return team ? { id, shortName: nationalTeamName(id, team.name), colours: team.colours, stadium: "" } : null;
}
