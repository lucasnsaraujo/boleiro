import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { formatBarDate, formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import type { InboxLine } from "@boleiro/game-client/hub/inboxLines";
import type { TurningPoint } from "@boleiro/game-client/hub/turningPoints";
import { useCommands } from "../app/AppCommands.js";
import { useGameClock } from "../app/gameClock.js";
import { useServices } from "../app/ServicesContext.js";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { Crest } from "../clubs/Crest.js";
import { boardConfidence, jobSecurity, leagueStanding, nextMatch, type NextMatch } from "../hub/hubSelectors.js";
import { playRoundLabel, usePlayRound } from "../hub/usePlayRound.js";
import { SQUAD_KEYS, squadRows } from "../squad/squadRows.js";
import { PlayerSticker } from "../squad/PlayerSticker.js";
import { SquadTable } from "../squad/SquadTable.js";
import "./hub.css";

const HUB_KEYS = [...SQUAD_KEYS, "boards", "coach", "mood", "finances"] as const;
type HubState = Pick<GameState, (typeof HUB_KEYS)[number]>;
type Loaded = { state: HubState; inbox: InboxLine[]; turningPoint: TurningPoint | null };

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

  const load = useCallback(
    (isCurrent: () => boolean) =>
      Promise.all([engine.read(HUB_KEYS), engine.inbox(), engine.turningPoint()]).then(
        ([state, inbox, turningPoint]) => isCurrent() && setLoaded({ state, inbox, turningPoint }),
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
  const round = usePlayRound(() =>
    void load(() => true).then(() => {
      clock.refresh();
      setPaperOpen(true);
    }),
  );
  const club = loaded?.state.coachClubId ? loaded.state.clubs[loaded.state.coachClubId] : undefined;
  useCommands({ jogarRodada: loaded !== null && !round.isPlaying && (() => void round.play()) });

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
  const fans = club ? (state.mood[club.id]?.fans ?? 50) : 50;
  const security = jobSecurity(board);
  const confidence = boardConfidence(board);
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
              Técnico <b>{open.current.coachName}</b>
              <br />
              {club?.division ? `Série ${club.division}` : club ? "Fora das séries" : offers === 0 ? "Nenhuma proposta na mesa." : `${offersText(offers)} na mesa.`}
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
            <div>
              <div className="lbl">
                Diretoria · <span>{security}</span>
              </div>
              <div className={confidence < 0.2 ? "meter low" : confidence < 0.38 ? "meter mid" : "meter"}>
                <i style={{ width: `${Math.round(confidence * 100)}%` }} />
              </div>
            </div>
            <div>
              <div className="lbl">Torcida · {Math.round(fans)}%</div>
              <div className={fans < 30 ? "meter low" : fans < 45 ? "meter mid" : "meter"}>
                <i style={{ width: `${Math.round(fans)}%` }} />
              </div>
            </div>
          </section>
        )}

        {club && (next ? <NextMatchSticker next={next} state={state} /> : <p className="stk hub-next hub-next-none">Nenhum jogo marcado.</p>)}

        {!club && offers > 0 ? (
          <div className="hub-actions">
            <button className="btn" onClick={() => void round.play()} disabled={round.isPlaying}>
              {playRoundLabel(round.isPlaying, false)}
            </button>
            <Link className="btn y" to="/offers">
              Ver propostas
            </Link>
          </div>
        ) : (
          <button className="btn y hub-play" onClick={() => void round.play()} disabled={round.isPlaying} title="E">
            <i className={club ? "ph-bold ph-soccer-ball" : "ph-bold ph-hourglass-medium"} aria-hidden="true" />
            {playRoundLabel(round.isPlaying, club !== undefined)}
          </button>
        )}
        {round.hasFailed && <p className="status error">A rodada não andou. Tente de novo.</p>}

        {club && shown ? <PlayerSticker key={shown.id} state={state} row={shown} club={club} /> : <div className="slot hub-card-empty" />}

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
  const opponent = state.clubs[next.opponentId];
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
      aria-labelledby="hub-paper-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <header>
        <h2 id="hub-paper-title" ref={title} tabIndex={-1}>
          Jornal
        </h2>
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
