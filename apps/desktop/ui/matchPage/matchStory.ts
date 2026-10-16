import type { GoalKind } from "@boleiro/engine/sim/live/goalDetails";
import type { MatchView, PageEvent } from "@boleiro/game-client/matchPage/matchPageAt";
import type { MatchPage } from "@boleiro/game-client/matchPage/matchPageOf";
import type { Side } from "@boleiro/game-client/round/liveRoundOf";

const COUNT_WORDS: Record<number, string> = { 2: "dois", 3: "três", 4: "quatro", 5: "cinco", 6: "seis" };
const DECIDES: Partial<Record<GoalKind, string>> = { header: " de cabeça", penalty: " de pênalti", freeKick: " de falta", olympic: " de gol olímpico" };
const HOW: Partial<Record<GoalKind, string>> = { header: "de cabeça", penalty: "de pênalti", freeKick: "de falta", olympic: "num gol olímpico" };
const ROUT = 3;
const HAT_TRICK = 3;

const other = (side: Side): Side => (side === "home" ? "away" : "home");
const goalsOf = (view: MatchView) => view.events.filter((e) => e.kind === "goal");

/** The side that won, by the score or the shootout; null for a draw. */
function winnerOf(page: MatchPage, view: MatchView): Side | null {
  if (view.score.home !== view.score.away) return view.score.home > view.score.away ? "home" : "away";
  if (!page.penaltyWinnerId) return null;
  return page.penaltyWinnerId === page.home.club.id ? "home" : "away";
}

/** "no Maracanã", "na Arena da Baixada". */
const atStadium = (stadium: string) => `${/^arena\b/i.test(stadium) ? "na" : "no"} ${stadium}`;

/** The goal after which the winner led for good: the one that won the match. */
function winningGoal(view: MatchView, winner: Side): PageEvent | undefined {
  const goals = goalsOf(view);
  const loserGoals = goals.filter((g) => g.side !== winner).length;
  return goals.filter((g) => g.side === winner)[loserGoals];
}

/** The match's headline, written from what happened in it. */
export function headlineOf(page: MatchPage, view: MatchView): string {
  const club = (side: Side) => page[side].club.shortName;
  const name = (id: string) => page.names[id] ?? "Um jogador";
  if (!view.isOver) return `${club("home")} ${view.score.home} × ${view.score.away} ${club("away")}`;
  const tally = new Map<string, number>();
  for (const g of goalsOf(view)) if (g.goalKind !== "ownGoal") tally.set(g.playerId, (tally.get(g.playerId) ?? 0) + 1);
  const [topScorer, most] = [...tally].reduce<[string, number]>((best, entry) => (entry[1] > best[1] ? entry : best), ["", 0]);
  if (most >= HAT_TRICK) return `${name(topScorer)} faz ${COUNT_WORDS[most] ?? most}`;
  const winner = winnerOf(page, view);
  if (!winner) return view.score.home === 0 ? `${club("home")} e ${club("away")} ficam no 0 a 0` : `${club("home")} e ${club("away")} empatam em ${view.score.home} a ${view.score.away}`;
  if (view.score.home === view.score.away) return `${club(winner)} passa nos pênaltis`;
  const margin = Math.abs(view.score.home - view.score.away);
  const away = winner === "away" ? " fora de casa" : "";
  if (margin >= ROUT) return `${club(winner)} goleia ${club(other(winner))}${away}`;
  const decisive = winningGoal(view, winner);
  if (margin === 1 && decisive && decisive.goalKind !== "ownGoal") return `${name(decisive.playerId)} decide${DECIDES[decisive.goalKind ?? "openPlay"] ?? ""}`;
  return `${club(winner)} vence ${club(other(winner))}${away}`;
}

/** What each goal did to the score, as the report tells it. */
function goalVerb(before: { own: number; other: number }, isWinner: boolean): string {
  if (before.own === 0 && before.other === 0) return "abriu o placar";
  if (before.own + 1 === before.other) return "empatou";
  if (before.own === before.other) return isWinner ? "fez o gol da vitória" : "desempatou";
  if (before.own > before.other) return "ampliou";
  return "diminuiu";
}

/** The report under the headline: the result with where it left the table, then each goal in order. */
export function reportOf(page: MatchPage, view: MatchView): string[] {
  const club = (side: Side) => page[side].club.shortName;
  const name = (id: string) => page.names[id] ?? "Um jogador";
  const where = page.venue.stadium ? ` ${atStadium(page.venue.stadium)}` : "";
  const winner = winnerOf(page, view);
  let lead: string;
  if (!view.isOver) lead = `${club("home")} e ${club("away")} estão em campo${where}: ${view.score.home} a ${view.score.away} aos ${view.minute}'.`;
  else if (!winner || view.score.home === view.score.away) {
    const draw = view.score.home === 0 ? `ficam no 0 a 0${where}` : `empatam em ${view.score.home} a ${view.score.away}${where}`;
    lead = `${club("home")} e ${club("away")} ${draw}${winner ? `, e ${club(winner)} passa nos pênaltis` : ""}.`;
  } else {
    const [own, against] = winner === "home" ? [view.score.home, view.score.away] : [view.score.away, view.score.home];
    const place = page[winner].place;
    const climb = place?.after && place.after < place.before ? ` e sobe do ${place.before}º para o ${place.after}º lugar` : "";
    lead = `${club(winner)} vence ${club(other(winner))} por ${own} a ${against}${where}${climb}.`;
  }
  const score = { home: 0, away: 0 };
  const decisive = winner && view.isOver ? winningGoal(view, winner) : undefined;
  const lines = goalsOf(view).map((g) => {
    const before = { own: score[g.side], other: score[other(g.side)] };
    score[g.side]++;
    if (g.goalKind === "ownGoal") return `${name(g.playerId)} marcou contra aos ${g.minute}'.`;
    const how = [HOW[g.goalKind ?? "openPlay"], g.otherId ? `depois de passe de ${name(g.otherId)}` : undefined].filter(Boolean);
    return `${name(g.playerId)} ${goalVerb(before, g === decisive)} aos ${g.minute}'${how.length ? `, ${how.join(", ")}` : ""}.`;
  });
  return lines.length ? [lead, lines.join(" ")] : [lead];
}
