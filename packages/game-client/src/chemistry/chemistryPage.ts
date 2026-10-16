import type { Role } from "@boleiro/data/players";
import { arrange, FORMATIONS, type Formation } from "@boleiro/engine/engine/formations";
import { chemistryOf, chemistryStrength, type ChemistryLink, type ChemistryReason } from "@boleiro/engine/sim/chemistry/chemistryOf";
import type { GameState, SimPlayer } from "@boleiro/engine/sim/gameState";

/** A sticker on the relationship map, at `x`/`y` percent of the pitch attacking upwards; reserves sit beside the starter they are linked to. */
export type MapPlayer = { id: string; name: string; strength: number; x: number; y: number; isReserve: boolean; isCaptain: boolean };

/** A line of "Por que está assim": what moves the meter, the players behind it, and its points. */
export type ReasonLine = { kind: ChemistryReason["kind"]; title: string; detail: string; points: number };

/** A line of the map, with the tag a pair fighting over a place or a fight carries. */
export type MapLink = ChemistryLink & { tag: string | null };

/** The chemistry screen of the coach's club. `effect` is the strength share the meter adds (negative when it takes). */
export type ChemistryPage = {
  clubId: string;
  value: number;
  was: number;
  effect: number;
  formation: Formation;
  reasons: ReasonLine[];
  players: MapPlayer[];
  links: MapLink[];
  captain: { playerId: string; name: string; standing: number; isNamed: boolean } | null;
  /** The squad by standing, most first: the coach names his captain among them, the assistant suggests the first. */
  candidates: { playerId: string; name: string; standing: number }[];
};

// Reserves stand about this far (percent of the pitch) from their starter, in the direction with most room.
const RESERVE_OFFSET_Y = 20;
const RESERVE_OFFSET_X = 14;
// The map is wider than tall: a percent across counts this much less than a percent down.
const ASPECT = 0.7;
const EDGE = 8;

const PLACE_WORDS: Record<Role | SimPlayer["group"], string> = {
  goleiro: "o gol",
  lateral: "a lateral",
  zagueiro: "a zaga",
  meia: "o meio",
  atacante: "o ataque",
  GK: "o gol",
  DEF: "a defesa",
  MID: "o meio",
  ATT: "o ataque",
};

const NUMBER_WORDS = ["", "Uma", "Duas", "Três"];

/** "A", "A e B", "A, B e C". */
function listed(names: readonly string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
}

function pairsOf(ids: readonly string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < ids.length; i += 2) pairs.push([ids[i] ?? "", ids[i + 1] ?? ""]);
  return pairs;
}

function reasonLine(state: GameState, clubId: string, reason: ChemistryReason): ReasonLine {
  const name = (id: string) => state.players[id]?.name ?? id;
  const { kind, points } = reason;
  switch (reason.kind) {
    case "settled":
      return points > 0
        ? { kind, points, title: reason.steadyGames >= 2 ? `Mesmo time há ${reason.steadyGames} jogos` : "Time se firmando", detail: `${reason.kept} dos 11 titulares repetidos no último jogo` }
        : { kind, points, title: "Muitas trocas no time", detail: `só ${reason.kept} dos 11 titulares repetidos no último jogo` };
    case "captain": {
      const captain = state.players[reason.playerId];
      const apps = state.history.players[clubId]?.[reason.playerId]?.apps ?? 0;
      const detail = captain ? `${captain.name}, ${captain.age} anos, ${apps} ${apps === 1 ? "jogo" : "jogos"} pelo clube` : "";
      return { kind, points, title: points > 0 ? "Capitão respeitado" : "Capitão sem moral no grupo", detail };
    }
    case "newcomers":
      return { kind, points, title: reason.playerIds.length === 1 ? "Contratação recente no time" : "Contratações recentes no time", detail: listed(reason.playerIds.map(name)) };
    case "rivals": {
      const pairs = pairsOf(reason.playerIds);
      const count = NUMBER_WORDS[pairs.length] ?? String(pairs.length);
      return { kind, points, title: pairs.length === 1 ? "Uma disputa de vaga" : `${count} disputas de vaga`, detail: pairs.map(([a, b]) => `${name(a)} × ${name(b)}`).join(", ") };
    }
    case "fights":
      return { kind, points, title: "Briga no vestiário", detail: pairsOf(reason.playerIds).map(([a, b]) => listed([name(a), name(b)])).join(", ") };
    case "pairs":
      return { kind, points, title: "Duplas entrosadas", detail: pairsOf(reason.playerIds).slice(0, 2).map(([a, b]) => listed([name(a), name(b)])).join(", ") };
  }
}

function tagOf(state: GameState, link: ChemistryLink): string | null {
  if (link.kind === "fight") return "brigaram";
  if (link.kind !== "rival") return null;
  const starter = state.players[link.playerIds[0]];
  return starter ? `disputam ${PLACE_WORDS[starter.positions?.[0] ?? starter.group]}` : "disputam vaga";
}

const clamp = (value: number) => Math.min(100 - EDGE, Math.max(EDGE, value));

/** Where a reserve stands beside his starter: of the spots around him, the one furthest from every sticker already on the map. */
function freeSpotNear(spot: { x: number; y: number }, taken: readonly { x: number; y: number }[]): { x: number; y: number } {
  const around = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].flatMap((dy) => (dx || dy ? [{ x: clamp(spot.x + dx * RESERVE_OFFSET_X), y: clamp(spot.y + dy * RESERVE_OFFSET_Y) }] : [])));
  const room = (at: { x: number; y: number }) => Math.min(...taken.map((other) => Math.hypot((at.x - other.x) * ASPECT, at.y - other.y)));
  return around.reduce((best, at) => (room(at) > room(best) ? at : best));
}

/** The chemistry screen of the coach in the seat's club; null without a club. */
export function chemistryPage(state: GameState): ChemistryPage | null {
  const clubId = state.coachClubId;
  if (!clubId) return null;
  const chemistry = chemistryOf(state, clubId);
  const captainId = chemistry.captain?.playerId ?? null;
  const eleven = chemistry.eleven.flatMap((id) => state.players[id] ?? []);
  const slots = FORMATIONS[chemistry.formation];
  const spots = new Map<string, { x: number; y: number }>();
  arrange(eleven, chemistry.formation).forEach((player, s) => {
    const slot = slots[s];
    if (player && slot) spots.set(player.id, { x: slot.x, y: slot.y });
  });
  const sticker = (player: SimPlayer, x: number, y: number, isReserve: boolean): MapPlayer => ({
    id: player.id,
    name: player.name,
    strength: Math.round(player.strength),
    x,
    y,
    isReserve,
    isCaptain: player.id === captainId,
  });
  const players = eleven.flatMap((p) => {
    const spot = spots.get(p.id);
    return spot ? [sticker(p, spot.x, spot.y, false)] : [];
  });
  const placed = new Set(players.map((p) => p.id));
  for (const link of chemistry.links) {
    const [a, b] = link.playerIds;
    const [starterId, reserveId] = placed.has(a) ? [a, b] : [b, a];
    const spot = spots.get(starterId);
    const reserve = state.players[reserveId];
    if (!spot || !reserve || placed.has(reserveId)) continue;
    const free = freeSpotNear(spot, players);
    players.push(sticker(reserve, free.x, free.y, true));
    placed.add(reserveId);
  }
  const nameOf = (id: string) => state.players[id]?.name ?? id;
  return {
    clubId,
    value: chemistry.value,
    was: chemistry.was,
    effect: chemistryStrength(chemistry.value) - 1,
    formation: chemistry.formation,
    reasons: chemistry.reasons.map((reason) => reasonLine(state, clubId, reason)),
    players,
    links: chemistry.links.filter((link) => link.playerIds.every((id) => placed.has(id))).map((link) => ({ ...link, tag: tagOf(state, link) })),
    captain: chemistry.captain && { ...chemistry.captain, name: nameOf(chemistry.captain.playerId) },
    candidates: chemistry.candidates.map((c) => ({ ...c, name: nameOf(c.playerId) })),
  };
}
