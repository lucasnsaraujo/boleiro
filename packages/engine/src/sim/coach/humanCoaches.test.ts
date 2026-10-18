import { describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { startMatchDay } from "../live/startMatchDay.js";
import { loadNewGame } from "../loadNewGame.js";
import { isInjured } from "../players/isInjured.js";
import { loadGame, saveGame } from "../saveGame.js";
import { humanClubIds, isHumanClub, passTheSeat, waitingCoachesOf } from "./humanCoaches.js";
import { compareText } from "../compareText.js";

const FIRST = "flamengo-rj";
const SECOND = "palmeiras-sp";
const twoCoaches = loadNewGame(2, { coachClubId: FIRST, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: SECOND }] } });

function advanceUntil(state: GameState, isDone: (state: GameState) => boolean): GameState {
  let current = state;
  for (let day = 0; day < 400 && !isDone(current); day++) current = advanceDay(current, {}).state;
  return current;
}

/** The weakest eleven a club can field today: one fit goalkeeper and ten fit outfielders. */
function weakestEleven(state: GameState, clubId: string): string[] {
  const fit = Object.values(state.players)
    .filter((p) => p.clubId === clubId && !isInjured(p, state.date))
    .sort((a, b) => a.strength - b.strength || compareText(a.id, b.id));
  const keeper = fit.find((p) => p.group === "GK");
  const outfield = fit.filter((p) => p.group !== "GK").slice(0, 10);
  return [keeper, ...outfield].filter((p): p is SimPlayer => !!p).map((p) => p.id);
}

describe("hot-seat coaches", () => {
  it("leaves a one-coach game without waiting coaches, and passing the seat changes nothing", () => {
    const alone = loadNewGame(7, { coachClubId: FIRST });
    expect(alone.waitingCoaches).toBeUndefined();
    expect(passTheSeat(alone)).toBe(alone);
    expect(humanClubIds(alone)).toEqual([FIRST]);
  });

  it("starts every coach at his own club, the first in the seat", () => {
    expect(twoCoaches.coachClubId).toBe(FIRST);
    expect(twoCoaches.coachName).toBe("Ana");
    expect(waitingCoachesOf(twoCoaches).map((c) => [c.name, c.clubId])).toEqual([["Bruno", SECOND]]);
    expect(waitingCoachesOf(twoCoaches)[0]?.coach.contract).not.toBeNull();
    expect(isHumanClub(twoCoaches, SECOND)).toBe(true);
    expect(isHumanClub(twoCoaches, "santos-sp")).toBe(false);
  });

  it("refuses two coaches whose names differ only in case, accents or spaces", () => {
    expect(() => loadNewGame(6, { coachClubId: FIRST, hotSeat: { coachName: "Ana Lúcia", otherCoaches: [{ name: " ana  lucia ", clubId: SECOND }] } })).toThrow(/name/);
    expect(() => loadNewGame(6, { coachClubId: FIRST, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: SECOND }, { name: "BRUNO", clubId: "santos-sp" }] } })).toThrow(/name/);
  });

  it("still loads a save from before that rule with two coaches of one name", () => {
    const [bruno] = waitingCoachesOf(twoCoaches);
    if (!bruno) throw new Error("no waiting coach");
    const sameName = { ...twoCoaches, waitingCoaches: [{ ...bruno, name: "Ana" }] };
    const loaded = loadGame(saveGame(sameName));
    expect(waitingCoachesOf(loaded).map((c) => [c.name, c.clubId])).toEqual([["Ana", SECOND]]);
    expect(passTheSeat(loaded).coachClubId).toBe(SECOND);
  });

  it("refuses two coaches at one club", () => {
    expect(() => loadNewGame(6, { coachClubId: FIRST, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: FIRST }] } })).toThrow();
  });

  it("passes the seat in turn order and comes back to the first coach as he left it", () => {
    const second = passTheSeat(twoCoaches);
    expect(second.coachClubId).toBe(SECOND);
    expect(second.coachName).toBe("Bruno");
    expect(second.history.coach.stints[0]?.clubId).toBe(SECOND);
    expect(waitingCoachesOf(second).map((c) => c.clubId)).toEqual([FIRST]);
    expect(passTheSeat(second)).toEqual(twoCoaches);
  });

  it("plays the eleven the waiting coach picked on his turn", () => {
    const matchDay = advanceUntil(twoCoaches, (s) => s.fixtures.some((f) => f.date === s.date && !f.result && (f.homeId === SECOND || f.awayId === SECOND)));
    const fixture = matchDay.fixtures.find((f) => f.date === matchDay.date && (f.homeId === SECOND || f.awayId === SECOND));
    const eleven = weakestEleven(matchDay, SECOND);
    const day = startMatchDay(matchDay, { waiting: [{ lineup: eleven }] });
    // His match stays open for his live changes; untouched, it plays as drawn at kick-off.
    const sheet = day.waitingMatches?.find((open) => open.fixtureId === fixture?.id)?.kickOff.sheet;
    const played = fixture?.homeId === SECOND ? sheet?.home : sheet?.away;
    // The sheet lists the starters first, then whoever came on.
    expect(played?.slice(0, eleven.length).map((p) => p.id).sort()).toEqual([...eleven].sort());
  });

  it("hands the waiting coach's request to the board and brings the answer back as his news", () => {
    const player = Object.values(twoCoaches.players).find((p) => p.clubId === SECOND && p.contractUntil <= "2026-12-31");
    if (!player) throw new Error("the second club has a contract to renew");
    const request = { kind: "renew" as const, playerId: player.id, years: 1 };
    const day = advanceDay(twoCoaches, { waiting: [{ requests: [request] }] });
    expect(day.events.some((e) => e.type === "requestDecided")).toBe(false);
    expect(day.waitingEvents?.[0]?.some((e) => e.type === "requestDecided" && e.request.playerId === player.id)).toBe(true);
  });

  it("keeps the AI clubs off a waiting coach's squad while he runs the club", () => {
    let state = twoCoaches;
    const sold: string[] = [];
    let daysInCharge = 0;
    for (let day = 0; day < 365 && waitingCoachesOf(state)[0]?.clubId === SECOND; day++) {
      daysInCharge++;
      const played = advanceDay(state, {});
      for (const e of played.events) if (e.type === "playerMoved" && e.fromClubId === SECOND && e.kind === "transfer") sold.push(e.playerId);
      state = played.state;
    }
    expect(daysInCharge).toBeGreaterThan(30);
    expect(sold).toEqual([]);
  });

  it("writes a waiting coach's sacking into his own record and news, not the seated coach's", () => {
    let state = twoCoaches;
    let news: DayEvent[] = [];
    for (let day = 0; day < 365 && waitingCoachesOf(state)[0]?.clubId === SECOND; day++) {
      const played = advanceDay(state, {});
      news = played.waitingEvents?.[0] ?? [];
      state = played.state;
    }
    expect(waitingCoachesOf(state)[0]?.clubId).toBeNull();
    expect(news.some((e) => e.type === "coachFired" && e.isYou && e.clubId === SECOND)).toBe(true);
    expect(waitingCoachesOf(state)[0]?.record.firings.map((f) => f.clubId)).toEqual([SECOND]);
    expect(state.history.coach.firings.map((f) => f.clubId)).not.toContain(SECOND);
  });

  it("hires a waiting coach at the club whose offer he took on his turn", () => {
    const [bruno] = waitingCoachesOf(twoCoaches);
    if (!bruno) throw new Error("the game has a waiting coach");
    const offer = { clubId: "santos-sp", salary: 500_000, untilSeason: 2026, expiresOn: "2026-01-10" };
    const offered: GameState = { ...twoCoaches, waitingCoaches: [{ ...bruno, coach: { ...bruno.coach, offers: [offer] } }] };
    const day = advanceDay(offered, { waiting: [{ acceptOffer: "santos-sp" }] });
    expect(waitingCoachesOf(day.state)[0]?.clubId).toBe("santos-sp");
    expect(day.state.coachClubId).toBe(FIRST);
    expect(day.waitingEvents?.[0]?.some((e) => e.type === "coachHired" && e.clubId === "santos-sp")).toBe(true);
    expect(waitingCoachesOf(day.state)[0]?.record.stints.map((stint) => stint.clubId)).toEqual([SECOND, "santos-sp"]);
  });

  it("reviews a waiting coach at the turn of the year on the season just ended, not on the new board's target", () => {
    let state = loadNewGame(1, { coachClubId: "bahia-ba", hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: "cruzeiro-mg" }] } });
    while (state.season === 2026) state = advanceDay(state, {}).state;
    const table = state.history.seasons.find((season) => season.season === 2026)?.tables.A ?? [];
    const [review] = waitingCoachesOf(state)[0]?.record.seasons ?? [];
    expect(review?.clubId).toBe("cruzeiro-mg");
    expect(review?.position).toBe(table.indexOf("cruzeiro-mg") + 1);
    expect(review?.position).not.toBe(review?.targetPosition);
  });
});
