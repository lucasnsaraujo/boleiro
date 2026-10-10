import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";
import type { Club } from "../../src/data/clubs.js";
import { FULL_TIME, HALF_TIME } from "../../src/sim/live/matchTimeline.js";
import { useServices } from "../app/ServicesContext.js";
import { ClubPlate } from "../clubs/ClubPlate.js";
import { Crest } from "../clubs/Crest.js";
import type { AdvanceResult } from "../engine/createEngineSession.js";
import { formatMatchDate } from "../format/formatGameDate.js";
import { LineupSheet } from "../round/LineupSheet.js";
import { kickOffOf, liveChangeOf, liveLimits, type Sheet } from "../round/lineupDraft.js";
import type { LiveRound, RoundClub, Side } from "../round/liveRoundOf.js";
import { liveTable, shortTable, type LiveTableRow } from "../round/liveTable.js";
import type { MatchDayPlan } from "../round/matchDayPlan.js";
import { goalsBetween, pauseReason, roundAt, type EventKind, type MatchAt } from "../round/roundAt.js";
import "./round.css";

type Speed = 0 | 1 | 2 | 4;
type Running = Exclude<Speed, 0>;
const SPEEDS: readonly Running[] = [1, 2, 4];
// guess: Brasfoot's normal speed plays a match in about a minute; 4x gets a round done in ten seconds.
const MS_PER_MINUTE: Record<Running, number> = { 1: 660, 2: 330, 4: 110 };
// A goal floods its row for less time when the clock runs faster, so goals a few minutes apart don't pile up.
const FLOOD_MS: Record<Running, number> = { 1: 1500, 2: 1150, 4: 800 };
const EXPO_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const NO_COLOURS = { primary: "#eef3e8", secondary: "#0a1a10" };

type PreMatch = { plan: MatchDayPlan; clubs: Readonly<Record<string, Club>>; date: string };
/** A goal being celebrated on a row: the scoring club's colour, its side, and a count so each goal replays the animation. */
type Flash = { colour: string; side: Side; count: number };

function canAnimate(element: Element): boolean {
  return typeof element.animate === "function" && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function Round() {
  const { engine } = useServices();
  const navigate = useNavigate();
  const [preMatch, setPreMatch] = useState<PreMatch | null>(null);
  const [round, setRound] = useState<LiveRound | null>(null);
  const [failure, setFailure] = useState<"noMatch" | "unreachable" | null>(null);
  const [minute, setMinute] = useState(0);
  const [speed, setSpeed] = useState<Speed>(0);
  const resumeSpeed = useRef<Running>(1);
  const wasRunning = useRef(false);
  const [isLineupOpen, setLineupOpen] = useState(false);
  const [isTableOpen, setTableOpen] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdvanceResult | null>(null);
  const [competitionId, setCompetitionId] = useState<string | null>(null);
  const [flashes, setFlashes] = useState<Record<string, Flash>>({});
  const [golCount, setGolCount] = useState(0);
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
      setResult(await engine.finishRound());
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
    engine.seeMinute(minute).catch(() => undefined);
    const goals = goalsBetween(live, from, minute);
    if (goals.length) {
      setFlashes((current) => {
        const next = { ...current };
        for (const goal of goals) {
          const colour = live.clubs[goal.clubId]?.colours.primary ?? NO_COLOURS.primary;
          next[goal.fixtureId] = { colour, side: goal.side, count: (next[goal.fixtureId]?.count ?? 0) + 1 };
        }
        return next;
      });
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
      const live = await engine.startRound(kickOffOf(sheet, preMatch.plan.lineup, preMatch.plan.tactics));
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
        const changed = await engine.changeLive(minute, change);
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

  useEffect(() => {
    if (!isTableOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && closeTable();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (failure) {
    return (
      <>
        <h1 className="screen-title">{failure === "noMatch" ? "Nenhum jogo hoje" : "Rodada"}</h1>
        {failure === "unreachable" && <p className="status error">Não deu para abrir a rodada.</p>}
        <p className="status">
          <Link to="/hub" className="btn-main">
            Voltar ao clube
          </Link>
        </p>
      </>
    );
  }

  if (preMatch) {
    const { plan, clubs } = preMatch;
    const vs = `${clubs[plan.homeId]?.shortName ?? ""} x ${clubs[plan.awayId]?.shortName ?? ""}`;
    return (
      <LineupSheet
        sub={`${vs} · ${plan.label}`}
        squad={plan.squad}
        lineup={plan.lineup}
        tactics={plan.tactics}
        mode={{ kind: "preMatch" }}
        colours={clubs[plan.clubId]?.colours ?? NO_COLOURS}
        doneLabel="Começar a rodada"
        isBusy={isBusy}
        error={error}
        onDone={(sheet) => void kickOff(sheet)}
        onLeave={() => navigate("/hub")}
      />
    );
  }

  if (!round) return <p className="status">Abrindo a rodada…</p>;

  const matches = roundAt(round, minute);
  const mine = matches.find((m) => m.isCoach);
  const shown = competitionId ?? round.competitions[0]?.id ?? "";
  const rows = matches.filter((m) => m.competitionId === shown);
  const competition = round.competitions.find((c) => c.id === shown);
  const goals = rows.reduce((sum, m) => sum + m.score.home + m.score.away, 0);
  const scores = new Map(matches.map((m) => [m.fixtureId, m.score]));
  const table = round.table && liveTable(round.table, scores);
  const coach = round.coach;
  const coachMatch = round.matches.find((m) => m.fixtureId === coach?.fixtureId);
  const limits = coach && coachMatch && round.coachClubId ? liveLimits(coach, coachMatch.events, round.coachClubId, minute) : null;
  const ownColours = round.coachClubId ? round.clubs[round.coachClubId]?.colours : undefined;
  const isFinished = result !== null;

  return (
    <div className="round-screen" style={{ ["--flood" as string]: `${FLOOD_MS[resumeSpeed.current]}ms` }}>
      {mine && (
        <Band
          match={mine}
          clubs={round.clubs}
          label={round.competitions.find((c) => c.id === mine.competitionId)?.label ?? ""}
          date={round.date}
          minute={minute}
          speed={speed}
          golCount={golCount}
          onSpeed={chooseSpeed}
          isFinished={isFinished}
          shootoutWinner={shootoutWinnerOf(result, mine.fixtureId, round.clubs)}
        >
          {isFinished ? (
            <button className="btn-main" onClick={() => navigate("/hub")}>
              Voltar ao clube
            </button>
          ) : minute >= FULL_TIME ? (
            error ? (
              <button className="btn-main" onClick={() => void finish()}>
                Tentar de novo
              </button>
            ) : (
              <button className="btn-main" disabled>
                Encerrando…
              </button>
            )
          ) : (
            <button className="btn-main" onClick={() => openSheet(setLineupOpen)}>
              Escalação <small>{limits?.subsLeft === 1 ? "1 troca" : `${limits?.subsLeft ?? 0} trocas`}</small>
            </button>
          )}
        </Band>
      )}
      {error && !isLineupOpen && <p className="status error round-error">{error}</p>}

      <div className={table ? "round-body" : "round-body no-table"}>
        <section className="round-list" aria-labelledby="round-title">
          <div className="group">
            <h2 id="round-title">
              {round.competitions.length > 1 ? (
                <select className="others" aria-label="Competição" value={shown} onChange={(event) => setCompetitionId(event.target.value)}>
                  {round.competitions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              ) : (
                competition?.label
              )}
            </h2>
            <span className="goals">{goals === 1 ? "1 gol" : `${goals} gols`}</span>
          </div>
          <ul className="rows" aria-labelledby="round-title">
            {rows.map((m) => (
              <MatchRow key={m.fixtureId} match={m} clubs={round.clubs} minute={minute} flash={flashes[m.fixtureId]} />
            ))}
          </ul>
        </section>

        {table && (
          <aside className="table" aria-labelledby="table-title">
            <div className="group">
              <h2 id="table-title">Classificação</h2>
              <button className="link" onClick={() => openSheet(setTableOpen)}>
                Tabela completa
              </button>
            </div>
            <TableRows rows={shortTable(table, round.coachClubId)} clubs={round.clubs} coachClubId={round.coachClubId} />
          </aside>
        )}
      </div>

      {isTableOpen &&
        table &&
        createPortal(
        <div className="sheet-wrap" onClick={(event) => event.target === event.currentTarget && closeTable()}>
          <aside className="tsheet" role="dialog" aria-modal="true" aria-labelledby="full-table-title">
            <header className="tsheet-head">
              <h2 id="full-table-title">Classificação</h2>
              <span>{isFinished ? "com os resultados da rodada" : "se terminasse agora"}</span>
              <button className="ghost" onClick={closeTable}>
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
            <TableRows rows={table} clubs={round.clubs} coachClubId={round.coachClubId} isFull />
          </aside>
        </div>,
        document.body,
      )}

      {isLineupOpen && coach && limits && (
        <LineupSheet
          sub={round.clubs[round.coachClubId ?? ""]?.shortName ?? ""}
          squad={coach.squad}
          lineup={limits.onPitch}
          tactics={coach.tactics}
          mode={{ kind: "live", ...limits }}
          colours={ownColours ?? NO_COLOURS}
          doneLabel="Voltar ao jogo"
          isBusy={isBusy}
          error={error}
          onDone={(sheet) => void backToMatch(sheet)}
        />
      )}
    </div>
  );
}

function shootoutWinnerOf(result: AdvanceResult | null, fixtureId: string, clubs: Readonly<Record<string, RoundClub>>): string | null {
  const played = result?.events.find((e) => e.type === "matchPlayed" && e.fixture.id === fixtureId);
  const winnerId = played?.type === "matchPlayed" ? played.fixture.result?.penaltyWinnerId : undefined;
  return winnerId ? (clubs[winnerId]?.shortName ?? null) : null;
}

/** A score digit that rolls up into place when it changes. */
function Digit({ value, className, flash }: { value: number; className: string; flash?: string }) {
  const first = useRef(value);
  const rolls = value !== first.current;
  return (
    <span className={className} style={flash ? { ["--flash" as string]: flash } : undefined}>
      <span key={value} className={rolls ? "roll" : undefined}>
        {value}
      </span>
    </span>
  );
}

function EventMark({ kind }: { kind: EventKind }) {
  if (kind === "goal") {
    return (
      <svg className="mk goal" viewBox="0 0 13 13" aria-hidden="true">
        <circle cx="6.5" cy="6.5" r="5.6" fill="#eef3e8" />
        <path d="M6.5 3.6l2.4 1.7-.9 2.8H5L4.1 5.3z" fill="#0a1a10" />
      </svg>
    );
  }
  return <i className={`mk ${kind}`} aria-hidden="true" />;
}

type BandProps = {
  match: MatchAt;
  clubs: Readonly<Record<string, RoundClub>>;
  label: string;
  date: string;
  minute: number;
  speed: Speed;
  golCount: number;
  isFinished: boolean;
  shootoutWinner: string | null;
  onSpeed: (speed: Speed) => void;
  children: ReactNode;
};

function clockNote(minute: number, speed: Speed, isFinished: boolean): string {
  if (isFinished || minute >= FULL_TIME) return "Fim de jogo";
  if (minute === HALF_TIME && speed === 0) return "Intervalo";
  return minute > HALF_TIME ? "2º tempo" : "1º tempo";
}

function Band({ match, clubs, label, date, minute, speed, golCount, isFinished, shootoutWinner, onSpeed, children }: BandProps) {
  const home = clubs[match.homeId];
  const away = clubs[match.awayId];
  if (!home || !away) return null;
  const last = shootoutWinner ? `${shootoutWinner} nos pênaltis` : match.last && `${match.last.minute}' ${match.last.text}`;
  return (
    <section className="band" aria-label="Seu jogo">
      {golCount > 0 && (
        <div key={golCount} className="gol-sweep" aria-hidden="true">
          GOL
        </div>
      )}
      <div className="band-top">
        <p className="crumb">
          <b>{label}</b> · {formatMatchDate(date)}
        </p>
        <div className="speed" role="group" aria-label="Velocidade">
          <button aria-label="Pausar" aria-pressed={speed === 0} disabled={isFinished || minute >= FULL_TIME} onClick={() => onSpeed(0)}>
            <svg viewBox="0 0 10 12" aria-hidden="true">
              <rect width="3.5" height="12" />
              <rect x="6.5" width="3.5" height="12" />
            </svg>
          </button>
          {SPEEDS.map((s) => (
            <button key={s} aria-pressed={speed === s} disabled={isFinished || minute >= FULL_TIME} onClick={() => onSpeed(s)}>
              {s}x
            </button>
          ))}
        </div>
      </div>
      <div className="band-grid">
        <div className="side home">
          {match.reds.home > 0 && <i className="redc" aria-label="expulsão" />}
          <ClubPlate club={home} />
          <Crest club={home} size={54} />
        </div>
        <p className="score" aria-label={`${home.shortName} ${match.score.home} x ${match.score.away} ${away.shortName}`}>
          <Digit value={match.score.home} className="digit" />
          <span className="x">x</span>
          <Digit value={match.score.away} className="digit" />
        </p>
        <div className="side away">
          <Crest club={away} size={54} />
          <ClubPlate club={away} />
          {match.reds.away > 0 && <i className="redc" aria-label="expulsão" />}
        </div>
        <p className="clock">
          <b aria-label="Minuto">{minute}'</b>
          <span>{clockNote(minute, speed, isFinished)}</span>
        </p>
      </div>
      <div className="band-foot">
        <p className="venue">{home.stadium}</p>
        <p className="lastev">{last}</p>
        <div className="actions">{children}</div>
      </div>
      <div className="progress">
        <i style={{ transform: `scaleX(${Math.min(minute, FULL_TIME) / FULL_TIME})` }} />
      </div>
    </section>
  );
}

function MatchRow({ match, clubs, minute, flash }: { match: MatchAt; clubs: Readonly<Record<string, RoundClub>>; minute: number; flash: Flash | undefined }) {
  const home = clubs[match.homeId];
  const away = clubs[match.awayId];
  if (!home || !away) return null;
  const red = <i className="redc" aria-label="expulsão" />;
  return (
    <li className={match.isCoach ? "row mine" : "row"} aria-label={`${home.shortName} ${match.score.home} x ${match.score.away} ${away.shortName}`}>
      {flash && <i key={flash.count} className="flash" style={{ background: flash.colour }} />}
      <span className="t">{Math.min(minute, FULL_TIME)}'</span>
      <span className="h">
        {match.reds.home > 0 && red}
        <ClubPlate club={home} size="row" />
      </span>
      <Digit value={match.score.home} className="box" flash={flash?.side === "home" ? flash.colour : undefined} />
      <Digit value={match.score.away} className="box" flash={flash?.side === "away" ? flash.colour : undefined} />
      <span className="a">
        <ClubPlate club={away} size="row" />
        {match.reds.away > 0 && red}
      </span>
      <span className="ev">
        {match.last && (
          <>
            <EventMark kind={match.last.kind} />
            <span className="min">{match.last.minute}'</span>
            <span className="who">{match.last.text}</span>
          </>
        )}
      </span>
    </li>
  );
}

/** Table rows that slide to their new places when the order changes (FLIP). */
function TableRows({ rows, clubs, coachClubId, isFull = false }: { rows: readonly LiveTableRow[]; clubs: Readonly<Record<string, RoundClub>>; coachClubId: string | null; isFull?: boolean }) {
  const list = useRef<HTMLOListElement>(null);
  const tops = useRef(new Map<string, number>());
  const order = rows.map((r) => r.clubId).join();
  const lastOrder = useRef(order);

  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    const moved = lastOrder.current !== order;
    lastOrder.current = order;
    const next = new Map<string, number>();
    for (const row of Array.from(element.children)) {
      if (!(row instanceof HTMLElement)) continue;
      const key = row.dataset.club ?? "";
      const top = row.offsetTop;
      next.set(key, top);
      const was = tops.current.get(key);
      if (!moved || was === undefined || Math.abs(was - top) < 1 || !canAnimate(row)) continue;
      const tint = was > top ? "rgba(111, 211, 138, 0.24)" : "rgba(240, 138, 122, 0.2)";
      row.animate(
        [
          { transform: `translateY(${was - top}px)`, boxShadow: `inset 0 0 0 999px ${tint}` },
          { transform: "translateY(0)", boxShadow: `inset 0 0 0 999px ${tint}`, offset: 0.55 },
          { transform: "translateY(0)", boxShadow: "inset 0 0 0 999px transparent" },
        ],
        { duration: 1500, delay: 180, easing: EXPO_OUT, fill: "backwards" },
      );
    }
    tops.current = next;
  }, [order]);

  return (
    <ol ref={list} className={isFull ? "trows full" : "trows"} aria-label={isFull ? "Tabela completa" : "Classificação ao vivo"}>
      {rows.map((r) => (
        <li key={r.clubId} data-club={r.clubId} className={r.clubId === coachClubId ? "trow mine" : "trow"}>
          <span className="p">{r.position}</span>
          <span className="n">{clubs[r.clubId]?.shortName ?? r.clubId}</span>
          {isFull && (
            <>
              <span className="g">{r.played}</span>
              <span className="g">{r.wins}</span>
            </>
          )}
          <span className="g">{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</span>
          {!isFull && <span className={r.move > 0 ? "mv up" : "mv down"}>{r.move > 0 ? `▲${r.move}` : r.move < 0 ? `▼${-r.move}` : ""}</span>}
          <span className="pts">{r.points}</span>
        </li>
      ))}
    </ol>
  );
}
