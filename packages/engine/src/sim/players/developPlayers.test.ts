import { describe, expect, it } from "vitest";
import type { GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { developPlayers, groupsToFill, rebuildMovedSquads, retiresAtSeasonTurn } from "./developPlayers.js";

const start = loadNewGame(9, { coachClubId: null });
const regular = (p: SimPlayer) => Number(p.id.slice(1)) % 2 === 0;
const playedSeason: GameState = {
  ...start,
  players: Object.fromEntries(
    Object.entries(start.players).map(([id, p]) => [
      id,
      { ...p, condition: { ...p.condition, seasonMinutes: regular(p) ? 30 * 90 : 0, seasonPoints: regular(p) ? 40 : 0 } },
    ]),
  ),
};
const { state: next, events } = developPlayers(playedSeason);
const survivors = Object.values(playedSeason.players).filter((p) => next.players[p.id]);
const change = (p: SimPlayer) => (next.players[p.id]?.strength ?? 0) - p.strength;
const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1);
const youth = Object.values(next.players).filter((p) => !playedSeason.players[p.id]);
const divisionOf = (p: SimPlayer) => next.clubs[p.clubId]?.division ?? null;

describe("developPlayers at the end of a season", () => {
  it("ages every player by a year and clears the season's minutes", () => {
    expect(survivors.every((p) => next.players[p.id]?.age === p.age + 1)).toBe(true);
    expect(Object.values(next.players).every((p) => p.condition.seasonMinutes === 0 && p.condition.seasonPoints === 0)).toBe(true);
  });

  it("raises young players, holds the late twenties and lowers players past 31", () => {
    const at = (min: number, max: number) => mean(survivors.filter((p) => p.age >= min && p.age <= max).map(change));
    expect(at(17, 22)).toBeGreaterThan(0.25);
    expect(Math.abs(at(27, 30))).toBeLessThan(0.4);
    expect(at(32, 40)).toBeLessThan(-0.4);
  });

  it("improves regulars more than players who did not play", () => {
    const playing = mean(survivors.filter(regular).map(change));
    const benched = mean(survivors.filter((p) => !regular(p)).map(change));
    expect(playing - benched).toBeGreaterThan(0.5);
  });

  it("retires nobody under 29 and most players over 39", () => {
    const retired = new Set(events.filter((e) => e.type === "playerRetired").map((e) => e.playerId));
    const all = Object.values(playedSeason.players);
    expect(all.filter((p) => p.age < 29 && retired.has(p.id))).toEqual([]);
    const old = all.filter((p) => p.age >= 39);
    expect(old.filter((p) => retired.has(p.id)).length / old.length).toBeGreaterThan(0.4);
    expect(retired.size).toBeGreaterThan(200);
  });

  it("retires exactly the players foreseen to retire at the season's turn", () => {
    const retired = events.filter((e) => e.type === "playerRetired").map((e) => e.playerId).sort();
    expect(retired).toEqual(Object.values(playedSeason.players).filter((p) => retiresAtSeasonTurn(playedSeason, p)).map((p) => p.id).sort());
  });

  it("foresees the same retirements on the season's eve whatever the members did in its last month", () => {
    const swung: GameState = { ...playedSeason, finances: Object.fromEntries(Object.entries(playedSeason.finances).map(([id, f]) => [id, { ...f, membership: f.membership * 50 }])) };
    const foreseen = (state: GameState) => Object.values(state.players).filter((p) => retiresAtSeasonTurn(state, p)).map((p) => p.id).sort();
    expect(foreseen(swung)).toEqual(foreseen(playedSeason));
  });

  it("replaces retirees with Brazilian teenagers, stronger at bigger clubs", () => {
    expect(youth.length).toBeGreaterThanOrEqual(events.filter((e) => e.type === "playerRetired").length);
    expect(youth.every((p) => p.age >= 17 && p.age <= 19 && p.nationalities.join() === "Brazil" && p.name.length > 2)).toBe(true);
    expect(new Set(youth.map((p) => p.name)).size).toBeGreaterThan(youth.length * 0.7);
    const youthOf = (division: string | null) => mean(youth.filter((p) => divisionOf(p) === division).map((p) => p.strength));
    expect(youthOf("A")).toBeGreaterThan(youthOf("B"));
    expect(youthOf("B")).toBeGreaterThan(youthOf("D"));
    expect(youthOf("A") - youthOf("D")).toBeGreaterThan(15);
  });

  it("keeps every club with a squad of at least 18 and a wage for every newcomer", () => {
    const sizes = new Map<string, number>();
    for (const p of Object.values(next.players)) sizes.set(p.clubId, (sizes.get(p.clubId) ?? 0) + 1);
    expect(Math.min(...sizes.values())).toBeGreaterThanOrEqual(18);
    expect(youth.every((p) => p.wage > 0 && p.trait !== undefined)).toBe(true);
  });

  it("pays a thin club's academy players the division's going rate, not its lowest wage", () => {
    const thinId = Object.values(start.clubs).find((c) => c.division === "D")?.id ?? "";
    const kept = Object.values(playedSeason.players).filter((p) => p.clubId === thinId && p.age < 29).slice(0, 2);
    const others = Object.values(playedSeason.players).filter((p) => p.clubId !== thinId);
    const thin: GameState = { ...playedSeason, players: Object.fromEntries([...others, ...kept.map((p) => ({ ...p, wage: 50_000 }))].map((p) => [p.id, p])) };
    const after = Object.values(developPlayers(thin).state.players).filter((p) => !thin.players[p.id]);
    const thinYouth = after.filter((p) => p.clubId === thinId);
    const otherDYouth = after.filter((p) => p.clubId !== thinId && thin.clubs[p.clubId]?.division === "D");
    expect(thinYouth.length).toBeGreaterThanOrEqual(16);
    expect(Math.max(...thinYouth.map((p) => p.wage))).toBeLessThanOrEqual(Math.max(...otherDYouth.map((p) => p.wage)));
  });

  it("replaces a retiree with an academy kid only when the kid would make the squad, unless a human coach runs the club", () => {
    const fullSquads = Object.values(start.clubs)
      .filter((c) => c.division === "A" && Object.values(start.players).filter((p) => p.clubId === c.id).length >= 25)
      .map((c) => c.id);
    const [farClub = "", readyClub = ""] = fullSquads;
    const veteranOf = (clubId: string) => Object.values(playedSeason.players).filter((p) => p.clubId === clubId && p.group === "MID").sort((a, b) => b.strength - a.strength)[0];
    const [farVeteran, readyVeteran] = [veteranOf(farClub), veteranOf(readyClub)];
    const [model] = Object.values(playedSeason.youth?.prospects ?? {});
    if (!farVeteran || !readyVeteran || !model || !playedSeason.youth) throw new Error("no squads to test with");
    const kid = (id: string, clubId: string, strength: number) => ({ ...model, id, clubId, group: "MID" as const, age: 18, strength, potential: strength + 10 });
    const far = kid("k-far", farClub, farVeteran.strength - 25);
    const ready = kid("k-ready", readyClub, readyVeteran.strength);
    const retiring = { afterSeason: playedSeason.season, hasBeenAsked: false };
    const turning: GameState = {
      ...playedSeason,
      players: { ...playedSeason.players, [farVeteran.id]: { ...farVeteran, retiring }, [readyVeteran.id]: { ...readyVeteran, retiring } },
      youth: { ...playedSeason.youth, prospects: { [far.id]: far, [ready.id]: ready } },
    };
    const turned = developPlayers(turning).state;
    expect(turned.players[ready.id]?.clubId).toBe(readyClub);
    expect(turned.players[far.id]).toBeUndefined();
    expect(turned.youth?.prospects[far.id]).toEqual(far);
    const coached = developPlayers({ ...turning, coachClubId: farClub }).state;
    expect(coached.players[far.id]?.clubId).toBe(farClub);
  });

  it("grows an academy graduate toward his potential at a human coach's club, and toward his club's level at an AI club", () => {
    const clubId = "flamengo-rj";
    const graduates = Object.values(playedSeason.players).filter((p) => p.clubId === clubId && p.age >= 21 && p.age <= 25).map((p) => ({ ...p, potential: p.strength + 12 }));
    const withGraduates: GameState = { ...playedSeason, players: { ...playedSeason.players, ...Object.fromEntries(graduates.map((p) => [p.id, p])) } };
    const growth = (state: GameState) => {
      const after = developPlayers(state).state.players;
      return mean(graduates.map((p) => (after[p.id]?.strength ?? p.strength) - p.strength));
    };
    expect(graduates.length).toBeGreaterThan(3);
    expect(growth(withGraduates)).toBeCloseTo(growth(playedSeason), 6);
    expect(growth({ ...withGraduates, coachClubId: clubId }) - growth(withGraduates)).toBeGreaterThan(1);
  });

  it("drops the pre-contracts and loans of players who retire", () => {
    const veterans = Object.values(playedSeason.players).filter((p) => p.age >= 38);
    const loan = { fromClubId: "flamengo-rj", until: "2026-12-31", lenderWageShare: 0.5, buyOption: null };
    const agreed: GameState = {
      ...playedSeason,
      market: {
        ...playedSeason.market,
        preContracts: Object.fromEntries(veterans.map((p) => [p.id, "flamengo-rj"])),
        loans: Object.fromEntries(veterans.map((p) => [p.id, loan])),
      },
    };
    const after = developPlayers(agreed).state;
    const retired = veterans.filter((p) => !after.players[p.id]);
    expect(retired.length).toBeGreaterThan(0);
    for (const p of retired) expect([after.market.preContracts[p.id], after.market.loans[p.id]], p.id).toEqual([undefined, undefined]);
    const stayed = veterans.find((p) => after.players[p.id]);
    expect(after.market.preContracts[stayed?.id ?? ""]).toBe("flamengo-rj");
  });

  it("draws from the game's random stream", () => {
    expect(next.rngState).not.toBe(playedSeason.rngState);
    expect(developPlayers(playedSeason).state).toEqual(next);
  });
});

describe("groupsToFill", () => {
  it("tops a squad up in the 2026 squads' shape, which holds more forwards than the old guess: a fifth forward before a sixth midfielder", () => {
    const staying = (["GK", "GK", ...Array<"DEF">(6).fill("DEF"), ...Array<"MID">(5).fill("MID"), ...Array<"ATT">(4).fill("ATT")] as const).map((group) => ({ group }));
    expect(groupsToFill(staying, [])).toEqual(["ATT"]);
  });
});

describe("rebuildMovedSquads", () => {
  const squadMean = (players: GameState["players"], clubId: string) => mean(Object.values(players).filter((p) => p.clubId === clubId).map((p) => p.strength));
  const firstIn = (division: "A" | "B") => Object.values(start.clubs).filter((c) => c.division === division).map((c) => c.id).sort()[0] ?? "";
  const promotedClub = firstIn("B");
  const relegatedClub = firstIn("A");
  const moved = (clubId: string, division: "A" | "B"): GameState["clubs"] => {
    const club = start.clubs[clubId];
    if (!club) throw new Error(`no club ${clubId}`);
    return { ...start.clubs, [clubId]: { ...club, division } };
  };
  const scaled = (clubId: string, factor: number): GameState["finances"] => {
    const finance = start.finances[clubId];
    if (!finance) throw new Error(`no finances for ${clubId}`);
    const { tv, sponsorship, membership, otherIncome, expectedTickets, expectedPrizes } = finance;
    return { ...start.finances, [clubId]: { ...finance, tv: tv * factor, sponsorship: sponsorship * factor, membership: membership * factor, otherIncome: otherIncome * factor, expectedTickets: expectedTickets * factor, expectedPrizes: expectedPrizes * factor } };
  };
  const lift = (state: GameState, clubs: GameState["clubs"], finances: GameState["finances"], clubId: string) => squadMean(rebuildMovedSquads(state, clubs, finances), clubId) - squadMean(state.players, clubId);

  it("lifts a promoted club's squad most of the way to Série A and leaves the other clubs' players as they were", () => {
    const players = rebuildMovedSquads(start, moved(promotedClub, "A"), start.finances);
    expect(squadMean(players, promotedClub) - squadMean(start.players, promotedClub)).toBeGreaterThan(3);
    const others = Object.values(start.players).filter((p) => p.clubId !== promotedClub);
    expect(others.every((p) => players[p.id] === p)).toBe(true);
  });

  it("lowers a relegated club's squad toward Série B", () => {
    expect(lift(start, moved(relegatedClub, "B"), start.finances, relegatedClub)).toBeLessThan(-2);
  });

  it("rebuilds a richer promoted club further than a poorer one", () => {
    const poorer = lift(start, moved(promotedClub, "A"), start.finances, promotedClub);
    expect(lift(start, moved(promotedClub, "A"), scaled(promotedClub, 10), promotedClub)).toBeGreaterThan(poorer + 2);
  });

  it("barely rebuilds a relegated club richer than any club of its new division", () => {
    const flamengo = "flamengo-rj";
    expect(lift(start, moved(flamengo, "B"), start.finances, flamengo)).toBeGreaterThan(-1);
  });

  it("moves a squad only the way its club went: a relegated squad already below its new division keeps its players", () => {
    const weak: GameState = { ...start, players: Object.fromEntries(Object.entries(start.players).map(([id, p]) => [id, p.clubId === relegatedClub ? { ...p, strength: 40 } : p])) };
    expect(lift(weak, moved(relegatedClub, "B"), start.finances, relegatedClub)).toBe(0);
  });

  it("rebuilds a moved club's players out on loan with it, and leaves the players it borrowed to their own clubs", () => {
    const lender = firstIn("A");
    const lent = Object.values(start.players).find((p) => p.clubId === promotedClub);
    const borrowed = Object.values(start.players).find((p) => p.clubId === lender);
    if (!lent || !borrowed) throw new Error("no players to loan");
    const loan = { until: "2026-12-31", lenderWageShare: 0, buyOption: null };
    const loaned: GameState = {
      ...start,
      players: { ...start.players, [lent.id]: { ...lent, clubId: lender }, [borrowed.id]: { ...borrowed, clubId: promotedClub } },
      market: { ...start.market, loans: { ...start.market.loans, [lent.id]: { ...loan, fromClubId: promotedClub }, [borrowed.id]: { ...loan, fromClubId: lender } } },
    };
    const players = rebuildMovedSquads(loaned, moved(promotedClub, "A"), start.finances);
    expect(players[lent.id]?.strength).toBeGreaterThan(lent.strength);
    expect(players[borrowed.id]).toBe(loaned.players[borrowed.id]);
  });

  it("rebuilds a moved squad as if the players leaving it at the turn of the year had gone, and leaves them as they are", () => {
    const squad = Object.values(start.players).filter((p) => p.clubId === promotedClub);
    const leavers = squad.slice(0, 6);
    const staying = squad.slice(6);
    const isLeaver = (id: string) => leavers.some((p) => p.id === id);
    const contracts = squad.map((p, i) => ({ ...p, strength: isLeaver(p.id) ? 95 : p.strength, contractUntil: i < 3 ? `${start.season}-12-31` : `${start.season + 2}-12-31` }));
    const leaving: GameState = {
      ...start,
      players: { ...start.players, ...Object.fromEntries(contracts.map((p) => [p.id, p])) },
      market: { ...start.market, preContracts: { ...start.market.preContracts, ...Object.fromEntries(leavers.slice(3).map((p) => [p.id, relegatedClub])) } },
    };
    const gone: GameState = { ...leaving, players: Object.fromEntries(Object.entries(leaving.players).filter(([id]) => !isLeaver(id))), market: start.market };
    const rebuilt = rebuildMovedSquads(leaving, moved(promotedClub, "A"), start.finances);
    const rebuiltWithoutLeavers = rebuildMovedSquads(gone, moved(promotedClub, "A"), start.finances);
    expect(leavers.map((p) => rebuilt[p.id])).toEqual(leavers.map((p) => leaving.players[p.id]));
    expect(staying.map((p) => rebuilt[p.id]?.strength)).toEqual(staying.map((p) => rebuiltWithoutLeavers[p.id]?.strength));
    expect(lift(gone, moved(promotedClub, "A"), start.finances, promotedClub)).toBeGreaterThan(3);
  });

  describe("a giant in Série B", () => {
    const flamengo = "flamengo-rj";
    const [model] = Object.values(start.players).filter((p) => p.clubId === flamengo);
    if (!model) throw new Error("Flamengo has no players");
    // Many players at 28, where the age curve is flat, so a season's drift is the pull to the club's level and the noise averages out.
    const squadAt = (strength: number) => Array.from({ length: 300 }, (_, i): SimPlayer => ({ ...model, id: `giant-${i}`, age: 28, strength, contractUntil: `${start.season + 3}-12-31` }));
    const cameFrom = (division: "A" | "C", strength: number): GameState => {
      const club = start.clubs[flamengo];
      if (!club) throw new Error("no Flamengo");
      const others = Object.entries(start.players).filter(([, p]) => p.clubId !== flamengo);
      return { ...start, clubs: { ...start.clubs, [flamengo]: { ...club, division } }, players: Object.fromEntries([...others, ...squadAt(strength).map((p) => [p.id, p] as const)]) };
    };
    const inB = moved(flamengo, "B");
    // The squad once the rebuild stops moving it: it stands at the level the rebuild aims for.
    const settled = (state: GameState): GameState => {
      let players = state.players;
      for (let i = 0; i < 30; i++) players = rebuildMovedSquads({ ...state, players }, inB, start.finances);
      return { ...state, players };
    };
    const squadOf = (state: GameState) => Object.values(state.players).filter((p) => p.clubId === flamengo);

    it("rebuilds it toward one level whether it came down from Série A or up from Série C", () => {
      expect(squadMean(settled(cameFrom("C", 40)).players, flamengo)).toBeCloseTo(squadMean(settled(cameFrom("A", 95)).players, flamengo), 0);
    });

    it("pulls its players each season toward the level its squad was rebuilt to", () => {
      const relegated = settled(cameFrom("A", 95));
      const season: GameState = { ...relegated, clubs: inB };
      const after = developPlayers(season).state.players;
      expect(mean(squadOf(season).map((p) => (after[p.id]?.strength ?? p.strength) - p.strength))).toBeCloseTo(0, 0);
    });
  });

  it("leaves a human coach's squad for him to rebuild", () => {
    const coached: GameState = { ...start, coachClubId: promotedClub };
    expect(lift(coached, moved(promotedClub, "A"), start.finances, promotedClub)).toBe(0);
  });
});
