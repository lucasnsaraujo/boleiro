import { beforeAll, describe, expect, it } from "vitest";
import { nationalFixtureId } from "@boleiro/engine/sim/nations/nationalFixtures";
import { bundledGameFiles } from "../engine/bundledGameFiles.js";
import { createEngineSession, type EngineSession } from "../engine/createEngineSession.js";
import type { MatchDayPlan } from "./matchDayPlan.js";
import type { LiveRound } from "./liveRoundOf.js";

// Enough play-ons to reach Brazil's first match, a friendly in the March window.
const MAX_STEPS = 20;
// Mexico–South Africa, the 2026 World Cup's opening match on 11 June.
const WORLD_CUP_OPENER = "world-cup-2026-A-1-mexico";

/** A session whose coach, without a club, took the CBF's offer: the offer written into a save the session loads back, as a federation's would be. */
function brazilCoach(): EngineSession {
  const session = createEngineSession(bundledGameFiles);
  session.apply({ type: "newGame", seed: 4, choices: { coachClubId: null } });
  const save: { game: { nations: { offer?: { teamId: string; expiresOn: string } } } } = JSON.parse(session.save());
  save.game.nations.offer = { teamId: "brazil", expiresOn: "2026-12-31" };
  session.apply({ type: "load", save: JSON.stringify(save) });
  session.apply({ type: "acceptNationalJob" });
  return session;
}

describe("a national coach's round", () => {
  let session: EngineSession;
  let plan: MatchDayPlan;
  let round: LiveRound;
  beforeAll(() => {
    session = brazilCoach();
    for (let step = 0; step < MAX_STEPS && session.apply({ type: "playToMatchDay" }).stop !== "matchDay"; step++);
    plan = session.matchDayPlan();
    round = session.apply({ type: "startRound", lineup: plan.lineup, tactics: plan.tactics });
  });

  it("stops the days on his national team's match day", () => {
    expect(plan.clubId).toBe("brazil");
    expect([plan.homeId, plan.awayId]).toContain("brazil");
    expect(plan.label).toBe("Amistoso");
  });

  it("opens the lineup sheet on his call-up", () => {
    const callUp = session.nationalTeam("brazil")?.callUp.groups.flatMap((group) => group.players.map((p) => p.name)) ?? [];
    expect(plan.squad.length).toBe(callUp.length);
    expect(plan.squad.map((p) => p.name).sort()).toEqual([...callUp].sort());
    expect(plan.squad.every((p) => p.status !== "onDuty")).toBe(true);
    expect(plan.chemistry).toBeNull();
  });

  it("plays the round with Brazil as his side, every name and team on the board known", () => {
    expect(round.coachClubId).toBe("brazil");
    expect(round.coach?.starters.sort()).toEqual([...plan.lineup].sort());
    expect(round.clubs.brazil?.shortName).toBe("Brasil");
    const own = round.matches.find((m) => m.fixtureId === round.coach?.fixtureId);
    for (const id of [own?.homeId ?? "", own?.awayId ?? ""]) expect(round.clubs[id], id).toBeDefined();
    const named = (own?.events ?? []).flatMap((e) => ("playerId" in e ? [e.playerId] : []));
    for (const id of named) expect(round.names[id], id).toBeDefined();
    expect(round.humanSides).toBeUndefined();
  });

  it("opens the match's page with its real timeline once it is over", () => {
    const fixtureId = round.coach?.fixtureId ?? "";
    const live = round.matches.find((m) => m.fixtureId === fixtureId);
    session.apply({ type: "finishRound" });
    const page = session.matchPage(fixtureId);
    expect(page?.isRetold).toBe(false);
    expect(page?.label).toBe("Amistoso");
    expect(page?.home.club.shortName).toBe(round.clubs[live?.homeId ?? ""]?.shortName);
    const goals = (clubId: string) => (live?.events ?? []).filter((e) => e.type === "goal" && e.clubId === clubId).length;
    expect([page?.events.filter((e) => e.type === "goal").length]).toEqual([goals(live?.homeId ?? "") + goals(live?.awayId ?? "")]);
  });
});

describe("a national match played result-only", () => {
  it("opens a page told again from its seed with its real score, for a coach who runs no national team", () => {
    const session = createEngineSession(bundledGameFiles);
    session.apply({ type: "newGame", seed: 4, choices: { coachClubId: null } });
    const days = Math.round((Date.parse("2026-06-12") - Date.parse("2026-01-01")) / 86_400_000);
    session.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
    const ref = nationalFixtureId(WORLD_CUP_OPENER);
    const page = session.matchPage(ref);
    const opener = session.nationalTeam("mexico")?.fixtures.find((f) => f.id === WORLD_CUP_OPENER);
    expect(opener?.result).not.toBeNull();
    expect(page?.isRetold).toBe(true);
    expect(page?.label).toBe("Copa do Mundo 2026 · Grupo A");
    expect(page?.home.club.shortName).toBe("México");
    const goals = (clubId: string) => page?.events.filter((e) => e.type === "goal" && e.clubId === clubId).length;
    expect([goals("mexico"), goals(opener?.awayId ?? "")]).toEqual([opener?.result?.home, opener?.result?.away]);
    expect(page?.home.starters).toHaveLength(11);
    expect(page?.officials.hasVar).toBe(true);
    expect(session.matchPage(ref)).toEqual(page);
  });
});

describe("a save from before national matches were played live", () => {
  it("gets its national coach's matches among the fixtures when it loads", () => {
    const session = createEngineSession(bundledGameFiles);
    session.apply({ type: "newGame", seed: 4, choices: { coachClubId: null } });
    const save: { game: { date: string; fixtures: { id: string }[]; nations: { job?: { teamId: string; since: string } } } } = JSON.parse(session.save());
    save.game.nations.job = { teamId: "brazil", since: save.game.date };
    expect(save.game.fixtures.some((f) => f.id.startsWith("national:"))).toBe(false);
    session.apply({ type: "load", save: JSON.stringify(save) });
    const { fixtures } = session.read(["fixtures"]);
    expect(fixtures.filter((f) => f.homeId === "brazil" || f.awayId === "brazil").map((f) => f.date)).toEqual(["2026-06-13", "2026-06-20", "2026-06-24"]);
  });
});

describe("a national coach's World Cup round", () => {
  it("heads the day's World Cup matches by their phase and plays them on neutral ground", () => {
    const session = brazilCoach();
    const days = Math.round((Date.parse("2026-06-12") - Date.parse(session.read(["date"]).date)) / 86_400_000);
    session.apply({ type: "advance", days: Array.from({ length: days }, () => ({})) });
    for (let step = 0; step < MAX_STEPS && session.apply({ type: "playToMatchDay" }).stop !== "matchDay"; step++);
    const round = session.apply({ type: "startRound" });
    const own = round.matches.find((m) => m.fixtureId === round.coach?.fixtureId);
    expect([own?.homeId, own?.awayId]).toEqual(["brazil", "morocco"]);
    expect(round.competitions.find((c) => c.id === own?.competitionId)?.label).toBe("Copa do Mundo 2026 · fase de grupos");
    expect(own?.isNeutral).toBe(true);
    expect(round.table?.clubIds.sort()).toEqual(["brazil", "haiti", "morocco", "scotland"]);
  });
});
