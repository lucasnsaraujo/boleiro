import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";
import type { Club } from "@boleiro/data/clubs";
import { FULL_TIME, HALF_TIME } from "@boleiro/engine/sim/live/matchTimeline";
import { useCommands } from "../app/AppCommands.js";
import { useServices } from "../app/ServicesContext.js";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { plateColours } from "../clubs/clubCatalog.js";
import { clubFaceOf } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import type { AdvanceResult } from "@boleiro/game-client/engine/createEngineSession";
import type { HotSeatView } from "@boleiro/game-client/hub/hotSeat";
import { formatBarDate } from "@boleiro/game-client/format/formatGameDate";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import { useFlip } from "../motion/useFlip.js";
import { LineupSheet } from "../round/LineupSheet.js";
import { kickOffOf, liveChangeOf, liveLimits, type Sheet } from "../round/lineupDraft.js";
import type { LiveRound, RoundClub, Side } from "@boleiro/game-client/round/liveRoundOf";
import { liveTable, shortTable, type LiveTableRow } from "../round/liveTable.js";
import type { MatchDayPlan } from "@boleiro/game-client/round/matchDayPlan";
import { goalsBetween, pauseReason, roundAt, scorersUntil, type EventKind, type MatchAt } from "../round/roundAt.js";
import { crowdLevel, roundCues, thinCues } from "../sound/roundCues.js";
import { useSound } from "../sound/SoundProvider.js";
import copaDoBrasil from "../../../../design/mocks/img/competitions/copa-do-brasil.svg";
import serieA from "../../../../design/mocks/img/competitions/serie-a.svg";
import serieB from "../../../../design/mocks/img/competitions/serie-b.svg";
import "./round.css";

type Speed = 0 | 1 | 2 | 4;
type Running = Exclude<Speed, 0>;
const SPEEDS: readonly Running[] = [1, 2, 4];
// guess: Brasfoot's normal speed plays a match in about a minute; 4x gets a round done in ten seconds.
const MS_PER_MINUTE: Record<Running, number> = { 1: 660, 2: 330, 4: 110 };
// A goal floods its row for less time when the clock runs faster, so goals a few minutes apart don't pile up.
const FLOOD_MS: Record<Running, number> = { 1: 1500, 2: 1150, 4: 800 };
// How long the scoring side's score box flashes; at 2x and 4x it outlasts the row's flood.
const BOX_FLASH_MS = 1300;
const COMPETITION_LOGOS = [
  { prefix: "Série A", src: serieA },
  { prefix: "Série B", src: serieB },
  { prefix: "Copa do Brasil", src: copaDoBrasil },
] as const;
// The slip of the table on the cover: the coach's club between its neighbours.
const TABLE_CARD_ROWS = 3;
const EXPO_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const NO_COLOURS = { primary: "#eef3e8", secondary: "#0a1a10" };
/** The crowd quietens while the clock stands still: half-time, a pause, a sheet open. */
const PAUSED_CROWD = 0.6;

type PreMatch = { plan: MatchDayPlan; clubs: Readonly<Record<string, Club>>; date: string };
/** A goal being celebrated on a row: the scoring club's colour, its side, and the round's goal count so each goal replays the animation. */
type Flash = { colour: string; side: Side; count: number };

export function Round() {
  const { engine } = useServices();
  const { engine: sound } = useSound();
  const navigate = useNavigate();
  const [preMatch, setPreMatch] = useState<PreMatch | null>(null);
  const [round, setRound] = useState<LiveRound | null>(null);
  const [failure, setFailure] = useState<"noMatch" | "unreachable" | null>(null);
  const [hotSeat, setHotSeat] = useState<HotSeatView | null>(null);
  const [minute, setMinute] = useState(0);
  const [speed, setSpeed] = useState<Speed>(0);
  const resumeSpeed = useRef<Running>(1);
  const wasRunning = useRef(false);
  const [isLineupOpen, setLineupOpen] = useState(false);
  const [isTableOpen, setTableOpen] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdvanceResult | null>(null);
  const [isOnlyMine, setOnlyMine] = useState(false);
  const [flashes, setFlashes] = useState<Record<string, Flash>>({});
  const [golCount, setGolCount] = useState(0);
  const goalsCelebrated = useRef(0);
  const roundRef = useRef(round);
  const shownMinute = useRef(0);
  const isFinishing = useRef(false);

  useEffect(() => {
    roundRef.current = round;
  }, [round]);

  useEffect(() => {
    let isCurrent = true;
    async function open() {
      const live = await engine.liveRound();
      if (live) {
        const at = Math.max(live.seenMinute, live.coach?.lastChangeMinute ?? 0);
        if (!isCurrent) return;
        shownMinute.current = at;
        roundRef.current = live;
        setRound(live);
        setMinute(at);
        // Back after a final whistle that didn't go through: no new minute will call it again.
        if (at >= FULL_TIME) void finish();
        return;
      }
      const seats = await engine.hotSeat();
      if (!isCurrent) return;
      setHotSeat(seats);
      // In a hot-seat game the last coach may have no match today while the others do: their round starts at once.
      if (seats?.isLastTurn && !seats.coaches[seats.seated]?.playsToday) {
        const started = await engine.apply({ type: "startRound" });
        if (!isCurrent) return;
        roundRef.current = started;
        setRound(started);
        setSpeed(resumeSpeed.current);
        return;
      }
      const [plan, { clubs, date }] = await Promise.all([engine.matchDayPlan(), engine.read(["clubs", "date"])]);
      if (isCurrent) setPreMatch({ plan, clubs, date });
    }
    open().catch((error: unknown) => {
      const hasNoMatch = error instanceof Error && error.message.includes("no match today");
      if (isCurrent) setFailure(hasNoMatch ? "noMatch" : "unreachable");
    });
    return () => {
      isCurrent = false;
    };
  }, [engine]);

  const isRunning = round !== null && speed > 0 && !isLineupOpen && !isTableOpen && minute < FULL_TIME;
  useEffect(() => {
    if (!isRunning || speed === 0) return;
    const tick = setInterval(() => setMinute((m) => Math.min(FULL_TIME, m + 1)), MS_PER_MINUTE[speed]);
    return () => clearInterval(tick);
  }, [isRunning, speed]);

  function pause() {
    setSpeed((current) => {
      if (current !== 0) resumeSpeed.current = current;
      return 0;
    });
  }

  async function finish() {
    if (isFinishing.current) return;
    isFinishing.current = true;
    setError(null);
    try {
      setResult(await engine.apply({ type: "finishRound" }));
    } catch {
      isFinishing.current = false;
      setError("Não deu para encerrar a rodada.");
    }
  }

  // Each new minute celebrates its goals, then stops the round when the minute calls for it. The
  // minute alone drives this: the new round a live change brings must not replay its minute.
  useEffect(() => {
    const live = roundRef.current;
    const from = shownMinute.current;
    if (!live || minute <= from) return;
    shownMinute.current = minute;
    engine.apply({ type: "seeMinute", minute }).catch(() => undefined);
    for (const cue of thinCues(roundCues(live, from, minute), resumeSpeed.current)) sound.play(cue);
    const goals = goalsBetween(live, from, minute);
    if (goals.length) {
      const celebrated = Object.fromEntries(
        goals.map((goal) => {
          const colour = live.clubs[goal.clubId]?.colours.primary ?? NO_COLOURS.primary;
          return [goal.fixtureId, { colour, side: goal.side, count: ++goalsCelebrated.current }];
        }),
      );
      setFlashes((current) => ({ ...current, ...celebrated }));
      // Once played, a flash leaves its row: a row Só meus jogos hid and shows again would otherwise replay it.
      setTimeout(
        () => setFlashes((current) => Object.fromEntries(Object.entries(current).filter(([fixtureId, flash]) => celebrated[fixtureId] !== flash))),
        Math.max(FLOOD_MS[resumeSpeed.current], BOX_FLASH_MS),
      );
      if (goals.some((goal) => goal.fixtureId === live.coach?.fixtureId && goal.clubId === live.coachClubId)) setGolCount((n) => n + 1);
    }
    const reason = pauseReason(live, minute);
    if (reason === "halfTime" || reason === "coachMatch") pause();
    if (reason === "fullTime") void finish();
  }, [minute]);

  async function kickOff(sheet: Sheet) {
    if (!preMatch) return;
    setBusy(true);
    setError(null);
    try {
      const chosen = kickOffOf(sheet, preMatch.plan.lineup, preMatch.plan.tactics);
      if (hotSeat && !hotSeat.isLastTurn) {
        await engine.apply({ type: "passTurn", ...chosen });
        navigate("/turn");
        return;
      }
      const live = await engine.apply({ type: "startRound", ...chosen });
      shownMinute.current = 0;
      roundRef.current = live;
      setRound(live);
      setPreMatch(null);
      setMinute(0);
      setSpeed(resumeSpeed.current);
    } catch {
      setError("Não deu para começar a rodada. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  /** Opening a sheet stops the clock; closing it starts the clock again only if it was running. */
  function openSheet(open: (isOpen: boolean) => void) {
    wasRunning.current = speed !== 0;
    pause();
    setError(null);
    open(true);
  }

  function resumeIfRunning() {
    if (wasRunning.current) setSpeed(resumeSpeed.current);
  }

  function closeTable() {
    setTableOpen(false);
    resumeIfRunning();
  }

  async function backToMatch(sheet: Sheet) {
    const tactics = round?.coach?.tactics;
    const change = tactics ? liveChangeOf(sheet, tactics) : null;
    if (change) {
      setBusy(true);
      try {
        const changed = await engine.apply({ type: "changeLive", minute, change });
        roundRef.current = changed;
        setRound(changed);
      } catch {
        setError("A troca não valeu. Tente de novo.");
        return;
      } finally {
        setBusy(false);
      }
    }
    setLineupOpen(false);
    resumeIfRunning();
  }

  function chooseSpeed(next: Speed) {
    if (next !== 0) resumeSpeed.current = next;
    setSpeed(next);
  }

  // The match keys work only while the match can still be driven: kicked off, before the final whistle, no sheet open.
  const isDrivable = round !== null && result === null && minute < FULL_TIME && !isLineupOpen && !isTableOpen;
  useCommands({
    pausar: isDrivable && (() => chooseSpeed(speed === 0 ? resumeSpeed.current : 0)),
    velocidade1: isDrivable && (() => chooseSpeed(1)),
    velocidade2: isDrivable && (() => chooseSpeed(2)),
    velocidade3: isDrivable && (() => chooseSpeed(4)),
    tabelaAoVivo: isDrivable && round.table !== null && (() => openSheet(setTableOpen)),
  });

  const crowd = round && result === null && minute < FULL_TIME ? crowdLevel(round, minute) * (isRunning ? 1 : PAUSED_CROWD) : null;
  useEffect(() => sound.setCrowd(crowd), [sound, crowd]);
  useEffect(() => () => sound.setCrowd(null), [sound]);

  useEffect(() => {
    if (!isTableOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && closeTable();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (failure) {
    return (
      <div className="live-missing">
        <h1 className="screen-title">{failure === "noMatch" ? "Nenhum jogo hoje" : "Rodada"}</h1>
        {failure === "unreachable" && <p className="status error">Não deu para abrir a rodada.</p>}
        <p className="status">
          <Link to="/hub" className="btn y">
            Voltar ao clube
          </Link>
        </p>
      </div>
    );
  }

  if (preMatch) {
    const { plan, clubs } = preMatch;
    const vs = `${clubFaceOf(clubs, plan.homeId)?.shortName ?? ""} x ${clubFaceOf(clubs, plan.awayId)?.shortName ?? ""}`;
    const opponent = clubFaceOf(clubs, plan.homeId === plan.clubId ? plan.awayId : plan.homeId);
    return (
      <LineupSheet
        sub={`${vs} · ${plan.label}`}
        squad={plan.squad}
        lineup={plan.lineup}
        tactics={plan.tactics}
        mode={{ kind: "preMatch" }}
        doneLabel={hotSeat && !hotSeat.isLastTurn ? "Confirmar e passar a vez" : "Começar a rodada"}
        isBusy={isBusy}
        error={error}
        onDone={(sheet) => void kickOff(sheet)}
        onLeave={() => navigate("/hub")}
        onPickTeam={async (formation) => (await engine.matchDayPlan(formation)).lineup}
        {...(opponent ? { opponent: { club: opponent, formation: plan.opponentFormation } } : {})}
      />
    );
  }

  if (!round) return <p className="status live-missing">Abrindo a rodada…</p>;

  const matches = roundAt(round, minute);
  const mine = matches.find((m) => m.isCoach);
  const scores = new Map(matches.map((m) => [m.fixtureId, m.score]));
  const table = round.table && liveTable(round.table, scores);
  const coach = round.coach;
  const coachMatch = round.matches.find((m) => m.fixtureId === coach?.fixtureId);
  const limits = coach && coachMatch && round.coachClubId ? liveLimits(coach, coachMatch.events, round.coachClubId, minute) : null;
  const isFinished = result !== null;
  // After a hot-seat round the first coach in turn order takes the seat again, behind the hand-off screen.
  const afterRound = hotSeat ? "/turn" : "/hub";
  // Rows Só meus jogos leaves out are hidden, not dropped, so they keep their state while out of sight.
  const groups = round.competitions
    .map((competition) => ({ ...competition, rows: matches.filter((m) => m.competitionId === competition.id) }))
    .filter((group) => group.rows.length > 0);

  return (
    <div className="live fills-screen" style={{ ["--flood" as string]: `${FLOOD_MS[resumeSpeed.current]}ms`, ["--box-flash" as string]: `${BOX_FLASH_MS}ms` }}>
      {mine ? (
        <Cover
          round={round}
          match={mine}
          label={round.competitions.find((c) => c.id === mine.competitionId)?.label ?? ""}
          minute={minute}
          speed={speed}
          golCount={golCount}
          onSpeed={chooseSpeed}
          isOnlyMine={isOnlyMine}
          onOnlyMine={setOnlyMine}
          isFinished={isFinished}
          shootoutWinner={shootoutWinnerOf(result, mine.fixtureId, round.clubs)}
          table={table && <TableCard rows={table} clubs={round.clubs} coachClubId={round.coachClubId} onOpen={() => openSheet(setTableOpen)} />}
        >
          {isFinished ? (
            <button className="btn y live-act" onClick={() => navigate(afterRound)}>
              <i className="ph-bold ph-arrow-left" aria-hidden="true" />
              {hotSeat ? "Próxima vez" : "Voltar ao clube"}
            </button>
          ) : minute >= FULL_TIME ? (
            error ? (
              <button className="btn y live-act" onClick={() => void finish()}>
                Tentar de novo
              </button>
            ) : (
              <button className="btn y live-act" disabled>
                Encerrando…
              </button>
            )
          ) : (
            <button className="btn y live-act" onClick={() => openSheet(setLineupOpen)}>
              <i className="ph-bold ph-strategy" aria-hidden="true" />
              Escalação <small>{limits?.subsLeft === 1 ? "1 troca" : `${limits?.subsLeft ?? 0} trocas`}</small>
            </button>
          )}
        </Cover>
      ) : (
        <header className="live-plain" data-tauri-drag-region>
          <h1>Rodada</h1>
          <span>{formatBarDate(round.date)}</span>
          {isFinished && (
            <button className="btn y live-act" onClick={() => navigate(afterRound)}>
              <i className="ph-bold ph-arrow-left" aria-hidden="true" />
              {hotSeat ? "Próxima vez" : "Voltar ao clube"}
            </button>
          )}
        </header>
      )}
      {error && !isLineupOpen && <p className="status error live-error">{error}</p>}

      <div className="live-list">
        {groups.map((group) => (
          <section key={group.id} className="live-group" aria-labelledby={`live-${group.id}`} hidden={isOnlyMine && !group.rows.some((m) => m.isHuman)}>
            <h2 id={`live-${group.id}`} className="live-g">
              <CompetitionLogo label={group.label} size={20} />
              {group.label}
            </h2>
            <ul className="live-rows" aria-labelledby={`live-${group.id}`}>
              {group.rows.map((m) => (
                <MatchRow key={m.fixtureId} match={m} clubs={round.clubs} flash={flashes[m.fixtureId]} isHidden={isOnlyMine && !m.isHuman} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {isTableOpen && table && (
        <TableSheet onClose={closeTable} note={isFinished ? "com os resultados da rodada" : "se terminasse agora"}>
          <TableRows rows={table} clubs={round.clubs} coachClubId={round.coachClubId} isFull />
        </TableSheet>
      )}

      {isLineupOpen && coach && limits && (
        <LineupSheet
          sub={round.clubs[round.coachClubId ?? ""]?.shortName ?? ""}
          squad={coach.squad}
          lineup={limits.onPitch}
          tactics={coach.tactics}
          mode={{ kind: "live", ...limits }}
          doneLabel="Voltar ao jogo"
          isBusy={isBusy}
          error={error}
          onDone={(sheet) => void backToMatch(sheet)}
        />
      )}
    </div>
  );
}

/** The competition's real mark where the game has one: the Brasileirão's top two series and the Copa do Brasil. */
function CompetitionLogo({ label, size }: { label: string; size: number }) {
  const logo = COMPETITION_LOGOS.find(({ prefix }) => label.startsWith(prefix));
  return logo ? <img className="crest" src={logo.src} height={size} alt="" /> : null;
}

function shootoutWinnerOf(result: AdvanceResult | null, fixtureId: string, clubs: Readonly<Record<string, RoundClub>>): string | null {
  const played = result?.events.find((e) => e.type === "matchPlayed" && e.fixture.id === fixtureId);
  const winnerId = played?.type === "matchPlayed" ? played.fixture.result?.penaltyWinnerId : undefined;
  return winnerId ? (clubs[winnerId]?.shortName ?? null) : null;
}

/** A score digit that rolls up into place when it changes, and on the board stands still again once its row's goal has been celebrated. */
function Digit({ value, className, flash, isSettled }: { value: number; className: string; flash?: string; isSettled?: boolean }) {
  const [still, setStill] = useState(value);
  useEffect(() => {
    if (isSettled) setStill(value);
  }, [isSettled]);
  const rolls = value !== still;
  return (
    <span className={className} style={flash ? { ["--flash" as string]: flash } : undefined}>
      <span key={value} className={rolls ? "roll" : undefined}>
        {value}
      </span>
    </span>
  );
}

const EVENT_ICONS: Partial<Record<EventKind, string>> = { goal: "ph-fill ph-soccer-ball", injury: "ph-fill ph-first-aid", substitution: "ph-bold ph-arrows-left-right" };

function EventMark({ kind }: { kind: EventKind }) {
  if (kind === "yellow") return <span className="yc" aria-hidden="true" />;
  if (kind === "red") return <span className="rc" aria-hidden="true" />;
  return <i className={`${EVENT_ICONS[kind] ?? ""} mk-${kind}`} aria-hidden="true" />;
}

type CoverProps = {
  round: LiveRound;
  match: MatchAt;
  label: string;
  minute: number;
  speed: Speed;
  golCount: number;
  isOnlyMine: boolean;
  isFinished: boolean;
  shootoutWinner: string | null;
  table: ReactNode;
  onSpeed: (speed: Speed) => void;
  onOnlyMine: (isOnlyMine: boolean) => void;
  children: ReactNode;
};

function clockNote(minute: number, speed: Speed, isFinished: boolean): string {
  if (isFinished || minute >= FULL_TIME) return "Fim de jogo";
  if (minute === HALF_TIME && speed === 0) return "Intervalo";
  return minute > HALF_TIME ? "2º tempo" : "1º tempo";
}

/** The coach's match as the cover of the round: the score between the two clubs' stickers, the clock and the controls over the pitch. */
function Cover({ round, match, label, minute, speed, golCount, isOnlyMine, isFinished, shootoutWinner, table, onSpeed, onOnlyMine, children }: CoverProps) {
  // The cover builds itself only at kick-off, not when the coach comes back to a match under way.
  const [isKickOff] = useState(minute === 0);
  const home = round.clubs[match.homeId];
  const away = round.clubs[match.awayId];
  if (!home || !away) return null;
  const isStopped = isFinished || minute >= FULL_TIME;
  const scorers = scorersUntil(round, match.fixtureId, minute);
  const [competition, roundName] = label.split(" · ");
  const side = (club: RoundClub, where: Side) => (
    <div className={`stk live-tm ${where === "home" ? "h" : "a"}${club.id === round.coachClubId ? " you" : ""}`}>
      {match.reds[where] > 0 && <span className="rc live-tm-red" aria-label="expulsão" />}
      <Crest club={club} size={54} />
      <b>{club.shortName}</b>
      <small>{club.id === round.coachClubId ? "Seu time" : where === "home" ? "Mandante" : "Visitante"}</small>
    </div>
  );
  return (
    <section className={isKickOff ? "live-cover round-kickoff" : "live-cover"} aria-label="Seu jogo">
      {golCount > 0 && (
        <div key={golCount} className="gol-sweep" aria-hidden="true">
          GOL
        </div>
      )}
      <div className="live-ttl" data-tauri-drag-region>
        <h1>
          <CompetitionLogo label={label} size={30} />
          {competition}
          <span>{[roundName, formatBarDate(round.date)].filter(Boolean).join(" · ")}</span>
        </h1>
        <div className="live-tools">
          {speed === 0 && !isFinished && minute < FULL_TIME && (
            <span className="chip wait live-paused">
              <i className="ph-fill ph-pause" aria-hidden="true" />
              Pausado
            </span>
          )}
          <div className="live-clock">
            <span>{clockNote(minute, speed, isFinished)}</span>
            <span className="live-track" aria-hidden="true">
              <i style={{ transform: `scaleX(${Math.min(minute, FULL_TIME) / FULL_TIME})` }} />
            </span>
            <b aria-label="Minuto">{Math.min(minute, FULL_TIME)}'</b>
          </div>
          <div className="live-speed" role="group" aria-label="Velocidade">
            <button aria-label="Pausar" aria-pressed={speed === 0} disabled={isStopped} onClick={() => onSpeed(0)}>
              <i className="ph-fill ph-pause" aria-hidden="true" />
            </button>
            {SPEEDS.map((s) => (
              <button key={s} aria-label={`${s}x`} aria-pressed={speed === s} disabled={isStopped} onClick={() => onSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
          <label className="live-mine">
            Só meus jogos
            <input type="checkbox" className="live-sw" checked={isOnlyMine} onChange={(event) => onOnlyMine(event.target.checked)} />
          </label>
        </div>
      </div>
      <div className="live-feat">
        <div className="live-stad">
          <b>{home.stadium}</b>
          {home.shortName} em casa
        </div>
        <div className="live-mid">
          <div className="live-duel">
            {side(home, "home")}
            <p className="live-sc" aria-label={`${home.shortName} ${match.score.home} x ${match.score.away} ${away.shortName}`}>
              <Digit value={match.score.home} className="digit" />
              <span className="x">×</span>
              <Digit value={match.score.away} className="digit" />
            </p>
            {side(away, "away")}
          </div>
          <div className="live-evs">
            {shootoutWinner ? (
              <span className="last">{shootoutWinner} nos pênaltis</span>
            ) : (
              scorers.map((goal, index) => (
                <span key={`${goal.minute}-${index}`} className={index === scorers.length - 1 ? "last" : undefined}>
                  <i className="ph-fill ph-soccer-ball" aria-hidden="true" />
                  {goal.name} {goal.minute}'
                </span>
              ))
            )}
          </div>
        </div>
        <div className="live-right">
          {table}
          {children}
        </div>
      </div>
    </section>
  );
}

type MatchRowProps = { match: MatchAt; clubs: Readonly<Record<string, RoundClub>>; flash: Flash | undefined; isHidden: boolean };

/** A row redraws only when its own match changes, so a whole round's board stays light at 4x. */
const isSameRow = (before: MatchRowProps, after: MatchRowProps) =>
  before.clubs === after.clubs &&
  before.flash === after.flash &&
  before.isHidden === after.isHidden &&
  before.match.isHuman === after.match.isHuman &&
  before.match.score.home === after.match.score.home &&
  before.match.score.away === after.match.score.away &&
  before.match.reds.home === after.match.reds.home &&
  before.match.reds.away === after.match.reds.away &&
  before.match.last?.minute === after.match.last?.minute &&
  before.match.last?.text === after.match.last?.text;

const MatchRow = memo(function MatchRow({ match, clubs, flash, isHidden }: MatchRowProps) {
  const home = clubs[match.homeId];
  const away = clubs[match.awayId];
  if (!home || !away) return null;
  const lead = (side: Side) => (side === "home" ? match.score.home > match.score.away : match.score.away > match.score.home);
  return (
    <li className={match.isHuman ? "live-r human" : "live-r"} hidden={isHidden} aria-label={`${home.shortName} ${match.score.home} x ${match.score.away} ${away.shortName}`}>
      {flash && <i key={flash.count} className="flash" style={{ background: `linear-gradient(90deg, transparent 12%, ${flash.colour} 40%, transparent 95%)` }} />}
      <span className="std">{home.stadium}</span>
      <RowPlate club={home} red={match.reds.home > 0} />
      <Digit value={match.score.home} className={lead("home") ? "sbox lead" : "sbox"} flash={flash?.side === "home" ? flash.colour : undefined} isSettled={!flash} />
      <Digit value={match.score.away} className={lead("away") ? "sbox lead" : "sbox"} flash={flash?.side === "away" ? flash.colour : undefined} isSettled={!flash} />
      <RowPlate club={away} red={match.reds.away > 0} />
      <span className="ev">
        {flash && (
          <span key={flash.count} className="gol">
            Gol
          </span>
        )}
        {match.last && (
          <>
            <EventMark kind={match.last.kind} />
            <span className="who">{match.last.text}</span>
            <span className="mn">{match.last.minute}'</span>
          </>
        )}
      </span>
    </li>
  );
}, isSameRow);

/** A club on the round board: its crest on a pill in its colours, as Brasfoot paints it. */
function RowPlate({ club, red }: { club: RoundClub; red: boolean }) {
  const { background, text } = plateColours(club.colours);
  return (
    <span className="plate" style={{ background, color: text }}>
      <Crest club={club} size={17} />
      <span className="nm">{club.shortName}</span>
      {red && <span className="rc" aria-label="expulsão" />}
    </span>
  );
}

/** The coach's group as it would stand now, three rows around his club, over the button that opens it whole. */
function TableCard({ rows, clubs, coachClubId, onOpen }: { rows: readonly LiveTableRow[]; clubs: Readonly<Record<string, RoundClub>>; coachClubId: string | null; onOpen: () => void }) {
  return (
    <div className="live-table">
      <TableRows rows={shortTable(rows, coachClubId, TABLE_CARD_ROWS)} clubs={clubs} coachClubId={coachClubId} />
      <button className="live-table-open" onClick={onOpen}>
        Tabela completa
      </button>
    </div>
  );
}

/** The full table over the round, closed by its button, a click outside it or Escape. */
function TableSheet({ note, onClose, children }: { note: string; onClose: () => void; children: ReactNode }) {
  const title = useDialogFocus<HTMLHeadingElement>(true, { isModal: true });
  return createPortal(
    <div className="sheet-wrap" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="tsheet page" role="dialog" aria-modal="true" aria-labelledby="full-table-title">
        <header className="tsheet-head">
          <div>
            <h2 id="full-table-title" ref={title} tabIndex={-1}>
              Classificação
            </h2>
            <span>{note}</span>
          </div>
          <button className="btn sm" onClick={onClose}>
            Fechar
          </button>
        </header>
        <div className="trow trow-head" aria-hidden="true">
          <span>#</span>
          <span>Clube</span>
          <span className="g">J</span>
          <span className="g">V</span>
          <span className="g">SG</span>
          <span className="g">P</span>
        </div>
        {children}
      </aside>
    </div>,
    document.body,
  );
}

const ROSE = "rgba(17, 132, 66, 0.2)";
const FELL = "rgba(215, 50, 42, 0.16)";

/** A table row slides to its new place, tinted green if it rose and red if it fell; with reduced motion only the tint fades. */
function slideTableRow(row: HTMLElement, offset: number) {
  if (typeof row.animate !== "function") return;
  const tint = offset > 0 ? ROSE : FELL;
  const slides = !prefersReducedMotion();
  const at = (y: number) => (slides ? { transform: `translateY(${y}px)` } : {});
  row.animate(
    [
      { ...at(offset), boxShadow: `inset 0 0 0 999px ${tint}` },
      { ...at(0), boxShadow: `inset 0 0 0 999px ${tint}`, offset: 0.55 },
      { ...at(0), boxShadow: "inset 0 0 0 999px transparent" },
    ],
    { duration: 1500, delay: 180, easing: EXPO_OUT, fill: "backwards" },
  );
}

/** Table rows that slide to their new places when the order changes (FLIP). */
function TableRows({ rows, clubs, coachClubId, isFull = false }: { rows: readonly LiveTableRow[]; clubs: Readonly<Record<string, RoundClub>>; coachClubId: string | null; isFull?: boolean }) {
  const list = useRef<HTMLOListElement>(null);
  useFlip(list, rows.map((r) => r.clubId).join(), slideTableRow);

  return (
    <ol ref={list} className={isFull ? "trows full" : "trows"} aria-label={isFull ? "Tabela completa" : "Classificação ao vivo"}>
      {rows.map((r) => {
        const club = clubs[r.clubId];
        return (
          <li key={r.clubId} data-flip={r.clubId} className={r.clubId === coachClubId ? "trow mine" : "trow"}>
            <span className="p">{r.position}</span>
            <span className="n">
              {club && <Crest club={club} size={isFull ? 20 : 16} />}
              {club?.shortName ?? r.clubId}
            </span>
            {isFull && (
              <>
                <span className="g">{r.played}</span>
                <span className="g">{r.wins}</span>
                <span className="g">{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</span>
              </>
            )}
            {!isFull && <span className={r.move > 0 ? "mv up" : "mv down"}>{r.move > 0 ? `▲${r.move}` : r.move < 0 ? `▼${-r.move}` : ""}</span>}
            <span className="pts">{r.points}</span>
          </li>
        );
      })}
    </ol>
  );
}
