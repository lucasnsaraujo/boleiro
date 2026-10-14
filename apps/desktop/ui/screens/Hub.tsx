import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import type { Club } from "@boleiro/data/clubs";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { useServices } from "../app/ServicesContext.js";
import { ClubPlate } from "../clubs/ClubPlate.js";
import { Crest } from "../clubs/Crest.js";
import { formatDayMonth, formatGameDate, formatMatchDate } from "@boleiro/game-client/format/formatGameDate";
import { jobSecurity, nextMatch, type NextMatch } from "../hub/hubSelectors.js";
import type { InboxLine } from "@boleiro/game-client/hub/inboxLines";
import type { TurningPoint } from "@boleiro/game-client/hub/turningPoints";
import { playRoundLabel, usePlayRound } from "../hub/usePlayRound.js";
import type { CurrentGame } from "@boleiro/game-client/saves/currentGame";
import { saveToSlot } from "@boleiro/game-client/saves/saveToSlot";
import { slotLabel } from "@boleiro/game-client/saves/slotMeta";
import { boardGoal } from "@boleiro/game-client/screens/clubChoices";
import "./hub.css";

const HUB_KEYS = ["date", "coachClubId", "clubs", "fixtures", "competitions", "boards", "coach"] as const;
type HubState = Pick<GameState, (typeof HUB_KEYS)[number]>;
type Loaded = { state: HubState; inbox: InboxLine[]; turningPoint: TurningPoint | null };
type Saving = "idle" | "saving" | "saved" | "failed";

const TURNING_POINT_SCREENS: Record<TurningPoint["kind"], string> = { fired: "/sacked", seasonEnd: "/season-end" };
const offersText = (count: number) => `${count} ${count === 1 ? "proposta" : "propostas"}`;

// The inbox stays short: the newest lines only, everything else is on the other screens.
const INBOX_LINES = 7;

export function Hub() {
  const { engine, slots, game: open } = useServices();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState<Saving>("idle");

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

  const round = usePlayRound(() => void load(() => true));

  async function save(opened: CurrentGame) {
    setSaving("saving");
    try {
      await saveToSlot(engine, slots, opened.slotId, opened);
      setSaving("saved");
    } catch {
      setSaving("failed");
    }
  }

  const current = open.current;
  if (missing || !current) {
    return (
      <>
        <h1 className="screen-title">Nenhum jogo aberto</h1>
        <p className="status">
          <Link to="/" className="btn-main">
            Voltar ao início
          </Link>
        </p>
      </>
    );
  }
  if (!loaded) return <p className="status">Abrindo o jogo…</p>;
  if (loaded.turningPoint) return <Navigate to={TURNING_POINT_SCREENS[loaded.turningPoint.kind]} replace />;

  const { state, inbox } = loaded;
  const club = state.coachClubId ? state.clubs[state.coachClubId] : undefined;
  const next = nextMatch({ ...state });
  const board = club ? state.boards[club.id] : undefined;
  const offers = state.coach.offers.length;

  return (
    <div className="hub">
      <section className="hub-band">
        <div className="hub-club">
          {club && <Crest club={club} size={64} />}
          <div>
            <h1 className="screen-title">{club?.shortName ?? "Sem clube"}</h1>
            <p className="screen-sub">
              {formatGameDate(state.date)}
              {current.coachName && ` · ${current.coachName}`}
            </p>
          </div>
        </div>
        {club ? (
          next ? (
            <NextMatchPlates next={next} clubs={state.clubs} />
          ) : (
            <p className="hub-next-none">Nenhum jogo marcado.</p>
          )
        ) : (
          <p className="hub-next-none">{offers === 0 ? "Nenhuma proposta na mesa." : `${offersText(offers)} na mesa.`}</p>
        )}
        <div className="hub-foot">
          {club && club.division && (
            <dl className="hub-facts">
              <div>
                <dt>Cargo</dt>
                <dd>{jobSecurity(board)}</dd>
              </div>
              {board && (
                <div>
                  <dt>Meta</dt>
                  <dd>{boardGoal(board, club.division)}</dd>
                </div>
              )}
            </dl>
          )}
          <div className="hub-actions">
            {club && offers > 0 && (
              <Link className="btn-quiet" to="/offers">
                {offersText(offers)}
              </Link>
            )}
            <button className="btn-quiet" onClick={() => void save(current)} disabled={saving === "saving"}>
              Salvar jogo
            </button>
            <button className={club || offers === 0 ? "btn-main" : "btn-quiet"} onClick={() => void round.play()} disabled={round.isPlaying}>
              {playRoundLabel(round.isPlaying, club !== undefined)}
            </button>
            {!club && offers > 0 && (
              <Link className="btn-main" to="/offers">
                Ver propostas
              </Link>
            )}
          </div>
        </div>
        {saving === "saved" && <p className="status">Salvo em {slotLabel(current.slotId)}.</p>}
        {saving === "failed" && <p className="status error">Não deu para salvar.</p>}
        {round.hasFailed && <p className="status error">A rodada não andou. Tente de novo.</p>}
      </section>
      <section className="hub-inbox" aria-labelledby="inbox-title">
        <h2 id="inbox-title" className="hub-section-title">
          Notícias
        </h2>
        {inbox.length === 0 ? (
          <p className="status">Nada de novo por enquanto.</p>
        ) : (
          <ul className="inbox" aria-labelledby="inbox-title">
            {inbox
              .slice(-INBOX_LINES)
              .toReversed()
              .map((line, index) => (
                <li key={`${line.date}-${index}`} className={`inbox-row ${line.tone}`}>
                  <span className="inbox-date">{formatDayMonth(line.date)}</span>
                  <span className="inbox-text">{line.text}</span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NextMatchPlates({ next, clubs }: { next: NextMatch; clubs: Readonly<Record<string, Club>> }) {
  const home = clubs[next.fixture.homeId];
  const away = clubs[next.fixture.awayId];
  if (!home || !away) return null;
  return (
    <section className="hub-next" aria-label="Próximo jogo">
      <p className={next.isToday ? "hub-next-when today" : "hub-next-when"}>{next.isToday ? "Hoje" : formatMatchDate(next.fixture.date)}</p>
      <div className="hub-next-teams">
        <span className="hub-side home">
          <ClubPlate club={home} />
          <Crest club={home} size={46} />
        </span>
        <span className="hub-x">x</span>
        <span className="hub-side">
          <Crest club={away} size={46} />
          <ClubPlate club={away} />
        </span>
      </div>
      <p className="hub-next-what">
        <span>{next.label}</span> · {next.isHome ? "em casa" : "fora"}
      </p>
    </section>
  );
}
