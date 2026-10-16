import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import type { PendingEvent } from "@boleiro/engine/sim/events/eventMemory";
import type { EventAnswered } from "@boleiro/engine/sim/events/runEvents";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { formatBarDate, formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import type { HotSeatView } from "@boleiro/game-client/hub/hotSeat";
import type { InboxLine } from "@boleiro/game-client/hub/inboxLines";
import type { TurningPoint } from "@boleiro/game-client/hub/turningPoints";
import { useCommands } from "../app/AppCommands.js";
import { useGameClock } from "../app/gameClock.js";
import { useServices } from "../app/ServicesContext.js";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { clubFaceOf } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import { clubMeters, jobSecurity, leagueAbroadName, leagueStanding, nextMatch, type NextMatch } from "../hub/hubSelectors.js";
import { ConfidenceMeter } from "../finances/ConfidenceMeter.js";
import { EventNote } from "../events/EventNote.js";
import { EventPopUp } from "../events/EventPopUp.js";
import { playRoundLabel, usePlayRound } from "../hub/usePlayRound.js";
import { SQUAD_KEYS, squadRows } from "../squad/squadRows.js";
import { PlayerSticker } from "../squad/PlayerSticker.js";
import { SquadTable } from "../squad/SquadTable.js";
import "./hub.css";

const HUB_KEYS = [...SQUAD_KEYS, "boards", "coach", "mood", "finances"] as const;
type HubState = Pick<GameState, (typeof HUB_KEYS)[number]>;
type Loaded = { state: HubState; inbox: InboxLine[]; turningPoint: TurningPoint | null; seats: HotSeatView | null; event: PendingEvent | null };

const TURNING_POINT_SCREENS: Record<TurningPoint["kind"], string> = { fired: "/sacked", seasonEnd: "/season-end" };
const offersText = (count: number) => `${count} ${count === 1 ? "proposta" : "propostas"}`;

// The newspaper stays short: the newest lines only, everything else is on the other screens.
const INBOX_LINES = 7;

/** The features of the dock that have no screen yet, greyed out until their slices land. */
const LATER = [
  { label: "Patrocínio", icon: "handshake", title: "Patrocínios" },
  { label: "Auxiliar", icon: "user-switch", title: "Auxiliar técnico" },
  { label: "Entrosamento", icon: "users-three", title: "Entrosamento" },
] as const;

export function Hub() {
  const { engine, game: open } = useServices();
  const clock = useGameClock();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [missing, setMissing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPaperOpen, setPaperOpen] = useState(false);
  /** The event the coach opened, and his answer once it went through. */
  const [openEvent, setOpenEvent] = useState<PendingEvent | null>(null);
  const [answered, setAnswered] = useState<EventAnswered | null>(null);
  const [isAnswering, setAnswering] = useState(false);

  const load = useCallback(
    (isCurrent: () => boolean) =>
      Promise.all([engine.read(HUB_KEYS), engine.inbox(), engine.turningPoint(), engine.hotSeat(), engine.pendingEvent()]).then(
        ([state, inbox, turningPoint, seats, event]) => isCurrent() && setLoaded({ state, inbox, turningPoint, seats, event }),
        () => isCurrent() && setMissing(true),
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

  // A day that stops the coach early (a board answer, an offer) opens the paper on the news that stopped it.
  const seats = loaded?.seats ?? null;
  const round = usePlayRound(() =>
    void load(() => true).then(() => {
      clock.refresh();
      setPaperOpen(true);
    }),
  );
  const seated = seats?.coaches[seats.seated];
  // A hot-seat coach before the last one sets his eleven or passes; the last one plays the day for everyone.
  const passes = seats !== null && !seats.isLastTurn;
  const act = () => void round.play();
  const club = loaded?.state.coachClubId ? loaded.state.clubs[loaded.state.coachClubId] : undefined;
  useCommands({ jogarRodada: loaded !== null && !round.isPlaying && openEvent === null && act });

  async function answer(choice: number | null) {
    setAnswering(true);
    try {
      setAnswered(await engine.apply({ type: "answerEvent", choice }));
      await load(() => true);
    } finally {
      setAnswering(false);
    }
  }

  function closeEvent() {
    setOpenEvent(null);
    setAnswered(null);
  }

  if (missing || !open.current) {
    return (
      <div className="hub-missing">
        <h1 className="screen-title">Nenhum jogo aberto</h1>
        <p className="status">
          <Link to="/" className="btn-main">
            Voltar ao início
          </Link>
        </p>
      </div>
    );
  }
  if (!loaded) return <p className="status">Abrindo o jogo…</p>;
  if (loaded.turningPoint) return <Navigate to={TURNING_POINT_SCREENS[loaded.turningPoint.kind]} replace />;

  const { state, inbox } = loaded;
  const rows = squadRows(state);
  const next = nextMatch(state);
  const board = club ? state.boards[club.id] : undefined;
  const standing = leagueStanding(state);
  const offers = state.coach.offers.length;
  const security = jobSecurity(board);
  const meters = club ? clubMeters(state, club.id) : null;
  const news = inbox.slice(-INBOX_LINES).toReversed();
  const todaysNews = inbox.filter((line) => line.date === state.date).length;
  const strongest = rows.reduce<(typeof rows)[number] | null>((best, row) => (!best || row.strength > best.strength ? row : best), null);
  const shown = rows.find((row) => row.id === selectedId) ?? strongest;
  const shownId = shown?.id ?? null;

  return (
    <div className="hub fills-screen">
      <div className="hub-side">
        <section className="stk hub-club" aria-labelledby="hub-club-name">
          {club ? <Crest club={club} size={58} /> : <span className="hub-no-crest" aria-hidden="true" />}
          <div>
            <h1 id="hub-club-name">{club?.shortName ?? "Sem clube"}</h1>
            <p>
              Técnico <b>{seated?.name ?? open.current.coachName}</b>
              {seats && (
                <span className="hub-turn">
                  {" "}
                  · vez {seats.seated + 1} de {seats.coaches.length}
                </span>
              )}
              <br />
              {club?.division ? `Série ${club.division}` : club?.abroad ? leagueAbroadName(state) : club ? "Fora das séries" : offers === 0 ? "Nenhuma proposta na mesa." : `${offersText(offers)} na mesa.`}
              {standing && ` · ${standing.position}º lugar · ${standing.points} pts`}
            </p>
          </div>
          {club && offers > 0 && (
            <Link className="hub-offers" to="/offers">
              {offersText(offers)}
            </Link>
          )}
        </section>

        {club && (
          <section className="stk hub-money" aria-label="Caixa, diretoria e torcida">
            <div className="hub-cash">
              <span className="lbl">Caixa</span>
              <b>{formatMoney(state.finances[club.id]?.cash ?? 0)}</b>
            </div>
            {meters && (
              <>
                <ConfidenceMeter label="Diretoria" value={meters.board} detail={security} />
                <ConfidenceMeter label="Torcida" value={meters.fans} />
              </>
            )}
          </section>
        )}

        {club && (next ? <NextMatchSticker next={next} state={state} /> : <p className="stk hub-next hub-next-none">Nenhum jogo marcado.</p>)}

        {!club && offers > 0 ? (
          <div className="hub-actions">
            <button className="btn" onClick={act} disabled={round.isPlaying}>
              {passes ? "Passar a vez" : playRoundLabel(round.isPlaying, false)}
            </button>
            <Link className="btn y" to="/offers">
              Ver propostas
            </Link>
          </div>
        ) : (
          <button className="btn y hub-play" onClick={act} disabled={round.isPlaying} title="E">
            <i className={passes ? (seated?.playsToday ? "ph-bold ph-strategy" : "ph-bold ph-arrow-bend-up-right") : club ? "ph-bold ph-soccer-ball" : "ph-bold ph-hourglass-medium"} aria-hidden="true" />
            {passes ? (seated?.playsToday ? "Escalar e passar a vez" : "Passar a vez") : playRoundLabel(round.isPlaying, club !== undefined)}
          </button>
        )}
        {round.hasFailed && <p className="status error">A rodada não andou. Tente de novo.</p>}

        {club && loaded.event && selectedId === null ? (
          <EventNote key={`${loaded.event.typeId}:${loaded.event.date}`} event={loaded.event} onOpen={() => loaded.event && setOpenEvent(loaded.event)} />
        ) : club && shown ? (
          <PlayerSticker key={shown.id} state={state} row={shown} club={club} />
        ) : (
          <div className="slot hub-card-empty" />
        )}
        {club && openEvent && (
          <EventPopUp
            event={openEvent}
            club={club}
            rival={openEvent.rivalId ? (state.clubs[openEvent.rivalId] ?? null) : null}
            player={openEvent.playerId ? (state.players[openEvent.playerId] ?? null) : null}
            isBusy={isAnswering}
            answered={answered}
            onAnswer={(choice) => void answer(choice)}
            onClose={closeEvent}
          />
        )}

        <nav className="hub-dock" aria-label="Clube">
          {club ? (
            <Link to="/finances" className="hub-dock-item" title="Finanças">
              <i className="ph-bold ph-coins" aria-hidden="true" />
              Finanças
            </Link>
          ) : (
            <span className="hub-dock-item off" aria-disabled="true" title="Sem clube, sem finanças">
              <i className="ph-bold ph-coins" aria-hidden="true" />
              Finanças
            </span>
          )}
          {LATER.map(({ label, icon, title }) => (
            <span key={label} className="hub-dock-item off" aria-disabled="true" title={`${title} · em breve`}>
              <i className={`ph-bold ph-${icon}`} aria-hidden="true" />
              {label}
            </span>
          ))}
          <button className="hub-dock-item" aria-expanded={isPaperOpen} aria-controls="hub-paper" title="Jornal" onClick={() => setPaperOpen(!isPaperOpen)}>
            <i className="ph-bold ph-newspaper" aria-hidden="true" />
            Jornal
            {todaysNews > 0 && (
              <span className="hub-badge" aria-label={`${todaysNews} de hoje`}>
                {todaysNews}
              </span>
            )}
          </button>
          <span className="hub-count">
            <b>{rows.length}</b>
            <span>elenco</span>
          </span>
        </nav>
        {isPaperOpen && <Paper news={news} onClose={() => setPaperOpen(false)} />}
      </div>

      <section className="page hub-squad" aria-label="Elenco">
        {club ? <SquadTable rows={rows} clubName={club.shortName} selectedId={shownId} onSelect={setSelectedId} /> : <p className="hub-squad-none">Sem clube, sem elenco.</p>}
      </section>
    </div>
  );
}

function NextMatchSticker({ next, state }: { next: NextMatch; state: HubState }) {
  const opponent = clubFaceOf(state.clubs, next.opponentId);
  if (!opponent) return null;
  return (
    <section className="stk hub-next" aria-label="Próximo jogo">
      <div className="lbl">Próximo jogo</div>
      <div className="hub-next-match">
        <Crest club={opponent} size={34} />
        <div>
          <b>{opponent.shortName}</b>
          <p className={next.isToday ? "today" : undefined}>
            {next.isToday ? "Hoje" : formatBarDate(next.fixture.date)} · {next.isHome ? "em casa" : "fora"}
          </p>
          <p className="hub-next-what">{next.label}</p>
        </div>
      </div>
    </section>
  );
}

/** The round's paper: the newest lines of the inbox, pinned over the player's sticker. */
function Paper({ news, onClose }: { news: InboxLine[]; onClose: () => void }) {
  const title = useDialogFocus<HTMLHeadingElement>(true);
  return (
    <section
      id="hub-paper"
      className="note hub-paper"
      role="dialog"
      aria-labelledby="hub-paper-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <header>
        <h2 id="hub-paper-title" ref={title} tabIndex={-1}>
          Jornal
        </h2>
        <Link className="hub-paper-round" to="/newspaper">
          <i className="ph-bold ph-newspaper" aria-hidden="true" />
          Jornal da rodada
        </Link>
        <button className="hub-paper-close" aria-label="Fechar o jornal" onClick={onClose}>
          <i className="ph-bold ph-x" aria-hidden="true" />
        </button>
      </header>
      {news.length === 0 ? (
        <p className="hub-paper-empty">Nada de novo por enquanto.</p>
      ) : (
        <ul aria-label="Notícias">
          {news.map((line, index) => (
            <li key={`${line.date}-${index}`} className={line.tone}>
              <span>{formatDayMonth(line.date)}</span>
              {line.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
