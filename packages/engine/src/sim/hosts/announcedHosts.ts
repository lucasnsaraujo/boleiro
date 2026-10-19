import { BIG_STADIUMS } from "./bigStadiums.js";
import type { Stadium } from "./venue.js";

/** What an organiser has announced of an edition: always its hosts, its final's ground and other grounds when named. */
export type AnnouncedHost = { countries: string[]; final?: Stadium; grounds?: Stadium[] };

function stadium(name: string): Stadium {
  const found = BIG_STADIUMS.find((ground) => ground.name === name);
  if (!found) throw new Error(`no big stadium named ${name}`);
  return found;
}

// The 2026 World Cup's sixteen grounds by their World Cup capacities, the final at MetLife (Wikipedia, "2026 FIFA World
// Cup", Venues, read 2026-10-18; FIFA named the final's ground on 4 Feb 2024).
const WORLD_CUP_2026: Stadium[] = [
  { name: "MetLife Stadium", city: "East Rutherford", country: "united-states", capacity: 80_663 },
  { name: "Estadio Azteca", city: "Cidade do México", country: "mexico", capacity: 80_824 },
  { name: "AT&T Stadium", city: "Arlington", country: "united-states", capacity: 70_649 },
  { name: "SoFi Stadium", city: "Inglewood", country: "united-states", capacity: 70_492 },
  { name: "Arrowhead Stadium", city: "Kansas City", country: "united-states", capacity: 69_045 },
  { name: "Levi's Stadium", city: "Santa Clara", country: "united-states", capacity: 68_827 },
  { name: "NRG Stadium", city: "Houston", country: "united-states", capacity: 68_777 },
  { name: "Lincoln Financial Field", city: "Filadélfia", country: "united-states", capacity: 68_324 },
  { name: "Mercedes-Benz Stadium", city: "Atlanta", country: "united-states", capacity: 68_239 },
  { name: "Lumen Field", city: "Seattle", country: "united-states", capacity: 66_925 },
  { name: "Hard Rock Stadium", city: "Miami Gardens", country: "united-states", capacity: 64_478 },
  { name: "Gillette Stadium", city: "Foxborough", country: "united-states", capacity: 64_146 },
  { name: "BC Place", city: "Vancouver", country: "canada", capacity: 52_497 },
  { name: "Estadio BBVA", city: "Guadalupe", country: "mexico", capacity: 51_243 },
  { name: "Estadio Akron", city: "Zapopan", country: "mexico", capacity: 45_664 },
  { name: "BMO Field", city: "Toronto", country: "canada", capacity: 43_036 },
];

// Euro 2028's nine grounds, the final at Wembley (UEFA, 10 Oct 2023; Casement Park dropped: Wikipedia, "UEFA Euro 2028",
// Venues, read 2026-10-18).
const EURO_2028: Stadium[] = [
  { name: "Wembley Stadium", city: "Londres", country: "england", capacity: 90_000 },
  { name: "Principality Stadium", city: "Cardiff", country: "wales", capacity: 73_931 },
  { name: "Tottenham Hotspur Stadium", city: "Londres", country: "england", capacity: 62_850 },
  { name: "Etihad Stadium", city: "Manchester", country: "england", capacity: 61_470 },
  { name: "Hill Dickinson Stadium", city: "Liverpool", country: "england", capacity: 52_769 },
  { name: "St James' Park", city: "Newcastle", country: "england", capacity: 52_264 },
  { name: "Hampden Park", city: "Glasgow", country: "scotland", capacity: 51_866 },
  { name: "Aviva Stadium", city: "Dublim", country: "republic-of-ireland", capacity: 51_711 },
  { name: "Villa Park", city: "Birmingham", country: "england", capacity: 50_000 },
];

/**
 * Every edition its organiser has announced, by competition id, and the last ones played before 2026, whose hosts the
 * rotation rules read. An edition without a final (2030's World Cup, Euro 2032) gets one drawn from its hosts' grounds.
 *
 * - World Cups: 2026 above; 2030 Morocco, Portugal and Spain, with the centenary's three opening matches in Uruguay,
 *   Argentina and Paraguay (FIFA Council, 4 Oct 2023; FIFA Congress, 11 Dec 2024), played at the main hosts' grounds in
 *   the game, its final's ground undecided (FIFA; the Bernabéu the favourite, StadiumDB, Mar 2026); 2034 Saudi Arabia,
 *   its final at the new King Salman International Stadium (Wikipedia, "2034 FIFA World Cup", candidate stadiums:
 *   92,760).
 * - Euros: 2028 above; 2032 Italy and Turkey, the final's city undecided between Istanbul and Rome (UEFA, 10 Oct 2023;
 *   Calcio e Finanza, 2026).
 * - Club World Cup 2025 in the United States (FIFA). The 2029 host is not chosen (Wikipedia, "2029 FIFA Club World Cup").
 * - Libertadores: 2025 Lima; 2026 the Estadio Centenario, Montevideo (CONMEBOL, 19 Mar 2026).
 * - Sul-Americana: 2025 Asunción; 2026 the Estadio Metropolitano Roberto Meléndez, Barranquilla (CONMEBOL, 28 Nov 2025);
 *   2027 Santa Cruz de la Sierra (Band, 28 Nov 2025, which names the city alone: guess, its CONMEBOL ground, the Ramón
 *   Tahuichi Aguilera, 31,400 for international matches per Wikipedia).
 * - UEFA, by the season a final closes (the year it starts): the 2026 Champions League final at the Estadio Metropolitano
 *   (UEFA, 11 Sep 2025) and the 2027 one at the Munich Football Arena; the 2026 Europa League final at the Frankfurt
 *   stadium (UEFA, 22 May 2024) and the 2027 one at the National Arena, Bucharest; the 2026 Super Cup in Salzburg (UEFA,
 *   11 Sep 2025, which names the city alone: guess, its UEFA ground, the Red Bull Arena), the 2027 one at the Johan Cruyff
 *   ArenA and the 2028 one at the Astana Arena (UEFA, 15 Sep 2026); 2025's at the Puskás Aréna, Beşiktaş Stadium and
 *   Stadio Friuli. Capacities for European matches where Wikipedia gives one, else for football (read 2026-10-18).
 */
export const ANNOUNCED_HOSTS: Readonly<Record<string, AnnouncedHost>> = {
  "world-cup-2026": { countries: ["united-states", "canada", "mexico"], final: WORLD_CUP_2026[0], grounds: WORLD_CUP_2026 },
  "world-cup-2030": {
    countries: ["spain", "portugal", "morocco", "argentina", "uruguay", "paraguay"],
    grounds: BIG_STADIUMS.filter((ground) => ["spain", "portugal", "morocco"].includes(ground.country)),
  },
  "world-cup-2034": {
    countries: ["saudi-arabia"],
    final: { name: "King Salman International Stadium", city: "Riad", country: "saudi-arabia", capacity: 92_760 },
    grounds: [
      { name: "King Salman International Stadium", city: "Riad", country: "saudi-arabia", capacity: 92_760 },
      stadium("King Fahd International Stadium"),
      stadium("King Abdullah Sports City Stadium"),
    ],
  },
  "euro-2028": { countries: ["england", "scotland", "wales", "republic-of-ireland"], final: EURO_2028[0], grounds: EURO_2028 },
  "euro-2032": { countries: ["italy", "turkiye"] },
  "club-world-cup-2025": { countries: ["united-states"] },
  "libertadores-2025": { countries: ["peru"] },
  "libertadores-2026": { countries: ["uruguay"], final: stadium("Estadio Centenario") },
  "sul-americana-2025": { countries: ["paraguay"] },
  "sul-americana-2026": { countries: ["colombia"], final: stadium("Estadio Metropolitano Roberto Meléndez") },
  "sul-americana-2027": { countries: ["bolivia"], final: { name: "Estadio Ramón Tahuichi Aguilera", city: "Santa Cruz de la Sierra", country: "bolivia", capacity: 31_400 } },
  "champions-league-2025": { countries: ["hungary"] },
  "champions-league-2026": { countries: ["spain"], final: { name: "Estádio Metropolitano", city: "Madri", country: "spain", capacity: 70_813 } },
  "champions-league-2027": { countries: ["germany"], final: { name: "Allianz Arena", city: "Munique", country: "germany", capacity: 70_000 } },
  "europa-league-2025": { countries: ["turkiye"] },
  "europa-league-2026": { countries: ["germany"], final: { name: "Deutsche Bank Park", city: "Frankfurt", country: "germany", capacity: 53_800 } },
  "europa-league-2027": { countries: ["romania"], final: { name: "Arena Națională", city: "Bucareste", country: "romania", capacity: 55_634 } },
  "uefa-super-cup-2025": { countries: ["italy"] },
  "uefa-super-cup-2026": { countries: ["austria"], final: { name: "Red Bull Arena", city: "Wals-Siezenheim", country: "austria", capacity: 29_520 } },
  "uefa-super-cup-2027": { countries: ["netherlands"], final: { name: "Johan Cruyff ArenA", city: "Amsterdã", country: "netherlands", capacity: 56_120 } },
  "uefa-super-cup-2028": { countries: ["kazakhstan"], final: { name: "Astana Arena", city: "Astana", country: "kazakhstan", capacity: 30_244 } },
};
