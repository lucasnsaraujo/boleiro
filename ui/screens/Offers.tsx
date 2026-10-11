import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { GameState } from "../../src/sim/gameState.js";
import { useServices } from "../app/ServicesContext.js";
import { offerRows, type OfferRow } from "../career/offerRows.js";
import { ClubPlate } from "../clubs/ClubPlate.js";
import { Crest } from "../clubs/Crest.js";
import { formatGameDate } from "../format/formatGameDate.js";
import { formatMoney } from "../format/formatMoney.js";
import { isCoachMatchDay } from "../hub/playToMatchDay.js";
import { usePlayRound } from "../hub/usePlayRound.js";
import "./career.css";

const OFFERS_KEYS = ["date", "coachClubId", "coach", "clubs", "fixtures"] as const;
type OffersState = Pick<GameState, (typeof OFFERS_KEYS)[number]>;
type Loaded = { state: OffersState; isRoundUnderWay: boolean };

const daysLeftText = (days: number) => (days <= 1 ? "responder hoje" : `${days} dias para responder`);

/** The job offers on the table: sign with one, turn one down, or wait for others. */
export function Offers() {
  const { engine } = useServices();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [isAnswering, setAnswering] = useState(false);
  const [hasAnswerFailed, setAnswerFailed] = useState(false);

  const load = useCallback(
    (isCurrent: () => boolean = () => true) =>
      Promise.all([engine.read(OFFERS_KEYS), engine.liveRound()]).then(
        ([state, live]) => isCurrent() && setLoaded({ state, isRoundUnderWay: live !== null }),
        () => isCurrent() && setFailed(true),
      ),
    [engine],
  );

  useEffect(() => {
    let current = true;
    void load(() => current);
    return () => {
      current = false;
    };
  }, [load]);

  const wait = usePlayRound(() => navigate("/hub"));

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!loaded) return <p className="status">Abrindo as propostas…</p>;

  const { state } = loaded;
  // Answering is a day's decision: on his match day signing would play his game without him,
  // and during a live round the full-time result would overwrite a decline.
  const mustPlayFirst = loaded.isRoundUnderWay || isCoachMatchDay(state);

  const club = state.coachClubId ? state.clubs[state.coachClubId] : undefined;
  const rows = offerRows(state);
  const picked = rows.find((row) => row.clubId === pickedId) ?? rows[0];
  const pickedClub = picked && state.clubs[picked.clubId];

  async function answer(run: () => Promise<unknown>, after: () => void) {
    setAnswering(true);
    setAnswerFailed(false);
    try {
      await run();
      after();
    } catch {
      setAnswerFailed(true);
    } finally {
      setAnswering(false);
    }
  }

  const sign = (clubId: string) => answer(() => engine.advance([{ acceptOffer: clubId }]), () => navigate("/hub"));
  const decline = (clubId: string) =>
    answer(
      () => engine.declineOffer(clubId),
      () => {
        setPickedId(null);
        void load();
      },
    );

  const waitButton = (className: string) => (
    <button className={className} onClick={() => void wait.play()} disabled={wait.isPlaying || isAnswering}>
      {wait.isPlaying ? "Esperando…" : "Esperar propostas"}
    </button>
  );

  return (
    <div className="career-offers">
      <header className="career-head">
        <h1 className="screen-title">Propostas</h1>
        <p className="screen-sub">
          {club ? club.shortName : "Sem clube"} · {formatGameDate(state.date)}
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="career-empty">Nenhuma proposta na mesa.</p>
      ) : (
        <ul className="career-offer-list" aria-label="Propostas">
          {rows.map((row) => (
            <OfferLine key={row.clubId} row={row} state={state} isPicked={row.clubId === picked?.clubId} onPick={() => setPickedId(row.clubId)} />
          ))}
        </ul>
      )}
      <footer className="career-actions">
        {picked && pickedClub && (
          <button className="btn-quiet" onClick={() => void decline(picked.clubId)} disabled={isAnswering || wait.isPlaying || mustPlayFirst}>
            Recusar {pickedClub.shortName}
          </button>
        )}
        {club ? (
          <Link className={picked ? "btn-quiet" : "btn-main"} to="/hub">
            Voltar ao clube
          </Link>
        ) : (
          waitButton(picked ? "btn-quiet" : "btn-main")
        )}
        {picked && pickedClub && (
          <button className="btn-main" onClick={() => void sign(picked.clubId)} disabled={isAnswering || wait.isPlaying || mustPlayFirst}>
            Assinar com {pickedClub.shortName}
          </button>
        )}
      </footer>
      {picked && mustPlayFirst && <p className="career-note">Assine depois do jogo.</p>}
      {hasAnswerFailed && <p className="status error">A resposta não chegou ao clube. Tente de novo.</p>}
      {wait.hasFailed && <p className="status error">Os dias não andaram. Tente de novo.</p>}
    </div>
  );
}

function OfferLine({ row, state, isPicked, onPick }: { row: OfferRow; state: OffersState; isPicked: boolean; onPick: () => void }) {
  const club = state.clubs[row.clubId];
  if (!club) return null;
  return (
    <li>
      <button className="career-offer" aria-pressed={isPicked} onClick={onPick}>
        <Crest club={club} size={40} />
        <span className="career-offer-club">
          <ClubPlate club={club} size="row" />
          <span className="career-offer-division">{row.division ? `Série ${row.division}` : "Estadual"}</span>
        </span>
        <span className="career-offer-salary">
          {formatMoney(row.salary)}
          <small>por mês até {row.untilSeason}</small>
        </span>
        <span className={row.daysLeft <= 3 ? "career-offer-days is-urgent" : "career-offer-days"}>{daysLeftText(row.daysLeft)}</span>
      </button>
    </li>
  );
}
