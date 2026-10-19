import { eventMemoryOf } from "@boleiro/engine/sim/events/eventMemory";
import { expect, test } from "vitest";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { createEngineSession } from "../engine/createEngineSession.js";
import { newspaperEditions, newspaperOf } from "./roundNewspaper.js";

const CLUB = "flamengo-rj";

/** A game played through its first Série A rounds. */
function playedGame() {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 11, choices: { coachClubId: CLUB, stateChampionships: false } });
  let leagueGames = 0;
  for (let step = 0; step < 200 && leagueGames < 4; step++) {
    const { stop } = session.apply({ type: "playToMatchDay" });
    if (stop !== "matchDay") continue;
    session.apply({ type: "startRound" });
    const { events } = session.apply({ type: "finishRound" });
    if (events.some((e) => e.type === "matchPlayed" && e.fixture.competitionId.startsWith("serie-a") && (e.fixture.homeId === CLUB || e.fixture.awayId === CLUB))) leagueGames++;
  }
  return session.read(["coachClubId", "clubs", "fixtures", "competitions", "eventMemory", "date"]);
}

const game = playedGame();

test("the latest edition leads with the coach's match and prints its round's results and table", () => {
  const edition = newspaperOf(game);
  if (!edition?.match?.result) throw new Error("the paper leads with a played match");
  const { match } = edition;
  expect([match.homeId, match.awayId]).toContain(CLUB);
  expect(edition.lead?.kind).toBe("match");
  expect(edition.lead?.headline).toMatch(new RegExp(`${game.clubs[match.homeId]?.shortName}|${game.clubs[match.awayId]?.shortName}`));
  expect(edition.lead?.body).toContain(`${match.result?.homeGoals} × ${match.result?.awayGoals}`);
  expect(edition.round).toMatch(/ª rodada$/);
  expect(edition.results.title).toBe("Série A");
  expect(edition.results.lines[0]).toMatchObject({ homeId: match.homeId, awayId: match.awayId });
  expect(edition.results.lines.length).toBe(10);
  expect(edition.table).toHaveLength(4);
  expect(edition.table[0]?.points).toBeGreaterThanOrEqual(edition.table[3]?.points ?? 0);
  expect(edition.side.length).toBeGreaterThan(0);
  expect(edition.side.every((story) => story.kicker !== "" && story.date <= edition.date)).toBe(true);
});

test("each match day of the coach is an edition, newest first, and an old one shows its own day", () => {
  const editions = newspaperEditions(game);
  expect(editions.length).toBeGreaterThanOrEqual(4);
  expect(editions.map((e) => e.date)).toEqual([...editions.map((e) => e.date)].sort().reverse());
  const older = editions[2];
  if (!older) throw new Error("three editions");
  const edition = newspaperOf(game, older.date);
  expect(edition?.date).toBe(older.date);
  expect(edition?.lead?.headline).toBe(older.headline);
  expect(edition?.side.every((story) => story.date > (editions[3]?.date ?? "") && story.date <= older.date)).toBe(true);
});

test("a game without news has no paper yet", () => {
  expect(newspaperOf({ ...game, eventMemory: undefined })).toBeNull();
  expect(eventMemoryOf({ eventMemory: undefined }).news).toEqual([]);
});

test("files the events of the round under their own sections, and a story from an old save under Bastidores", () => {
  const story = (headline: string, topic?: "health" | "sponsors" | "rivals" | "staff") => ({ date: "2026-02-01", kind: "event" as const, clubIds: [CLUB], headline, body: "", ...(topic ? { topic } : {}) });
  const news = [
    story("Dengue tira o meia", "health"),
    story("Patrocinador quer o elenco", "sponsors"),
    story("Corneta do rival", "rivals"),
    story("Roupeiro se aposenta", "staff"),
    story("Atraso no treino"),
  ];
  const edition = newspaperOf({ ...game, coachClubId: null, eventMemory: { log: [], pending: {}, news, rivalry: {} } });
  const kickers = Object.fromEntries([edition?.lead, ...(edition?.side ?? [])].map((item) => [item?.headline, item?.kicker]));
  expect(kickers).toEqual({
    "Dengue tira o meia": "Departamento médico",
    "Patrocinador quer o elenco": "Patrocínio",
    "Corneta do rival": "Rivalidade",
    "Roupeiro se aposenta": "Comissão técnica",
    "Atraso no treino": "Bastidores",
  });
});

test("an easter egg prints in the side column under Almanaque, ahead of the other beats", () => {
  const latest = newspaperOf(game);
  if (!latest) throw new Error("no edition");
  const memory = eventMemoryOf(game);
  const egg = { date: latest.date, kind: "egg" as const, clubIds: ["palmeiras-sp"], headline: "Gol olímpico de alguém", body: "Direto do escanteio." };
  const withEgg = { ...game, eventMemory: { ...memory, news: [...memory.news, egg] } };
  const side = newspaperOf(withEgg, latest.date)?.side ?? [];
  expect(side[0]).toMatchObject({ kicker: "Almanaque", headline: "Gol olímpico de alguém" });
});

test("an edition before the coach's one-match final prints where its host plays it", () => {
  const libertadores = game.competitions["libertadores-2026"];
  const day = newspaperOf(game)?.date;
  if (libertadores?.kind !== "continental" || !libertadores.host || !day) throw new Error("a Libertadores with a host and an edition");
  const final = { id: "final", competitionId: libertadores.id, stage: libertadores.stageDates.length - 1, date: "2026-11-24", homeId: CLUB, awayId: "palmeiras-sp" };
  const fixtures = [...game.fixtures.filter((f) => f.result || (f.homeId !== CLUB && f.awayId !== CLUB)), final];
  expect(newspaperOf({ ...game, fixtures }, day)?.side[0]).toMatchObject({ kicker: "Libertadores", headline: "A final será em Montevidéu, no Estadio Centenario" });
  expect(newspaperOf(game, day)?.side.some((story) => story.headline.startsWith("A final será"))).toBe(false);
});
