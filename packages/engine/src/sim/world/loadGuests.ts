import { loadWorldPack } from "@boleiro/data/worldPack";
import { GUEST_COUNTRIES, guestsStart, type Guests } from "./guests.js";

/** The Club World Cup's guests from the shipped world packs, read in Node. */
export function loadGuests(season: number): Guests {
  return guestsStart(GUEST_COUNTRIES.map((id) => loadWorldPack(id)), season);
}
