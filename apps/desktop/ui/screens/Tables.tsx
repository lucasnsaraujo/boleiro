import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import type { Club } from "@boleiro/data/clubs";
import { COPA_DO_BRASIL } from "@boleiro/engine/sim/copaDoBrasil";
import type { Competition, GameState } from "@boleiro/engine/sim/gameState";
import { useServices } from "../app/ServicesContext.js";
import { Crest } from "../clubs/Crest.js";
import { competitionName } from "@boleiro/game-client/format/competitionName";
import { formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { nextMatch } from "../hub/hubSelectors.js";
import { playRoundLabel, usePlayRound } from "../hub/usePlayRound.js";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import { springTiming } from "../motion/springEasing.js";
import { useFlip } from "../motion/useFlip.js";
import {
  competitionStages,
  defaultStage,
  groupTables,
  knockoutTies,
  openingCompetitionId,
  playedRounds,
  tableTabs,
  topScorers,
  type GroupTable,
  type Outcome,
  type TieView,
  type ZoneKey,
} from "../tables/competitionTables.js";
import "./tables.css";

const copaFinalists = (competitions: readonly Competition[], fixtures: GameState["fixtures"]) => {
  const copa = competitions.find((c) => c.kind === "cup");
  return copa?.kind === "cup" ? COPA_DO_BRASIL.finalists(copa, fixtures) : null;
};

const TABLES_KEYS = ["date", "season", "coachClubId", "clubs", "fixtures", "competitions", "calendar", "history", "players"] as const;
type TablesState = Pick<GameState, (typeof TABLES_KEYS)[number]>;
type Clubs = Readonly<Record<string, Club>>;

const SCORERS_SHOWN = 7;
// Up to two groups fit one under the other; more get a picker.
const GROUPS_SHOWN_TOGETHER = 2;
const OTHER_LEAGUES = "Outras ligas";

/** What the screen shows of a competition: its stage, and the round picked on the stepper (null: the latest). */
type View = { stage: number; round: number | null };

const byName = (a: Competition, b: Competition) => competitionName(a).localeCompare(competitionName(b), "pt-BR");

export function Tables() {
  const { engine } = useServices();
  const navigate = useNavigate();
  const [state, setState] = useState<TablesState | null>(null);
  const [failed, setFailed] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [otherId, setOtherId] = useState<string | null>(null);
  const [views, setViews] = useState<Readonly<Record<string, View>>>({});
  const playRound = usePlayRound(() => navigate("/hub"));

  useEffect(() => {
    let current = true;
    engine.read(TABLES_KEYS).then(
      (read) => current && setState(read),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  const { tabs, otherStates } = useMemo(() => {
    if (!state) return { tabs: [], otherStates: [] };
    const found = tableTabs(state);
    return { tabs: found.tabs, otherStates: found.otherStates.toSorted(byName) };
  }, [state]);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state) return <p className="status">Abrindo as tabelas…</p>;

  const all = [...tabs, ...otherStates];
  const nextId = nextMatch(state)?.fixture.competitionId;
  const shown = all.find((c) => c.id === (pickedId ?? openingCompetitionId(state, nextId))) ?? tabs[0];
  const isOther = otherStates.some((c) => c.id === shown?.id);
  const openOthers = () => setPickedId(otherId ?? otherStates[0]?.id ?? null);
  const view = shown ? (views[shown.id] ?? { stage: defaultStage(shown, state.coachClubId), round: null }) : null;
  const latestRound = shown && view ? playedRounds(shown, view.stage, state.fixtures) : 0;
  const round = Math.min(view?.round ?? latestRound, latestRound);
  const showView = (next: View) => shown && setViews({ ...views, [shown.id]: next });

  return (
    <div className="tables fills-screen">
      <h1 className="sr-only">Tabelas</h1>
      <header className="tables-head">
        <div className="seg tables-seg tables-tabs" role="tablist" aria-label="Competições">
          {tabs.map((c) => (
            <button key={c.id} role="tab" aria-selected={c.id === shown?.id} onClick={() => setPickedId(c.id)}>
              {competitionName(c)}
            </button>
          ))}
          {otherStates.length > 0 && (
            <button role="tab" aria-selected={isOther} onClick={openOthers}>
              {OTHER_LEAGUES}
            </button>
          )}
        </div>
        {view && latestRound > 0 && <RoundStepper round={round} latest={latestRound} onPick={(picked) => showView({ ...view, round: picked })} />}
        <div className="tables-play">
          {playRound.hasFailed && <p className="status error">A rodada não andou.</p>}
          <button className="btn sm y" onClick={() => void playRound.play()} disabled={playRound.isPlaying}>
            <i className={state.coachClubId ? "ph-bold ph-soccer-ball" : "ph-bold ph-hourglass-medium"} aria-hidden="true" />
            {playRoundLabel(playRound.isPlaying, state.coachClubId !== null)}
          </button>
        </div>
      </header>
      {shown && view && (
        <CompetitionPanel
          competition={shown}
          state={state}
          stage={view.stage}
          round={view.round === null ? null : round}
          onStage={(stage) => showView({ stage, round: null })}
          picker={
            isOther && (
              <label className="field tables-state">
                <small>Estadual</small>
                <select
                  value={shown.id}
                  onChange={(event) => {
                    setOtherId(event.target.value);
                    setPickedId(event.target.value);
                  }}
                >
                  {otherStates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {competitionName(c)}
                    </option>
                  ))}
                </select>
                <i className="ph-bold ph-caret-down" aria-hidden="true" />
              </label>
            )
          }
        />
      )}
    </div>
  );
}

type PanelProps = { competition: Competition; state: TablesState; stage: number; round: number | null; onStage: (stage: number) => void; picker: ReactNode };

/** The shown competition's stage: its table or ties, with its scorers and zones beside them. */
function CompetitionPanel({ competition, state, stage, round, onStage, picker }: PanelProps) {
  const stages = competitionStages(competition, state.calendar);
  const scorers = topScorers(competition, state, SCORERS_SHOWN);
  const name = competitionName(competition);
  const table =
    competition.stages[stage]?.kind === "knockout"
      ? null
      : groupTables(competition, stage, state.fixtures, copaFinalists(Object.values(state.competitions), state.fixtures), round);
  // A new competition or stage draws its page afresh.
  const pageKey = `${competition.id}-${stage}`;

  return (
    <div className="tables-body" role="tabpanel" aria-label={name}>
      <section className="tables-main">
        {(stages.length > 1 || picker) && (
          <div className="tables-sub">
            {picker}
            {stages.length > 1 && (
              <div className="seg tables-seg" role="group" aria-label="Fases">
                {stages.map((s) => (
                  <button key={s.index} aria-pressed={s.index === stage} disabled={!s.isDrawn} onClick={() => onStage(s.index)}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {table ? (
          <GroupStage key={pageKey} name={name} groups={table.groups} clubs={state.clubs} coachClubId={state.coachClubId} />
        ) : (
          <TieList key={pageKey} name={stages[stage]?.name ?? name} ties={knockoutTies(competition, stage, state.fixtures)} clubs={state.clubs} coachClubId={state.coachClubId} />
        )}
      </section>
      <aside className="tables-side" key={competition.id}>
        <section className="stk tables-scorers" aria-labelledby="scorers-title">
          <h2 id="scorers-title">Artilharia</h2>
          {scorers.length === 0 ? (
            <p className="tables-none">Ninguém marcou ainda.</p>
          ) : (
            <ol aria-labelledby="scorers-title">
              {scorers.map((s, i) => {
                const club = state.clubs[s.clubId];
                return (
                  <li key={s.playerId} className={s.clubId === state.coachClubId ? "mine" : undefined}>
                    <span className="tables-rank">{i + 1}</span>
                    {club ? <Crest club={club} size={22} /> : <span />}
                    <span className="tables-who">
                      <Link to={`/squad/${s.playerId}`}>{s.name}</Link>
                      <small>{club?.shortName ?? s.clubId}</small>
                    </span>
                    <span className="tables-goals">{s.goals}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
        {table && table.zones.length > 0 && <ZoneKeySticker zones={table.zones} groups={table.groups} />}
      </aside>
    </div>
  );
}

function RoundStepper({ round, latest, onPick }: { round: number; latest: number; onPick: (round: number) => void }) {
  return (
    <div className="tables-round" role="group" aria-label="Rodada">
      <button className="tables-step" aria-label="Rodada anterior" disabled={round <= 1} onClick={() => onPick(round - 1)}>
        <i className="ph-bold ph-caret-left" aria-hidden="true" />
      </button>
      <b aria-live="polite">{round}ª rodada</b>
      <button className="tables-step" aria-label="Próxima rodada" disabled={round >= latest} onClick={() => onPick(round + 1)}>
        <i className="ph-bold ph-caret-right" aria-hidden="true" />
      </button>
    </div>
  );
}

/** The zones of the table, each with the first place that reaches it. */
function ZoneKeySticker({ zones, groups }: { zones: ZoneKey[]; groups: GroupTable[] }) {
  const rows = groups.flatMap((g) => g.rows);
  return (
    <section className="stk tables-zones" aria-labelledby="zones-title">
      <h2 id="zones-title">Vagas</h2>
      <ul>
        {zones.map((z) => (
          <li key={z.zone}>
            <span className={`zn zone-${z.zone}`} aria-hidden="true">
              {rows.find((row) => row.zone === z.zone)?.position}
            </span>
            <span>{z.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type GroupStageProps = { name: string; groups: GroupTable[]; clubs: Clubs; coachClubId: string | null };

function GroupStage({ name, groups, clubs, coachClubId }: GroupStageProps) {
  const ownGroup = Math.max(0, coachClubId ? groups.findIndex((g) => g.rows.some((row) => row.clubId === coachClubId)) : 0);
  const [picked, setPicked] = useState(ownGroup);
  const hasPicker = groups.length > GROUPS_SHOWN_TOGETHER;
  const shown = hasPicker ? groups.slice(picked, picked + 1) : groups;

  return (
    <>
      {hasPicker && (
        <div className="seg tables-seg tables-groups" role="group" aria-label="Grupos">
          {groups.map((g, i) => (
            <button key={g.label} aria-label={g.label ?? undefined} aria-pressed={i === picked} onClick={() => setPicked(i)}>
              {g.label?.replace("Grupo ", "")}
            </button>
          ))}
        </div>
      )}
      <div className="page tables-sheet">
        {shown.map((group) => (
          <StandingsTable key={group.label ?? name} label={group.label ?? name} group={group} clubs={clubs} coachClubId={coachClubId} />
        ))}
      </div>
    </>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

const OUTCOMES: Record<Outcome, { letter: string; word: string }> = {
  win: { letter: "V", word: "Vitória" },
  draw: { letter: "E", word: "Empate" },
  loss: { letter: "D", word: "Derrota" },
};

// Damping ratio 0.94: rows settle with weight and no visible overshoot, as in the squad table.
const ROW_SLIDE = springTiming({ stiffness: 500, damping: 42 });
// A moving row rides one layer higher for each row it travels, up to 9, under the sticky header (tables.css) at 10.
const ROW_HEIGHT = 28;
const ROW_LAYERS = 9;

/**
 * A row that changed place between two rounds slides from where it was, lifted with a shadow; the farther it
 * travels the higher it rides over the others. With reduced motion it only fades back in.
 */
function slideStandingsRow(row: HTMLElement, offset: number) {
  if (typeof row.animate !== "function") return;
  if (prefersReducedMotion()) {
    row.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
    return;
  }
  const zIndex = String(Math.min(ROW_LAYERS, 1 + Math.round(Math.abs(offset) / ROW_HEIGHT)));
  row.animate(
    [
      { transform: `translateY(${offset}px)`, boxShadow: "0 10px 22px rgba(20, 35, 26, 0.28)", zIndex },
      { transform: "none", boxShadow: "0 0 0 rgba(20, 35, 26, 0)", zIndex },
    ],
    ROW_SLIDE,
  );
}

function Movement({ places }: { places: number }) {
  if (places === 0) return null;
  const isUp = places > 0;
  return (
    <span className={isUp ? "mv up" : "mv dn"} title={`${isUp ? "Subiu" : "Caiu"} ${Math.abs(places)} na última rodada`}>
      <i className={isUp ? "ph-fill ph-caret-up" : "ph-fill ph-caret-down"} aria-hidden="true" />
      {Math.abs(places)}
    </span>
  );
}

function StandingsTable({ label, group, clubs, coachClubId }: { label: string; group: GroupTable; clubs: Clubs; coachClubId: string | null }) {
  const table = useRef<HTMLTableElement>(null);
  useFlip(table, group.rows.map((row) => row.clubId).join(), slideStandingsRow);
  return (
    <table ref={table} className="tb standings" aria-label={label}>
      {group.label && <caption>{group.label}</caption>}
      <thead>
        <tr>
          <th scope="col" className="st-pos">
            #
          </th>
          <th scope="col" className="l">
            Clube
          </th>
          <th scope="col" title="Pontos">
            P
          </th>
          <th scope="col" title="Jogos">
            J
          </th>
          <th scope="col" title="Vitórias">
            V
          </th>
          <th scope="col" title="Empates">
            E
          </th>
          <th scope="col" title="Derrotas">
            D
          </th>
          <th scope="col" title="Gols pró">
            GP
          </th>
          <th scope="col" title="Gols contra">
            GC
          </th>
          <th scope="col" title="Saldo de gols">
            SG
          </th>
          <th scope="col" className="l st-form">
            Últimos 5
          </th>
          <th scope="col" className="st-mv">
            <span className="sr-only">Movimento</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {group.rows.map((row) => {
          const club = clubs[row.clubId];
          const isMine = row.clubId === coachClubId;
          return (
            <tr key={row.clubId} data-flip={row.clubId} className={isMine ? "me" : undefined} aria-current={isMine ? "true" : undefined}>
              <td className="st-pos">
                <span className={row.zone ? `zn zone-${row.zone}` : "zn"}>{row.position}</span>
              </td>
              <td className="l st-club">
                <span className="st-club-in">
                  {club && <Crest club={club} size={20} />}
                  <span>{club?.shortName ?? row.clubId}</span>
                </span>
              </td>
              <td className="st-pts">{row.points}</td>
              <td>{row.played}</td>
              <td>{row.wins}</td>
              <td>{row.draws}</td>
              <td>{row.losses}</td>
              <td>{row.goalsFor}</td>
              <td>{row.goalsAgainst}</td>
              <td>{signed(row.goalDifference)}</td>
              <td className="l st-form">
                <span className="form">
                  {row.form.map((outcome, i) => (
                    <i key={i} className={outcome} title={OUTCOMES[outcome].word}>
                      {OUTCOMES[outcome].letter}
                    </i>
                  ))}
                </span>
              </td>
              <td className="st-mv">
                <Movement places={row.movement} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const LEG_NAMES = ["Ida", "Volta"];

/** A leg's score from the first club's side, so it reads the same way as the aggregate. */
function legLine(tie: TieView): string {
  const [first] = tie.clubIds;
  return tie.legs
    .map((leg, i) => {
      const legName = tie.legs.length > 1 ? `${LEG_NAMES[i] ?? `${i + 1}º jogo`} ` : "";
      if (leg.homeGoals === null || leg.awayGoals === null) return `${legName}${formatDayMonth(leg.date)}`;
      const [mine, theirs] = leg.homeId === first ? [leg.homeGoals, leg.awayGoals] : [leg.awayGoals, leg.homeGoals];
      return `${legName}${mine} x ${theirs}`;
    })
    .join(" · ");
}

function TieList({ name, ties, clubs, coachClubId }: { name: string; ties: TieView[]; clubs: Clubs; coachClubId: string | null }) {
  const side = (clubId: string, tie: TieView, home: boolean) => {
    const club = clubs[clubId];
    const outcome = tie.winnerId === null ? "" : tie.winnerId === clubId ? " won" : " lost";
    return (
      <span className={`tie-side${home ? " home" : ""}${clubId === coachClubId ? " own" : ""}${outcome}`}>
        {home && <span className="tie-name">{club?.shortName ?? clubId}</span>}
        {club && <Crest club={club} size={22} />}
        {!home && <span className="tie-name">{club?.shortName ?? clubId}</span>}
      </span>
    );
  };
  return (
    <div className="page tables-sheet">
      <ul className="ties" aria-label={name}>
        {ties.map((tie) => {
          const [first, second] = tie.clubIds;
          const isMine = coachClubId !== null && tie.clubIds.includes(coachClubId);
          return (
            <li key={`${first}-${second}`} className={isMine ? "tie mine" : "tie"}>
              {side(first, tie, true)}
              <span className="tie-score">
                <span className={tie.aggregate ? "sbox" : "sbox x"}>{tie.aggregate?.[0] ?? ""}</span>
                <span className={tie.aggregate ? "sbox" : "sbox x"}>{tie.aggregate?.[1] ?? ""}</span>
              </span>
              {side(second, tie, false)}
              <span className="tie-legs">
                {tie.isPlayoff && "Repescagem · "}
                {legLine(tie)}
                {tie.onPenalties && " · pên."}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
