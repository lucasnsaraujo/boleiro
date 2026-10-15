import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { formatBarDate } from "@boleiro/game-client/format/formatGameDate";
import type { HotSeatView } from "@boleiro/game-client/hub/hotSeat";
import { useCommands } from "../app/AppCommands.js";
import { useServices } from "../app/ServicesContext.js";
import { clubFaceOf } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import { nextMatch } from "../hub/hubSelectors.js";
import "./turn.css";

const TURN_KEYS = ["date", "coachClubId", "fixtures", "competitions", "clubs"] as const;
type Loaded = { seats: HotSeatView; state: Pick<GameState, (typeof TURN_KEYS)[number]> } | "none";

/**
 * The hand-off between hot-seat coaches: a curtain over the last coach's screens, naming who sits next
 * and whether his club plays today. Only he opens his turn.
 */
export function Turn() {
  const { engine } = useServices();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    Promise.all([engine.hotSeat(), engine.read(TURN_KEYS)]).then(
      ([seats, state]) => current && setLoaded(seats ? { seats, state } : "none"),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  const begin = () => navigate("/hub");
  useCommands({ jogarRodada: loaded !== null && loaded !== "none" && begin });

  if (failed) {
    return (
      <div className="turn">
        <p className="status error">Nenhum jogo aberto.</p>
        <Link to="/" className="btn y">
          Voltar ao início
        </Link>
      </div>
    );
  }
  if (!loaded) return <p className="status">Passando a vez…</p>;
  if (loaded === "none") return <Navigate to="/hub" replace />;

  const { seats, state } = loaded;
  const coach = seats.coaches[seats.seated];
  const club = state.coachClubId ? clubFaceOf(state.clubs, state.coachClubId) : undefined;
  const next = nextMatch(state);
  const opponent = next ? clubFaceOf(state.clubs, next.opponentId) : undefined;

  return (
    <div className="turn" data-tauri-drag-region>
      <ol className="turn-order" aria-label="Ordem dos técnicos">
        {seats.coaches.map((other, index) => (
          <li key={index} className={index === seats.seated ? "on" : index < seats.seated ? "done" : undefined} aria-current={index === seats.seated ? "step" : undefined}>
            <span className="turn-order-no">{index < seats.seated ? <i className="ph-bold ph-check" aria-hidden="true" /> : index + 1}</span>
            {other.name}
          </li>
        ))}
      </ol>

      <section className="turn-card" aria-labelledby="turn-title">
        <div className="stk turn-crest">{club ? <Crest club={club} size={112} /> : <i className="ph-bold ph-briefcase" aria-hidden="true" />}</div>
        <p className="lbl turn-step">
          {seats.seated + 1}º de {seats.coaches.length} técnicos · {formatBarDate(state.date)}
        </p>
        <h1 id="turn-title" className="turn-title">
          Vez de {coach?.name}
        </h1>
        <p className="turn-club">
          {club ? club.shortName : "Sem clube"}
          {next && opponent && (
            <>
              {" · "}
              {next.isToday ? <b>Hoje tem jogo</b> : `Próximo jogo ${formatBarDate(next.fixture.date)}`}
              {` contra ${opponent.shortName}, ${next.isHome ? "em casa" : "fora"}`}
            </>
          )}
        </p>
        <button className="btn go lg turn-go" onClick={begin} autoFocus>
          Começar minha vez
          <i className="ph-fill ph-play" aria-hidden="true" />
        </button>
        <small className="turn-hint">Os outros técnicos não olham a tela.</small>
      </section>
    </div>
  );
}
