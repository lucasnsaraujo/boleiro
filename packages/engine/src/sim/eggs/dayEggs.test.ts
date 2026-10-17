import { expect, test } from "vitest";
import type { DayEvent } from "../advanceDay.js";
import type { Fixture, GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { fillSlots } from "../events/fillSlots.js";
import { EGG_BANK } from "./eggBank.js";
import type { DayEgg, DayScene } from "./eggType.js";

const CLUB = "flamengo-rj";
const start = loadNewGame(5, { coachClubId: CLUB });
const RIVAL = Object.values(start.clubs).find((club) => club.division === "A" && club.id !== CLUB)?.id ?? "";

function egg(id: string): DayEgg {
  const found = EGG_BANK.find((type) => type.id === id);
  if (found?.on !== "day") throw new Error(`no day egg ${id}`);
  return found;
}

const ALWAYS = () => 0;
const NEVER = () => 0.999;

function scene(fields: Partial<DayScene> = {}): DayScene {
  return {
    before: start,
    state: start,
    date: "2026-05-10",
    clubId: CLUB,
    coach: { name: "Tite", record: start.history.coach },
    otherCoachNames: [],
    played: [],
    events: [],
    random: ALWAYS,
    ...fields,
  };
}

const finds = (id: string, fields: Partial<DayScene> = {}) => egg(id).find(scene(fields));

const played = (date: string, home: string, away: string, homeGoals: number, awayGoals: number, competitionId = "serie-a-2026"): Fixture => ({
  id: `${date}-${home}-${away}`,
  competitionId,
  stage: 0,
  date,
  homeId: home,
  awayId: away,
  result: { homeGoals, awayGoals },
});

/** The coach's club with `fixtures` as its season so far. */
const withFixtures = (fixtures: Fixture[]): GameState => ({ ...start, fixtures });

/** A stint at the club that began on `from`. */
const since = (from: string) => ({ ...start.history.coach, stints: [{ clubId: CLUB, from, until: null, left: null }] });

test("the board sends a cake on the coach's first anniversary at the club", () => {
  expect(finds("board-cake", { date: "2027-01-05", coach: { name: "Tite", record: since("2026-01-05") } })?.clubId).toBe(CLUB);
  expect(finds("board-cake", { date: "2027-01-06", coach: { name: "Tite", record: since("2026-01-05") } })).toBeNull();
  expect(finds("board-cake", { date: "2028-01-05", coach: { name: "Tite", record: since("2026-01-05") } })).toBeNull();
});

const trials = (prospectIds: string[]): DayEvent => ({ type: "youthTrialsHeld", clubId: CLUB, prospectIds });
const newKids = (state: GameState) => Object.values(state.youth?.prospects ?? {}).filter((p) => p.clubId === CLUB).slice(0, 3).map((p) => p.id);

test("the academy trials sometimes bring a kid named after the coach", () => {
  const kids = newKids(start);
  const named = finds("namesake", { events: [trials(kids)] });
  expect(named?.rename).toEqual([{ prospectId: kids.at(-1), name: "Tite" }]);
  expect(finds("namesake", { events: [trials(kids)], random: NEVER })).toBeNull();
  expect(finds("namesake", { events: [] })).toBeNull();
  expect(finds("namesake", { events: [trials(kids)], coach: { name: "", record: start.history.coach } })).toBeNull();
});

test("the stories of a kid named after the coach fit a coach of any name", () => {
  const namesakes = EGG_BANK.filter((type) => type.id === "namesake" || type.id === "namesake-scores");
  expect(namesakes).toHaveLength(2);
  const told = namesakes.flatMap((type) => type.texts.map((text) => fillSlots(`${text.headline} ${text.body}`, { player: "Ana Souza", club: "Bahia", score: "Bahia 1 × 0 Vitória" })));
  for (const story of told) expect(story).not.toMatch(/\b(o garoto|o menino|dele|filho)\b/i);
});

test("in a hot-seat game the trials can bring kids named after the cousins, the other human coaches", () => {
  const kids = newKids(start);
  expect(finds("cousins", { events: [trials(kids)], otherCoachNames: ["Ana", "Beto"] })?.rename).toEqual([
    { prospectId: kids[0], name: "Ana" },
    { prospectId: kids[1], name: "Beto" },
  ]);
  expect(finds("cousins", { events: [trials(kids)], otherCoachNames: [] })).toBeNull();
  expect(finds("cousins", { events: [trials(kids)], otherCoachNames: ["Ana"], random: NEVER })).toBeNull();
});

test("on April Fools' Day the paper sometimes prints a signing that isn't", () => {
  expect(finds("april-fools", { date: "2026-04-01" })?.clubId).toBe(CLUB);
  expect(finds("april-fools", { date: "2026-04-01", random: NEVER })).toBeNull();
  expect(finds("april-fools", { date: "2026-04-02" })).toBeNull();
});

test("a match on 19 July, Brazil's football day", () => {
  const match = played("2026-07-19", CLUB, RIVAL, 1, 0);
  expect(finds("football-day", { date: "2026-07-19", played: [match] })?.clubId).toBe(CLUB);
  expect(finds("football-day", { date: "2026-07-19", played: [] })).toBeNull();
  expect(finds("football-day", { date: "2026-07-20", played: [{ ...match, date: "2026-07-20" }] })).toBeNull();
});

test("the squad's secret Santa at Christmas", () => {
  const found = finds("secret-santa", { date: "2026-12-25" });
  expect(found?.clubId).toBe(CLUB);
  expect(found?.slots?.player).toBeTruthy();
  expect(finds("secret-santa", { date: "2026-12-25", random: NEVER })).toBeNull();
  expect(finds("secret-santa", { date: "2026-12-24" })).toBeNull();
});

test("two players of the same name in the squad, once per pair", () => {
  const squad = Object.values(start.players).filter((p) => p.clubId === CLUB);
  const [first, second] = squad;
  if (!first || !second) throw new Error("no squad");
  const twins: GameState = { ...start, players: { ...start.players, [second.id]: { ...second, name: first.name } } };
  expect(egg("same-name").once).toBe("player");
  expect(finds("same-name", { date: "2026-06-01", state: twins })?.playerId).toBe([first.id, second.id].sort()[0]);
  expect(finds("same-name", { date: "2026-06-02", state: twins })).toBeNull();
  const distinct = Object.fromEntries(squad.map((p, i): [string, SimPlayer] => [p.id, { ...p, name: `Jogador ${i}` }]));
  expect(finds("same-name", { date: "2026-06-01", state: { ...start, players: { ...start.players, ...distinct } } })).toBeNull();
});

test("a Série A title without a single defeat, like Internacional's in 1979", () => {
  const competitionId = Object.values(start.competitions).find((c) => c.kind === "league" && c.division === "A")?.id ?? "";
  const season = [played("2026-11-01", CLUB, RIVAL, 1, 1, competitionId), played("2026-11-20", RIVAL, CLUB, 0, 2, competitionId)];
  const ended: DayEvent = { type: "seasonEnded", season: 2026, outcomes: { [competitionId]: { championId: CLUB, promotedIds: [], relegatedIds: [] } } };
  expect(finds("unbeaten-champion", { before: withFixtures(season), events: [ended] })?.clubId).toBe(CLUB);
  const lost = [...season, played("2026-11-25", RIVAL, CLUB, 1, 0, competitionId)];
  expect(finds("unbeaten-champion", { before: withFixtures(lost), events: [ended] })).toBeNull();
  const otherChampion: DayEvent = { ...ended, outcomes: { [competitionId]: { championId: RIVAL, promotedIds: [], relegatedIds: [] } } };
  expect(finds("unbeaten-champion", { before: withFixtures(season), events: [otherChampion] })).toBeNull();
});

test("the same score five matches running", () => {
  const five = ["05-01", "05-04", "05-08", "05-11", "05-15"].map((day, i) => (i % 2 ? played(`2026-${day}`, RIVAL, CLUB, 0, 1) : played(`2026-${day}`, CLUB, RIVAL, 1, 0)));
  expect(finds("same-score-five", { date: "2026-05-15", played: five.slice(-1), state: withFixtures(five) })?.clubId).toBe(CLUB);
  const broken = [...five.slice(0, 4), played("2026-05-15", CLUB, RIVAL, 2, 0)];
  expect(finds("same-score-five", { date: "2026-05-15", played: broken.slice(-1), state: withFixtures(broken) })).toBeNull();
  expect(finds("same-score-five", { date: "2026-05-16", played: [], state: withFixtures(five) })).toBeNull();
});

test("four goalless draws running", () => {
  const four = ["05-01", "05-04", "05-08", "05-11"].map((day) => played(`2026-${day}`, CLUB, RIVAL, 0, 0));
  expect(finds("goalless-run", { date: "2026-05-11", played: four.slice(-1), state: withFixtures(four) })?.clubId).toBe(CLUB);
  const scored = [...four.slice(0, 3), played("2026-05-11", CLUB, RIVAL, 1, 1)];
  expect(finds("goalless-run", { date: "2026-05-11", played: scored.slice(-1), state: withFixtures(scored) })).toBeNull();
});

test("the Copa do Brasil won and the league lost to relegation in the same season, as Palmeiras in 2012", () => {
  const competitionId = Object.values(start.competitions).find((c) => c.kind === "league" && c.division === "A")?.id ?? "";
  const ended: DayEvent = { type: "seasonEnded", season: 2026, outcomes: { [competitionId]: { championId: RIVAL, promotedIds: [], relegatedIds: [CLUB] } } };
  const filed = (champion: string): GameState => ({
    ...start,
    history: { ...start.history, seasons: [{ season: 2026, champions: { "copa-do-brasil": champion }, topScorers: {}, promoted: { A: [], B: [], C: [], D: [] }, relegated: { A: [CLUB], B: [], C: [], D: [] }, tables: { A: [], B: [], C: [], D: [] } }] },
  });
  expect(finds("relegated-cup-winner", { state: filed(CLUB), events: [ended] })?.clubId).toBe(CLUB);
  expect(finds("relegated-cup-winner", { state: filed(RIVAL), events: [ended] })).toBeNull();
  expect(finds("relegated-cup-winner", { state: filed(CLUB), events: [] })).toBeNull();
});
