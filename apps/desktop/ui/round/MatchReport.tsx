import type { GoalKind } from "@boleiro/engine/sim/live/goalDetails";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { LiveRound, Side } from "@boleiro/game-client/round/liveRoundOf";
import { Crest } from "../clubs/Crest.js";
import "./matchReport.css";

const KIND_LABELS: Record<GoalKind, string> = {
  openPlay: "Jogada",
  header: "Cabeça",
  penalty: "Pênalti",
  freeKick: "Falta",
  olympic: "Olímpico",
  ownGoal: "Contra",
};
// The album's position badge letters: G goleiro, Z zaga, M meio, A ataque.
const GROUP_LETTERS: Record<PositionGroup, string> = { GK: "G", DEF: "Z", MID: "M", ATT: "A" };
// guess: newspaper marks read 7.5 and up as a great match and under 5.5 as a poor one.
const GREAT = 7.5;
const POOR = 5.5;

const markClass = (rating: number) => (rating >= GREAT ? "mark great" : rating < POOR ? "mark poor" : "mark");

/** The coach's match after the final whistle: its goals, how each went in and who set it up, and every player's mark. */
export function MatchReport({ round }: { round: LiveRound }) {
  const match = round.matches.find((m) => m.fixtureId === round.coach?.fixtureId);
  const ratings = round.ratings;
  if (!match || !ratings) return null;
  const nameOf = (id: string) => round.names[id] ?? "Um jogador";
  const best = [...ratings.home, ...ratings.away].reduce((top, r) => (r.rating > top.rating ? r : top), { playerId: "", rating: -1 });
  const goals = match.events.flatMap((e) => (e.type === "goal" ? [e] : []));

  const side = (where: Side) => {
    const club = round.clubs[where === "home" ? match.homeId : match.awayId];
    const rows = [...ratings[where]].sort((a, b) => b.rating - a.rating);
    return (
      <section className={`rep-side ${where}`} aria-label={`Notas ${club?.shortName ?? ""}`}>
        <h3>
          {club && <Crest club={club} size={20} />}
          {club?.shortName}
        </h3>
        <ol>
          {rows.map((r, index) => (
              <li key={r.playerId} style={{ ["--i" as string]: index }} aria-label={`${nameOf(r.playerId)} ${r.rating.toFixed(1).replace(".", ",")}`}>
                <span className={markClass(r.rating)}>{r.rating.toFixed(1).replace(".", ",")}</span>
                <span className={`pos ${GROUP_LETTERS[r.group]}`}>{GROUP_LETTERS[r.group]}</span>
                <span className="nm">{nameOf(r.playerId)}</span>
                {r.playerId === best.playerId && (
                  <span className="star" title="Craque do jogo">
                    <i className="ph-fill ph-star" aria-hidden="true" />
                    Craque
                  </span>
                )}
              </li>
          ))}
        </ol>
      </section>
    );
  };

  return (
    <div className="rep" role="region" aria-label="Súmula do jogo">
      {side("home")}
      <section className="rep-goals" aria-label="Gols">
        <h3>Súmula</h3>
        {goals.length === 0 ? (
          <p className="rep-none">Sem gols.</p>
        ) : (
          <ol>
            {goals.map((goal, index) => {
              const isHome = goal.clubId === match.homeId;
              const kind = goal.kind ?? "openPlay";
              return (
                <li key={`${goal.minute}-${index}`} className={isHome ? "home" : "away"} style={{ ["--i" as string]: index }}>
                  <span className="mn">{goal.minute}'</span>
                  <i className="ph-fill ph-soccer-ball" aria-hidden="true" />
                  <span className="who">
                    <b>{nameOf(goal.playerId)}</b>
                    {goal.assistId && <small>passe de {nameOf(goal.assistId)}</small>}
                  </span>
                  <span className={`kind ${kind}`}>{KIND_LABELS[kind]}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      {side("away")}
    </div>
  );
}
