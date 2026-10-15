import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { useServices } from "../app/ServicesContext.js";
import { Crest } from "../clubs/Crest.js";
import { PlayerSticker } from "../squad/PlayerSticker.js";
import { SQUAD_KEYS, squadRows } from "../squad/squadRows.js";
import { SquadTable } from "../squad/SquadTable.js";
import "./hub.css";
import "./club.css";

const FANS = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

type ClubState = Pick<GameState, (typeof SQUAD_KEYS)[number]>;

/**
 * Another club as the hub shows the coach's own: its panel on the left, its whole squad on the right.
 * A name opens the player's screen, where the coach makes his offer.
 */
export function Club() {
  const { clubId = "" } = useParams();
  const { engine } = useServices();
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<ClubState | null>(null);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    engine.read(SQUAD_KEYS).then(
      (read) => current && setState(read),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  // Opened from a list, it goes back there; opened on its own (a reload), to the market.
  const back = (
    <button className="btn club-back" onClick={() => (location.key !== "default" ? navigate(-1) : navigate("/market"))}>
      <i className="ph-bold ph-arrow-left" aria-hidden="true" />
      Voltar
    </button>
  );

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state) return <p className="status">Abrindo o clube…</p>;
  const club = state.clubs[clubId];
  if (!club) {
    return (
      <div className="club-missing">
        <p className="status">Clube não encontrado.</p>
        {back}
      </div>
    );
  }

  const rows = squadRows(state, club.id);
  const strongest = rows.reduce<(typeof rows)[number] | null>((best, row) => (!best || row.strength > best.strength ? row : best), null);
  const shown = rows.find((row) => row.id === selectedId) ?? strongest;
  const average = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.strength, 0) / rows.length) : 0;

  return (
    <div className="hub club fills-screen">
      <div className="hub-side">
        <section className="stk hub-club" aria-labelledby="club-name">
          <Crest club={club} size={58} />
          <div>
            <h1 id="club-name">{club.shortName}</h1>
            <p>
              {club.division ? `Série ${club.division}` : "Fora das séries"} · {club.state}
              <br />
              {club.stadium}
            </p>
          </div>
        </section>
        <dl className="stk club-facts">
          <div>
            <dt>Elenco</dt>
            <dd>{rows.length}</dd>
          </div>
          <div>
            <dt>Força média</dt>
            <dd>{average}</dd>
          </div>
          <div>
            <dt>Torcida</dt>
            <dd>{FANS.format(club.fanbase)}</dd>
          </div>
        </dl>
        {shown && <PlayerSticker state={state} row={shown} club={club} />}
        {back}
      </div>
      <section className="page hub-squad" aria-label="Elenco">
        {rows.length ? <SquadTable rows={rows} clubName={club.shortName} selectedId={shown?.id ?? null} onSelect={setSelectedId} /> : <p className="hub-squad-none">Sem jogadores no elenco.</p>}
      </section>
    </div>
  );
}
