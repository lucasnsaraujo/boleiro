import { beforeAll, describe, expect, it } from "vitest";
import { leagueMatches } from "@boleiro/engine/sim/world/resultOnlyLeague";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { createEngineSession, type EngineSession } from "../engine/createEngineSession.js";
import type { LiveRound } from "../round/liveRoundOf.js";
import { matchPageAt } from "./matchPageAt.js";
import { worldMatchRef, type MatchPage } from "./matchPageOf.js";

const CLUB = "flamengo-rj";
// Enough play-ons to reach the coach's first match day.
const MAX_STEPS = 20;
// The leagues abroad kick off within a few months of the game's start.
const DAYS_TO_LEAGUES_ABROAD = 150;

const goalsOf = (page: MatchPage, clubId: string) => page.events.filter((e) => e.type === "goal" && e.clubId === clubId).length;

function openPage(session: EngineSession, ref: string): MatchPage {
  const page = session.matchPage(ref);
  if (!page) throw new Error(`match ${ref} has a page`);
  return page;
}

let session: EngineSession;
let round: LiveRound;
let coachFixtureId: string;
let otherFixtureId: string;

beforeAll(() => {
  session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 4, choices: { coachClubId: CLUB } });
  for (let step = 0; step < MAX_STEPS && session.apply({ type: "playToMatchDay" }).stop !== "matchDay"; step++);
  round = session.apply({ type: "startRound" });
  coachFixtureId = round.coach?.fixtureId ?? "";
  otherFixtureId = round.matches.find((m) => m.fixtureId !== coachFixtureId && m.events.some((e) => e.type === "goal"))?.fixtureId ?? "";
});

describe("the match page of the round under way", () => {
  it("opens any match of the round on its real timeline, each with its own clubs, so the panel can swap between them", () => {
    for (const fixtureId of [coachFixtureId, otherFixtureId]) {
      const page = openPage(session, fixtureId);
      const match = round.matches.find((m) => m.fixtureId === fixtureId);
      expect(page).toMatchObject({ ref: fixtureId, isLive: true, isRetold: false, home: { club: { id: match?.homeId } }, away: { club: { id: match?.awayId } } });
      expect(page.events).toEqual(match?.events);
      expect(page.home.starters).toHaveLength(11);
    }
  });

  it("puts a substitute on the pitch in place of the man he replaced, a hurt one included", () => {
    let hurtAndReplaced = 0;
    for (const match of round.matches) {
      const page = openPage(session, match.fixtureId);
      const { onPitch } = matchPageAt(page, 90);
      for (const sub of page.events) {
        if (sub.type !== "substitution") continue;
        const side = sub.clubId === match.homeId ? onPitch.home : onPitch.away;
        const isOffLater = page.events.some(
          (e) =>
            (e.type === "substitution" && e.offId === sub.playerId) ||
            (e.type === "card" && e.card === "red" && e.playerId === sub.playerId) ||
            (e.type === "injury" && e.playerId === sub.playerId),
        );
        if (page.events.some((e) => e.type === "injury" && e.playerId === sub.offId)) hurtAndReplaced++;
        expect(side.includes(sub.playerId)).toBe(!isOffLater);
        expect(side).not.toContain(sub.offId);
      }
    }
    expect(hurtAndReplaced).toBeGreaterThan(0);
  });

  it("gives away no goal before its minute: while the round runs, no curiosity names a scorer of the match", () => {
    for (const match of round.matches) {
      const page = openPage(session, match.fixtureId);
      const scorers = page.events.flatMap((e) => (e.type === "goal" ? [page.names[e.playerId] ?? e.playerId] : []));
      for (const text of page.curiosities) for (const name of scorers) expect(text).not.toContain(name);
    }
  });

  it("follows the clock: the score counts the goals up to the minute shown, and the marks wait for the final whistle", () => {
    const page = openPage(session, otherFixtureId);
    const first = page.events.find((e) => e.type === "goal");
    if (!first) return expect.fail("the match has a goal");
    const before = matchPageAt(page, first.minute - 1);
    const after = matchPageAt(page, first.minute);
    expect(before.score.home + before.score.away + 1).toBe(after.score.home + after.score.away);
    expect(after.ratings).toBeNull();
    const end = matchPageAt(page, 90);
    expect([end.score.home, end.score.away]).toEqual([goalsOf(page, page.home.club.id), goalsOf(page, page.away.club.id)]);
    expect(Object.keys(end.ratings ?? {}).length).toBeGreaterThanOrEqual(22);
  });

  it("shows the coach's substitution once he makes it during the round", () => {
    const coach = round.coach;
    const onId = coach?.benchIds[0];
    const offId = coach?.starters.find((id) => coach.squad.find((p) => p.id === id)?.group !== "GK");
    if (!onId || !offId) return expect.fail("the coach has a bench and outfielders");
    session.apply({ type: "changeLive", minute: 50, change: { substitutions: [{ offId, onId }] } });
    const page = openPage(session, coachFixtureId);
    expect(page.events).toContainEqual(expect.objectContaining({ type: "substitution", minute: 50, playerId: onId, offId }));
    expect(matchPageAt(page, 49).events.some((e) => e.kind === "substitution" && e.minute === 50)).toBe(false);
  });
});

describe("the match page of a played match", () => {
  let played: MatchPage;
  let retold: MatchPage;

  beforeAll(() => {
    session.apply({ type: "finishRound" });
    played = openPage(session, otherFixtureId);
    session.apply({ type: "advance", days: [{}] });
    retold = openPage(session, otherFixtureId);
  });

  it("keeps the real timeline of the round just played until the next day", () => {
    expect(played).toMatchObject({ isLive: false, isRetold: false });
    expect(played.events).toEqual(round.matches.find((m) => m.fixtureId === otherFixtureId)?.events);
  });

  it("tells an older match again from its fixture's seed, the same each time, ending on its real score", () => {
    const fixture = session.read(["fixtures"]).fixtures.find((f) => f.id === otherFixtureId);
    expect(retold).toMatchObject({ isLive: false, isRetold: true });
    expect(openPage(session, otherFixtureId)).toEqual(retold);
    expect([goalsOf(retold, fixture?.homeId ?? ""), goalsOf(retold, fixture?.awayId ?? "")]).toEqual([fixture?.result?.homeGoals, fixture?.result?.awayGoals]);
  });

  it("places both clubs in their table before and after a league match", () => {
    const { before, after } = played.home.place ?? { before: null, after: null };
    expect(before).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(0);
  });

  it("opens a match of a league played result-only abroad, with a named scorer for each goal", () => {
    const playedAbroad = () =>
      Object.values(session.read(["world"]).world ?? {}).find((c) => !c.isFullTier && c.leagues[0] && leagueMatches(c.leagues[0]).some((m) => m.result && m.result.homeGoals + m.result.awayGoals > 0));
    for (let day = 0; day < DAYS_TO_LEAGUES_ABROAD && !playedAbroad(); day++) session.apply({ type: "advance", days: [{}] });
    const country = playedAbroad();
    const league = country?.leagues[0];
    if (!country || !league) return expect.fail("a league abroad has played a match with goals");
    const index = leagueMatches(league).findIndex((m) => m.result && m.result.homeGoals + m.result.awayGoals > 0);
    const match = leagueMatches(league)[index];
    const page = openPage(session, worldMatchRef(country.structure.id, 0, index));
    expect(page).toMatchObject({ isRetold: true, home: { club: { id: match?.homeId } }, away: { club: { id: match?.awayId } } });
    expect([goalsOf(page, match?.homeId ?? ""), goalsOf(page, match?.awayId ?? "")]).toEqual([match?.result?.homeGoals, match?.result?.awayGoals]);
    for (const goal of page.events) if (goal.type === "goal") expect(page.names[goal.playerId]).toBeTruthy();
  });

  it("has no page for a match not played yet", () => {
    const next = session.read(["fixtures"]).fixtures.find((f) => !f.result);
    expect(session.matchPage(next?.id ?? "")).toBeNull();
  });
});
