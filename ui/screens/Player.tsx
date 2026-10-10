import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { GameState } from "../../src/sim/gameState.js";
import { useServices } from "../app/ServicesContext.js";
import { ClubPlate } from "../clubs/ClubPlate.js";
import { Crest } from "../clubs/Crest.js";
import { formatDayMonth, formatGameDate } from "../format/formatGameDate.js";
import { formatMoney } from "../format/formatMoney.js";
import { POSITION_NAMES, TRAIT_LONG } from "../format/playerLabels.js";
import { playerCard } from "../squad/playerCard.js";
import { statusText } from "../squad/squadRows.js";
import "./player.css";

const PLAYER_KEYS = ["date", "coachClubId", "clubs", "players", "discipline", "competitions", "history", "market"] as const;
type PlayerState = Pick<GameState, (typeof PLAYER_KEYS)[number]>;

/** "Série A 3 · Baiano 2" */
const byCompetition = (counts: readonly { competition: string; count: number }[]) => counts.map((c) => `${c.competition} ${c.count}`).join(" · ");

export function Player() {
  const { playerId = "" } = useParams();
  const { engine } = useServices();
  const [state, setState] = useState<PlayerState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    engine.read(PLAYER_KEYS).then(
      (read) => current && setState(read),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  const back = (
    <Link to="/squad" className="btn-quiet player-back">
      Voltar ao elenco
    </Link>
  );
  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state) return <p className="status">Abrindo o jogador…</p>;
  const card = playerCard(state, playerId);
  if (!card) {
    return (
      <>
        <p className="status">Jogador não encontrado.</p>
        {back}
      </>
    );
  }

  const club = state.clubs[card.clubId];
  const lender = card.contract.loan ? state.clubs[card.contract.loan.fromClubId] : undefined;
  const nextClub = card.contract.leavesForId ? state.clubs[card.contract.leavesForId] : undefined;
  const goals = card.season.goals.reduce((sum, g) => sum + g.goals, 0);
  const status = statusText(card.status);

  return (
    <div className="player">
      {back}
      <section className="player-band">
        <p className="player-strength" aria-label={`Força ${Math.round(card.strength)}`}>
          <span className="player-strength-n">{Math.round(card.strength)}</span>
          <span className="player-strength-l">Força</span>
        </p>
        <div className="player-who">
          <h1 className="screen-title">{card.name}</h1>
          <p className="screen-sub">
            {POSITION_NAMES[card.group]} · {card.age} anos{card.trait && ` · ${TRAIT_LONG[card.trait]}`}
          </p>
          {status && <p className={`player-status ${card.status?.kind ?? ""}`}>{status}</p>}
        </div>
        {club && (
          <div className="player-club">
            <Crest club={club} size={40} />
            <ClubPlate club={club} size="row" />
          </div>
        )}
      </section>
      <div className="player-facts">
        <section aria-labelledby="season-title">
          <h2 id="season-title" className="player-facts-title">
            Temporada
          </h2>
          <dl>
            <div>
              <dt>Gols</dt>
              <dd>
                {goals}
                {card.season.goals.length > 1 && (
                  <small>{byCompetition(card.season.goals.map((g) => ({ competition: g.competition, count: g.goals })))}</small>
                )}
              </dd>
            </div>
            <div>
              <dt>Minutos</dt>
              <dd>{card.season.minutes}</dd>
            </div>
            <div>
              <dt>Amarelos</dt>
              <dd>
                {card.season.yellows.length === 0 ? "0" : byCompetition(card.season.yellows.map((y) => ({ competition: y.competition, count: y.yellows })))}
              </dd>
            </div>
          </dl>
        </section>
        {club && (
          <section aria-labelledby="club-title">
            <h2 id="club-title" className="player-facts-title">
              Pelo {club.shortName}
            </h2>
            <dl>
              <div>
                <dt>Jogos</dt>
                <dd>{card.atClub.apps}</dd>
              </div>
              <div>
                <dt>Gols</dt>
                <dd>{card.atClub.goals}</dd>
              </div>
            </dl>
          </section>
        )}
        <section aria-labelledby="contract-title">
          <h2 id="contract-title" className="player-facts-title">
            Contrato
          </h2>
          <dl>
            <div>
              <dt>Até</dt>
              <dd>{formatGameDate(card.contract.until)}</dd>
            </div>
            <div>
              <dt>Salário</dt>
              <dd>{formatMoney(card.contract.wage)} por mês</dd>
            </div>
            {card.contract.loan && (
              <div>
                <dt>Emprestado</dt>
                <dd>
                  pelo {lender?.shortName ?? card.contract.loan.fromClubId} até {formatDayMonth(card.contract.loan.until)}
                </dd>
              </div>
            )}
            {card.contract.leavesForId && (
              <div>
                <dt>Pré-contrato</dt>
                <dd>{nextClub?.shortName ?? card.contract.leavesForId}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>
      {card.isCoachsPlayer && (
        <div className="player-actions">
          <button className="btn-main" disabled>
            Renovar
          </button>
          <button className="btn-quiet" disabled>
            Vender
          </button>
          <button className="btn-quiet" disabled>
            Emprestar
          </button>
        </div>
      )}
    </div>
  );
}
