import { EggNoteCard } from "../eggs/EggNoteCard.js";
import { useLayoutEffect, useRef, useState } from "react";
import { FULL_TIME, HALF_TIME } from "@boleiro/engine/sim/live/matchTimeline";
import type { VarDecision, WrongCallKind } from "@boleiro/engine/sim/referees/refereeCalls";
import { PRESSURE_MINUTES, type MatchView, type PageEvent } from "@boleiro/game-client/matchPage/matchPageAt";
import type { MatchPage, PagePlayer } from "@boleiro/game-client/matchPage/matchPageOf";
import type { Side } from "@boleiro/game-client/round/liveRoundOf";
import { formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { Crest } from "../clubs/Crest.js";
import { clockLabel, clubColours, EventMark, GoalNote, LiveChip, RollingDigit, refereeLine, StatBar, venueLine } from "./matchFileParts.js";
import { formatMark, markClass } from "./matchMarks.js";
import { MatchPitch } from "./MatchPitch.js";
import { headlineOf, reportOf } from "./matchStory.js";
import { EditionLogo } from "../competitions/CompetitionLogo.js";

const TABS = [
  { id: "resumo", label: "Resumo" },
  { id: "escalacoes", label: "Escalações" },
  { id: "estatisticas", label: "Estatísticas" },
  { id: "confronto", label: "Confronto" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const GROUP_LETTERS = { GK: "G", DEF: "Z", MID: "M", ATT: "A" } as const;
// The breaks the wave marks: half-time, and the end of normal time when extra time follows.
const BREAK_SPELLS = [HALF_TIME, FULL_TIME].map((minute) => minute / PRESSURE_MINUTES);
const AXIS_STEP = 15;
// A report longer than this sets in two columns, like the paper's.
const LONG_COPY = 220;

type Props = { page: MatchPage; view: MatchView; isLeaving: boolean; onBack: () => void; onClose: () => void };

/** The full ficha: the score fixed on top, the match in four tabs below. */
export function MatchSheet({ page, view, isLeaving, onBack, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("resumo");
  const title = useDialogFocus<HTMLHeadingElement>(true, { isModal: true });
  const tabs = useRef<HTMLDivElement>(null);
  const [ink, setInk] = useState({ x: 0, width: 0 });
  // The ink slides under the chosen tab, measured so it lands on the button whatever its width.
  useLayoutEffect(() => {
    const chosen = tabs.current?.querySelector<HTMLElement>("[aria-selected='true']");
    if (chosen) setInk({ x: chosen.offsetLeft, width: chosen.offsetWidth });
  }, [tab]);
  const name = (id: string) => page.names[id] ?? "Um jogador";
  const scorers = (side: Side) => view.events.filter((e) => e.kind === "goal" && e.side === side);
  return (
    <div className={`mf-sheet${isLeaving ? " leaving" : ""}`} role="dialog" aria-modal="true" aria-label="Ficha completa" style={clubColours(page)}>
      <h2 ref={title} tabIndex={-1} className="sr-only">
        Ficha completa: {page.home.club.shortName} {view.score.home} x {view.score.away} {page.away.club.shortName}
      </h2>
      <header className="mf-head">
        {(["home", "away"] as const).map((side) => (
          <div key={side} className={`mf-team ${side}`}>
            <Crest club={page[side].club} size={66} />
            <div>
              <h2>{page[side].club.shortName}</h2>
              <small>
                {side === "home" ? "Mandante" : "Visitante"} · {page[side].formation}
              </small>
              <ul className="mf-scorers" aria-label={`Gols ${page[side].club.shortName}`}>
                {scorers(side).map((g, index) => (
                  <li key={index}>
                    <b>
                      {name(g.playerId)} {g.minute}'
                    </b>{" "}
                    <GoalNote event={g} names={page.names} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
        <div className="mf-big" aria-label={`${page.home.club.shortName} ${view.score.home} x ${view.score.away} ${page.away.club.shortName}`}>
          {page.edition && <EditionLogo edition={page.edition} size={40} name={page.competition} className="mf-big-logo" />}
          <div className="mf-digits">
            <RollingDigit value={view.score.home} />
            <span className="mf-times" aria-hidden="true">
              ×
            </span>
            <RollingDigit value={view.score.away} />
          </div>
          <span className="mf-status">
            {clockLabel(page, view)} · {page.label}
          </span>
        </div>
      </header>
      <div className="mf-strip">
        <i className="ph-bold ph-ticket" aria-hidden="true" />
        <span>{[...venueLine(page), refereeLine(page)].filter(Boolean).join(" · ") || "Estádio não informado"}</span>
        <span className="mf-date">{formatDayMonth(page.date)}</span>
        <LiveChip page={page} view={view} />
      </div>
      <nav className="mf-tabs-row">
        <div ref={tabs} className="mf-tabs" role="tablist" aria-label="Ficha do jogo" style={{ ["--ink-x" as string]: `${ink.x}px`, ["--ink-w" as string]: `${ink.width}px` }}>
          <i className="mf-tab-ink" aria-hidden="true" />
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`mf-tab-${t.id}`}
              aria-selected={t.id === tab}
              aria-controls="mf-tabpanel"
              tabIndex={t.id === tab ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(event) => {
                const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                if (!step) return;
                // The round's boards step on the arrows too; a tab that took them leaves them alone.
                event.preventDefault();
                const next = TABS[(TABS.findIndex((other) => other.id === tab) + step + TABS.length) % TABS.length];
                if (!next) return;
                setTab(next.id);
                document.getElementById(`mf-tab-${next.id}`)?.focus();
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button className="btn sm" onClick={onBack}>
          <i className="ph-bold ph-arrow-left" aria-hidden="true" />
          Voltar
        </button>
        <button className="mf-x" aria-label="Fechar a ficha" onClick={onClose}>
          <i className="ph-bold ph-x" aria-hidden="true" />
        </button>
      </nav>
      <section key={tab} id="mf-tabpanel" className={`mf-panelbody tab-${tab}`} role="tabpanel" aria-labelledby={`mf-tab-${tab}`}>
        {tab === "resumo" && <Summary page={page} view={view} />}
        {tab === "escalacoes" && <Lineups page={page} view={view} />}
        {tab === "estatisticas" && <Numbers page={page} view={view} />}
        {tab === "confronto" && <HeadToHead page={page} />}
      </section>
    </div>
  );
}

type TabProps = { page: MatchPage; view: MatchView };

function Summary({ page, view }: TabProps) {
  const [lead, goals] = reportOf(page, view);
  // Only what is known goes in the clipping: a league abroad has no stadium, crowd or gate on record.
  const gate = venueLine(page).find((part) => part.startsWith("Renda"))?.replace("Renda ", "");
  const facts = [
    ["Estádio", page.venue.stadium],
    ["Público", page.venue.crowd ? new Intl.NumberFormat("pt-BR").format(page.venue.crowd) : null],
    ["Renda", gate],
    ["Árbitro", page.officials.referee && `${page.officials.referee}${page.officials.yellowsPerMatch ? ` · ${page.officials.yellowsPerMatch.toLocaleString("pt-BR")} amarelos por jogo` : ""}`],
  ].filter((fact): fact is [string, string] => !!fact[1]);
  return (
    <>
      <article className="mf-clip" aria-label="Jornal da rodada">
        <header>
          <span>Jornal da rodada · {page.competition}</span>
          <span>{formatDayMonth(page.date)}</span>
        </header>
        <h3>{headlineOf(page, view)}</h3>
        <p className="mf-deck">{lead}</p>
        <div className="mf-clip-score">
          <span>{page.home.club.shortName}</span>
          <b>
            {view.score.home} × {view.score.away}
          </b>
          <span>{page.away.club.shortName}</span>
        </div>
        {facts.length > 0 && (
          <dl style={{ ["--facts" as string]: facts.length }}>
            {facts.map(([term, value]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {goals && <p className={goals.length > LONG_COPY ? "mf-copy long" : "mf-copy"}>{goals}</p>}
      </article>
      <div className="mf-mid">
        <Pressure page={page} view={view} />
        <Incidents page={page} view={view} />
      </div>
      <aside className="mf-notes" aria-label="Curiosidades">
        {page.eggs.map((note, index) => (
          <EggNoteCard key={note.eggId} note={note} className="mf-note mf-egg" style={{ ["--i" as string]: index }} />
        ))}
        {page.curiosities.length === 0 && page.eggs.length === 0 ? (
          <p className="note mf-note">Nada fora do comum neste jogo.</p>
        ) : (
          page.curiosities.map((text, index) => (
            <p key={index} className="note mf-note" style={{ ["--i" as string]: page.eggs.length + index }}>
              <span className="lbl">Curiosidade</span>
              {text}
            </p>
          ))
        )}
      </aside>
    </>
  );
}

/** Each side's pressure per three minutes: the home side's bars above the line, the away side's below, goals pinned at their minute. */
function Pressure({ page, view }: TabProps) {
  const goals = view.events.filter((e) => e.kind === "goal");
  if (!page.play) return null;
  return (
    <section className="mf-pressure" aria-label="Pressão de ataque">
      <header>
        <h3>Pressão de ataque</h3>
        <small>
          a cada {PRESSURE_MINUTES} minutos · acima: {page.home.club.shortName} · abaixo: {page.away.club.shortName}
        </small>
      </header>
      <div className="mf-wave" style={{ ["--spells" as string]: view.end / PRESSURE_MINUTES }}>
        {Array.from({ length: view.end / PRESSURE_MINUTES }, (_, i) => (
          <span key={i} className={["spell", BREAK_SPELLS.includes(i) && "half", i >= view.pressure.home.length && "later"].filter(Boolean).join(" ")} style={{ ["--i" as string]: i }}>
            <i className="h" style={{ ["--v" as string]: view.pressure.home[i] ?? 0 }} />
            <i className="a" style={{ ["--v" as string]: view.pressure.away[i] ?? 0 }} />
          </span>
        ))}
        {goals.map((g, index) => (
          <span key={index} className={`mf-pin ${g.side}`} style={{ left: `clamp(14px, ${(g.minute / view.end) * 100}%, calc(100% - 14px))` }}>
            {g.minute}'
          </span>
        ))}
      </div>
      <div className="mf-axis" aria-hidden="true">
        {Array.from({ length: view.end / AXIS_STEP + 1 }, (_, i) => i * AXIS_STEP).map((m) => (
          <span key={m}>{m}'</span>
        ))}
      </div>
    </section>
  );
}

function Incidents({ page, view }: TabProps) {
  const name = (id: string) => page.names[id] ?? "Um jogador";
  const halves = [
    { label: "1º tempo", events: view.events.filter((e) => e.minute <= HALF_TIME) },
    { label: "2º tempo", events: view.events.filter((e) => e.minute > HALF_TIME && e.minute <= FULL_TIME) },
    { label: "Prorrogação", events: view.events.filter((e) => e.minute > FULL_TIME) },
  ].filter((half) => half.events.length > 0);
  return (
    <section className="mf-incidents" aria-label="Lances">
      <header>
        <h3>Lances</h3>
        <small>
          {page.home.club.shortName} à esquerda · {page.away.club.shortName} à direita
        </small>
      </header>
      {halves.length === 0 && <p className="mf-none">Nenhum lance ainda.</p>}
      {halves.map((half) => (
        <div key={half.label}>
          <h4>{half.label}</h4>
          <ol>
            {half.events.map((e, index) => (
              <li key={`${e.minute}-${e.kind}-${e.playerId}-${index}`} className={`${e.side} k-${e.kind}`}>
                {/* Each side reads outward from the minute: the home side's mark sits next to it on the right, the away side's on the left. */}
                <span className="who">
                  {e.side === "away" && <EventMark event={e} />}
                  <b>{name(e.playerId)}</b> <EventNote event={e} names={page.names} />
                  {e.side === "home" && <EventMark event={e} />}
                </span>
                <span className="mn">{e.minute}'</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

function EventNote({ event, names }: { event: PageEvent; names: Readonly<Record<string, string>> }) {
  const other = event.otherId ? (names[event.otherId] ?? "um jogador") : "";
  switch (event.kind) {
    case "goal":
      return <GoalNote event={event} names={names} />;
    case "substitution":
      return <small>no lugar de {other}</small>;
    case "penaltyMiss":
      return <small>{event.isSaved ? `pênalti defendido por ${other}` : "perde o pênalti"}</small>;
    case "injury":
      return <small className="hurt">lesão</small>;
    case "red":
      return <small>expulso</small>;
    case "yellow":
      return null;
    case "varCheck":
      return event.decision ? <small className="var">{VAR_NOTES[event.decision]}</small> : null;
    case "wrongCall":
      return event.call ? <small className="wrong">{WRONG_CALL_NOTES[event.call]}</small> : null;
  }
}

const VAR_NOTES: Record<VarDecision, string> = {
  goalStands: "VAR confirma o gol",
  goalRuledOut: "gol anulado pelo VAR",
  goalAwarded: "gol validado pelo VAR",
  penaltyAwarded: "pênalti marcado pelo VAR",
  penaltyCancelled: "pênalti desmarcado pelo VAR",
  redCardGiven: "vermelho após o VAR",
  redCardCancelled: "vermelho retirado pelo VAR",
};

const WRONG_CALL_NOTES: Record<WrongCallKind, string> = {
  goalShouldNotStand: "gol irregular validado",
  goalWronglyRuledOut: "gol legal anulado",
  penaltyWronglyGiven: "pênalti inexistente",
  penaltyNotGiven: "pênalti não marcado",
  redCardWronglyGiven: "expulsão injusta",
  redCardNotGiven: "merecia o vermelho",
};

function Lineups({ page, view }: TabProps) {
  const name = (id: string) => page.names[id] ?? "Um jogador";
  const cameOn = (id: string) => view.events.find((e) => e.kind === "substitution" && e.playerId === id)?.minute;
  const changes = view.events.filter((e) => e.kind === "substitution" || e.kind === "injury");
  const bench = (side: Side) => (
    <section className="mf-card mf-bench" aria-label={`${page[side].club.shortName}: reservas`}>
      <h3>
        <Crest club={page[side].club} size={20} />
        <span>Reservas · {page[side].club.shortName}</span>
      </h3>
      <ul>
        {page[side].bench.map((p) => (
          <li key={p.id}>
            <Position player={p} />
            <span className="nm">{p.name}</span>
            {cameOn(p.id) !== undefined ? <span className="in">entrou {cameOn(p.id)}'</span> : <span className="out">não entrou</span>}
          </li>
        ))}
        {page[side].bench.length === 0 && <li className="mf-none">Sem reservas.</li>}
      </ul>
    </section>
  );
  return (
    <>
      <div className="mf-card mf-field">
        <MatchPitch page={page} view={view} size="full" />
      </div>
      <div className="mf-side">
        {bench("home")}
        {bench("away")}
        <section className="mf-card mf-changes" aria-label="Substituições e lesões">
          <h3>Substituições e lesões</h3>
          <ul>
            {changes.map((e, index) => (
              <li key={index}>
                <EventMark event={e} />
                <span className="nm">
                  {e.minute}' {e.kind === "substitution" ? name(e.otherId ?? "") : name(e.playerId)}
                  {e.kind === "injury" && <small className="hurt"> lesão</small>}
                </span>
                {e.kind === "substitution" && <span className="in">→ {name(e.playerId)}</span>}
              </li>
            ))}
            {changes.length === 0 && <li className="mf-none">Ninguém saiu.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}

function Position({ player }: { player: PagePlayer }) {
  const letter = GROUP_LETTERS[player.group];
  return <span className={`pos ${letter}`}>{letter}</span>;
}

function Numbers({ page, view }: TabProps) {
  const marks = (side: Side) =>
    [...page[side].starters, ...page[side].bench]
      .flatMap((p) => (view.ratings?.[p.id] !== undefined ? [{ player: p, rating: view.ratings[p.id] ?? 0 }] : []))
      .sort((a, b) => b.rating - a.rating);
  return (
    <>
      <section className="mf-card mf-stats" aria-label="Números do jogo">
        <h3>
          <span>{page.home.club.shortName}</span>
          Números
          <span>{page.away.club.shortName}</span>
        </h3>
        {view.stats.map((line, index) => (
          <StatBar key={line.key} line={line} index={index} />
        ))}
      </section>
      {view.ratings ? (
        (["home", "away"] as const).map((side) => (
          <section key={side} className="mf-card mf-marks" aria-label={`Notas ${page[side].club.shortName}`}>
            <h3>
              <Crest club={page[side].club} size={20} />
              Notas · {page[side].club.shortName}
            </h3>
            <ol>
              {marks(side).map(({ player, rating }, index) => (
                <li key={player.id} style={{ ["--i" as string]: index }}>
                  <span className={markClass(rating)}>{formatMark(rating)}</span>
                  <Position player={player} />
                  <span className="nm">{player.name}</span>
                  {player.id === view.bestPlayerId && (
                    <span className="star">
                      <i className="ph-fill ph-star" aria-hidden="true" />
                      Craque
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))
      ) : (
        <section className="mf-card mf-marks waiting" aria-label="Notas">
          <h3>Notas</h3>
          <p className="mf-none">As notas dos dois times saem no apito final.</p>
        </section>
      )}
    </>
  );
}

function HeadToHead({ page }: { page: MatchPage }) {
  const club = (id: string) => (id === page.home.club.id ? page.home.club : page.away.club);
  const place = (side: Side) => page[side].place;
  return (
    <>
      <section className="mf-card mf-meetings" aria-label="Confrontos na temporada">
        <h3>Confrontos na temporada</h3>
        {page.meetings.length === 0 ? (
          <p className="mf-none">Primeiro encontro dos dois nesta temporada.</p>
        ) : (
          <ol>
            {page.meetings.map((m) => (
              <li key={m.date}>
                <span className="dt">{formatDayMonth(m.date)}</span>
                <span className="h">
                  {club(m.homeId).shortName}
                  <Crest club={club(m.homeId)} size={20} />
                </span>
                <b className="sbox">{m.homeGoals}</b>
                <b className="sbox">{m.awayGoals}</b>
                <span className="a">
                  <Crest club={club(m.awayId)} size={20} />
                  {club(m.awayId).shortName}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="mf-card mf-table" aria-label="Na tabela">
        <h3>Na tabela</h3>
        {!place("home") && !place("away") ? (
          <p className="mf-none">Jogo de mata-mata, fora de uma tabela.</p>
        ) : (
          <ul>
            {(["home", "away"] as const).map((side) => {
              const own = place(side);
              if (!own) return null;
              const moved = own.after === null ? 0 : own.before - own.after;
              return (
                <li key={side}>
                  <Crest club={page[side].club} size={28} />
                  <b>{page[side].club.shortName}</b>
                  <span className="mf-pl">{own.before}º</span>
                  <i className="ph-bold ph-arrow-right" aria-hidden="true" />
                  <span className={`mf-pl after${moved > 0 ? " up" : moved < 0 ? " down" : ""}`}>{own.after === null ? "—" : `${own.after}º`}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
