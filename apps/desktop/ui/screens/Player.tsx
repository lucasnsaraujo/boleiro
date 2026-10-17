import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import type { GameState } from "@boleiro/engine/sim/gameState";
import type { Retiring } from "@boleiro/engine/sim/players/retirement";
import type { CoachRequest } from "@boleiro/engine/sim/transfers/coachRequest";
import { Select } from "../controls/Select.js";
import { useServices } from "../app/ServicesContext.js";
import { ClubPlate } from "../clubs/ClubPlate.js";
import { Crest } from "../clubs/Crest.js";
import { formatGameDate } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import { POSITION_NAMES, TRAIT_LONG } from "../format/playerLabels.js";
import type { BoardDesk } from "@boleiro/game-client/market/boardDesk";
import { DEFAULT_RENEWAL_YEARS, requestOptions } from "@boleiro/game-client/market/coachRequests";
import { pendingText, requestTitle } from "../market/requestText.js";
import { playerCard, type PlayerCard } from "../squad/playerCard.js";
import { statusText } from "../squad/squadRows.js";
import { WatchToggle } from "../controls/WatchToggle.js";
import "./player.css";

const PLAYER_KEYS = ["date", "season", "coachClubId", "clubs", "players", "discipline", "competitions", "fixtures", "history", "market", "hasMidSeasonWindow", "coach"] as const;
type PlayerState = Pick<GameState, (typeof PLAYER_KEYS)[number]>;

/** "Série A 3 · Baiano 2" */
const byCompetition = (counts: readonly { competition: string; count: number }[]) => counts.map((c) => `${c.competition} ${c.count}`).join(" · ");

// A renewal runs one to five more seasons (the board caps contracts at five years).
const RENEWAL_YEARS = [1, 2, 3, 4, 5] as const;

const SPARK_WIDTH = 160;
const SPARK_HEIGHT = 44;

/** The strength line, scaled to its own range so a two-point drift still reads as a slope. */
function Sparkline({ values }: { values: readonly number[] }) {
  const low = Math.min(...values);
  const range = Math.max(...values) - low || 1;
  const points = values.map((v, i) => [(i / (values.length - 1)) * (SPARK_WIDTH - 8) + 4, SPARK_HEIGHT - 4 - ((v - low) / range) * (SPARK_HEIGHT - 8)] as const);
  const [lastX, lastY] = points.at(-1) ?? [0, 0];
  return (
    <svg className="player-spark" viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`} width={SPARK_WIDTH} height={SPARK_HEIGHT} aria-hidden="true">
      <polyline points={points.map(([x, y]) => `${x},${y}`).join(" ")} />
      <circle cx={lastX} cy={lastY} r={3.5} />
    </svg>
  );
}

function StrengthHistory({ marks }: { marks: PlayerCard["strengthBySeason"] }) {
  const values = marks.map((mark) => Math.round(mark.strength));
  return (
    <section className="player-history" aria-labelledby="history-title">
      <h2 id="history-title" className="player-facts-title">
        Força por temporada
      </h2>
      <div className="player-history-row">
        {values.length > 1 && <Sparkline values={values} />}
        <ol>
          {marks.map((mark, i) => {
            const value = values[i] ?? 0;
            const change = i > 0 ? value - (values[i - 1] ?? value) : 0;
            return (
              <li key={mark.season}>
                <span className="player-history-season">{mark.season}</span>
                <span className="player-history-n">{value}</span>
                {change !== 0 && <span className={`player-history-change ${change > 0 ? "up" : "down"}`}>{change > 0 ? `+${change}` : `−${-change}`}</span>}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export function Player() {
  const { playerId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { engine } = useServices();
  const [state, setState] = useState<PlayerState | null>(null);
  const [desk, setDesk] = useState<BoardDesk | null>(null);
  const [watchList, setWatchList] = useState<readonly string[]>([]);
  const [failed, setFailed] = useState(false);
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let current = true;
    Promise.all([engine.read(PLAYER_KEYS), engine.desk(), engine.scouting()]).then(
      ([read, onDesk, scouting]) => {
        if (!current) return;
        setState(read);
        setDesk(onDesk);
        setWatchList(scouting.watchList);
      },
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine, reads]);

  // The squad, the market and the tables all open players; a player opened straight from a link has no screen behind him.
  const hasScreenBehind = location.key !== "default";
  const back = (
    <button className="btn-quiet player-back" onClick={() => (hasScreenBehind ? navigate(-1) : navigate("/squad"))}>
      Voltar
    </button>
  );
  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state || !desk) return <p className="status">Abrindo o jogador…</p>;
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
  const isWatched = watchList.includes(card.id);
  const isLentByCoach = card.contract.loan?.fromClubId === state.coachClubId;
  const watch = () => void engine.apply({ type: "watchPlayer", playerId: card.id, isWatched: !isWatched }).then((scouting) => setWatchList(scouting.watchList));

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
        {!card.isCoachsPlayer && state.coachClubId && (
          <WatchToggle isWatched={isWatched} onToggle={watch} />
        )}
        {club && (
          <Link className="player-club" to={`/club/${club.id}`} aria-label={`Ver o elenco do ${club.shortName}`}>
            <Crest club={club} size={40} />
            <ClubPlate club={club} size="row" />
          </Link>
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
              <dt>Amarelos acumulados</dt>
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
                  pelo {lender?.shortName ?? card.contract.loan.fromClubId} até {formatGameDate(card.contract.loan.until)}
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
      <StrengthHistory marks={card.strengthBySeason} />
      {(card.isCoachsPlayer || isLentByCoach) && (
        <ContractActions
          state={state}
          playerId={card.id}
          name={card.name}
          desk={desk}
          onAsk={(request) => void engine.apply({ type: "ask", request }).then(setDesk)}
          onWithdraw={() => void engine.apply({ type: "withdraw", playerId: card.id }).then(setDesk)}
        />
      )}
      {card.isCoachsPlayer && (
        <RetirementActions
          name={card.name}
          retiring={state.players[card.id]?.retiring ?? null}
          onRetire={() => void engine.apply({ type: "retirePlayer", playerId: card.id }).then(() => navigate("/hub"))}
          onPersuade={() => engine.apply({ type: "persuadeToStay", playerId: card.id }).then((answer) => {
            setReads((n) => n + 1);
            return answer.stays;
          })}
        />
      )}
    </div>
  );
}

type RetirementProps = { name: string; retiring: Retiring | null; onRetire: () => void; onPersuade: () => Promise<boolean> };

/**
 * A player who announced his last season can be asked once to play one more year; any of the coach's
 * players can be retired now, after a confirm, since it can't be undone.
 */
function RetirementActions({ name, retiring, onRetire, onPersuade }: RetirementProps) {
  const [isConfirming, setConfirming] = useState(false);
  const [stays, setStays] = useState<boolean | null>(null);
  return (
    <section className="player-retire" aria-labelledby="retire-title">
      <h2 id="retire-title" className="player-facts-title">
        Fim de carreira
      </h2>
      {stays === true && <p className="player-retire-line is-good">{name} aceitou jogar mais um ano.</p>}
      {retiring && stays !== true && (
        <p className="player-retire-line">
          {name} anunciou que {retiring.afterSeason} será sua última temporada.
          {retiring.hasBeenAsked && " Você pediu mais um ano e ele não mudou de ideia."}
        </p>
      )}
      <div className="player-retire-acts">
        {retiring && !retiring.hasBeenAsked && stays === null && (
          <button className="btn-main" onClick={() => void onPersuade().then(setStays)}>
            Pedir mais um ano
          </button>
        )}
        <button className="btn-quiet" onClick={() => setConfirming(true)} aria-expanded={isConfirming}>
          Aposentar {name}
        </button>
        {isConfirming && (
          <div
            className="note player-retire-confirm"
            role="alertdialog"
            aria-labelledby="retire-confirm-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") setConfirming(false);
            }}
          >
            <p id="retire-confirm-title">Aposentar {name} agora? Ele deixa o elenco e não volta.</p>
            <button className="btn sm no" onClick={onRetire}>
              Aposentar
            </button>
            <button className="btn sm" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

type ActionsProps = {
  state: PlayerState;
  playerId: string;
  name: string;
  desk: BoardDesk;
  onAsk: (request: CoachRequest) => void;
  onWithdraw: () => void;
};

/** Renovar, Vender and Emprestar, or Chamar de volta for a player lent out, go to the board's desk; a request already there can be withdrawn. */
function ContractActions({ state, playerId, name, desk, onAsk, onWithdraw }: ActionsProps) {
  const [years, setYears] = useState<number>(DEFAULT_RENEWAL_YEARS);
  const pending = desk.pending.find((request) => request.playerId === playerId);
  if (pending) {
    return (
      <p className="player-pending">
        {requestTitle(pending, name)} na mesa. {pendingText(state, pending)}{" "}
        <button className="btn-quiet" onClick={onWithdraw}>
          Retirar
        </button>
      </p>
    );
  }
  const options = requestOptions(state, playerId, years);
  if (!options.length) return null;
  return (
    <div className="player-actions">
      {options.map((option) =>
        option.request.kind === "renew" ? (
          <span key={option.label} className="player-renew">
            <button className="btn-main" onClick={() => onAsk(option.request)}>
              {option.label}
            </button>
            <label>
              por
              <Select label="Anos" caption={null} value={String(years)} options={RENEWAL_YEARS.map((n) => ({ value: String(n), label: String(n) }))} onChange={(value) => setYears(Number(value))} />
              {years === 1 ? "ano" : "anos"}
            </label>
          </span>
        ) : (
          <button key={option.label} className="btn-quiet" onClick={() => onAsk(option.request)}>
            {option.label}
          </button>
        ),
      )}
    </div>
  );
}
