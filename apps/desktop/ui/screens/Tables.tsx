import { createContext, use, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { COPA_DO_BRASIL } from "@boleiro/engine/sim/copaDoBrasil";
import type { Competition, Fixture, GameState } from "@boleiro/engine/sim/gameState";
import { superCupScore, superCupWinner, type LeaguePhaseCup, type SuperCup } from "@boleiro/engine/sim/continental/uefaCups";
import { useServices } from "../app/ServicesContext.js";
import { WORLD_FACES, type ClubFace } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import { competitionName } from "@boleiro/game-client/format/competitionName";
import { formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { nextMatch } from "../hub/hubSelectors.js";
import { playRoundLabel, usePlayRound } from "../hub/usePlayRound.js";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import { springTiming } from "../motion/springEasing.js";
import { useFlip } from "../motion/useFlip.js";
import { Select } from "../controls/Select.js";
import { useMatchFile } from "../matchPage/MatchFile.js";
import { Bracket } from "../tables/Bracket.js";
import { GroupCard, NextTieCard, type NextTie } from "../tables/BracketCards.js";
import { uefaBracket, uefaLeaguePhase, uefaPlayoffs } from "../tables/uefaTables.js";
import {
  competitionStages,
  defaultStage,
  groupTables,
  knockoutBracket,
  knockoutTies,
  lastPlayedLeg,
  openingCompetitionId,
  playedRounds,
  tableTabs,
  topScorers,
  worldLeagueTables,
  zoneKeys,
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

const TABLES_KEYS = ["date", "season", "coachClubId", "clubs", "fixtures", "competitions", "calendar", "history", "players", "world", "europe"] as const;
type TablesState = Pick<GameState, (typeof TABLES_KEYS)[number]>;
type Clubs = Readonly<Record<string, ClubFace>>;

// South America's countries the game plays result-only, as Brazilians name them.
const SOUTH_AMERICA = [
  { id: "ar", name: "Argentina" },
  { id: "bo", name: "Bolívia" },
  { id: "cl", name: "Chile" },
  { id: "co", name: "Colômbia" },
  { id: "ec", name: "Equador" },
  { id: "py", name: "Paraguai" },
  { id: "pe", name: "Peru" },
  { id: "uy", name: "Uruguai" },
  { id: "ve", name: "Venezuela" },
];
// Europe's countries the game plays result-only, as Brazilians name them.
const EUROPE = [
  { id: "gb-eng", name: "Inglaterra" },
  { id: "es", name: "Espanha" },
  { id: "it", name: "Itália" },
  { id: "de", name: "Alemanha" },
  { id: "fr", name: "França" },
  { id: "pt", name: "Portugal" },
  { id: "nl", name: "Holanda" },
  { id: "tr", name: "Turquia" },
  { id: "be", name: "Bélgica" },
  { id: "gb-sct", name: "Escócia" },
  { id: "at", name: "Áustria" },
  { id: "gr", name: "Grécia" },
  { id: "cz", name: "Tchéquia" },
  { id: "hr", name: "Croácia" },
  { id: "ua", name: "Ucrânia" },
  { id: "pl", name: "Polônia" },
  { id: "no", name: "Noruega" },
  { id: "sk", name: "Eslováquia" },
  { id: "si", name: "Eslovênia" },
  { id: "hu", name: "Hungria" },
  { id: "bg", name: "Bulgária" },
  { id: "cy", name: "Chipre" },
  { id: "am", name: "Armênia" },
  { id: "il", name: "Israel" },
  { id: "az", name: "Azerbaijão" },
];
// The market leagues, as Brazilians name their countries.
const MARKET_LEAGUES = [
  { id: "sa", name: "Arábia Saudita" },
  { id: "us", name: "Estados Unidos" },
  { id: "mx", name: "México" },
];
const UEFA_NAMES: Record<LeaguePhaseCup["cup"], string> = { "champions-league": "Champions League", "europa-league": "Europa League" };
/** A UEFA cup is picked under "Outras ligas" by this id. */
const uefaPick = (cup: LeaguePhaseCup["cup"]) => `uefa:${cup}`;
/** A country's leagues are picked under "Outras ligas" by this id, apart from the competitions'. */
const worldPick = (countryId: string) => `world:${countryId}`;

const SCORERS_SHOWN = 7;
// Up to two groups fit one under the other; more get a picker.
const GROUPS_SHOWN_TOGETHER = 2;
const OTHER_LEAGUES = "Outras ligas";

/** What the screen shows of a competition: its stage, and the round picked on the stepper (null: the latest). */
type View = { stage: number; round: number | null };

/** Opens a match's ficha from anywhere in the tables: a club's form marks are its last matches. */
const OpenMatchContext = createContext<(matchRef: string) => void>(() => undefined);

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
  const matchFile = useMatchFile();

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

  const { tabs, otherStates, southAmerica, europe, markets, clubs } = useMemo(() => {
    if (!state) return { tabs: [], otherStates: [], southAmerica: [], europe: [], markets: [], clubs: WORLD_FACES };
    const found = tableTabs(state);
    return {
      tabs: found.tabs,
      otherStates: found.otherStates.toSorted(byName),
      // A country in the full tier shows its leagues with the game's own tables, not as a result-only one.
      southAmerica: SOUTH_AMERICA.filter((country) => state.world?.[country.id] && !state.world[country.id]?.isFullTier),
      europe: EUROPE.filter((country) => state.world?.[country.id] && !state.world[country.id]?.isFullTier),
      markets: MARKET_LEAGUES.filter((country) => state.world?.[country.id] && !state.world[country.id]?.isFullTier),
      clubs: { ...WORLD_FACES, ...state.clubs },
    };
  }, [state]);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state) return <p className="status">Abrindo as tabelas…</p>;

  const all = [...tabs, ...otherStates];
  const countries = [...southAmerica, ...europe, ...markets];
  const uefaCups = state.europe?.cups ?? [];
  const others = [...otherStates.map((c) => c.id), ...countries.map((c) => worldPick(c.id)), ...uefaCups.map((c) => uefaPick(c.cup))];
  const nextId = nextMatch(state)?.fixture.competitionId;
  const pick = pickedId ?? openingCompetitionId(state, nextId);
  const country = countries.find((c) => worldPick(c.id) === pick) ?? null;
  const uefaCup = uefaCups.find((c) => uefaPick(c.cup) === pick) ?? null;
  const shown = country || uefaCup ? undefined : (all.find((c) => c.id === pick) ?? tabs[0]);
  const isOther = country !== null || uefaCup !== null || otherStates.some((c) => c.id === shown?.id);
  const openOthers = () => setPickedId(otherId ?? others[0] ?? null);
  const view = shown ? (views[shown.id] ?? { stage: defaultStage(shown, state.coachClubId), round: null }) : null;
  const latestRound = shown && view ? playedRounds(shown, view.stage, state.fixtures) : 0;
  const round = Math.min(view?.round ?? latestRound, latestRound);
  const showView = (next: View) => shown && setViews({ ...views, [shown.id]: next });
  const countryTables = country ? worldLeagueTables(state, country.id) : [];
  const countryZones = zoneKeys(countryTables);
  const picker = isOther && (
    <Select
      label="Liga"
      value={pick ?? ""}
      options={[
        ...otherStates.map((c) => ({ value: c.id, label: competitionName(c), group: "Estaduais" })),
        ...southAmerica.map((c) => ({ value: worldPick(c.id), label: c.name, group: "América do Sul" })),
        ...uefaCups.map((c) => ({ value: uefaPick(c.cup), label: UEFA_NAMES[c.cup], group: "Copas europeias" })),
        ...europe.map((c) => ({ value: worldPick(c.id), label: c.name, group: "Europa" })),
        ...markets.map((c) => ({ value: worldPick(c.id), label: c.name, group: "Ásia e América do Norte" })),
      ]}
      onChange={(value) => {
        setOtherId(value);
        setPickedId(value);
      }}
    />
  );

  return (
    <OpenMatchContext value={matchFile.open}>
    <div className="tables fills-screen">
      <h1 className="sr-only">Tabelas</h1>
      <header className="tables-head">
        <div className="seg tables-seg tables-tabs" role="tablist" aria-label="Competições">
          {tabs.map((c) => (
            <button key={c.id} role="tab" aria-selected={c.id === shown?.id} onClick={() => setPickedId(c.id)}>
              {competitionName(c)}
            </button>
          ))}
          {others.length > 0 && (
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
      {country && (
        <div className="tables-body" role="tabpanel" aria-label={country.name}>
          <section className="tables-main">
            <div className="tables-sub">{picker}</div>
            <GroupStage key={country.id} name={country.name} groups={countryTables} clubs={clubs} coachClubId={state.coachClubId} />
          </section>
          <aside className="tables-side" key={country.id}>
            {countryZones.length > 0 && <ZoneKeySticker zones={countryZones} groups={countryTables} />}
          </aside>
        </div>
      )}
      {uefaCup && <UefaPanel key={uefaCup.cup} cup={uefaCup} superCup={state.europe?.superCup ?? null} clubs={clubs} coachClubId={state.coachClubId} picker={picker} />}
      {shown && view && (
        <CompetitionPanel
          competition={shown}
          state={state}
          clubs={clubs}
          stage={view.stage}
          round={view.round === null ? null : round}
          onStage={(stage) => showView({ stage, round: null })}
          picker={picker}
        />
      )}
      {matchFile.file}
    </div>
    </OpenMatchContext>
  );
}

type PanelProps = { competition: Competition; state: TablesState; clubs: Clubs; stage: number; round: number | null; onStage: (stage: number) => void; picker: ReactNode };

type StageTab = ReturnType<typeof competitionStages>[number];

/** The competition's stages as a segmented control; a stage not drawn yet can't be picked. */
function StagePicker({ stages, stage, onStage }: { stages: StageTab[]; stage: number; onStage: (stage: number) => void }) {
  return (
    <div className="seg tables-seg" role="group" aria-label="Fases">
      {stages.map((s) => (
        <button key={s.index} aria-pressed={s.index === stage} disabled={!s.isDrawn} onClick={() => onStage(s.index)}>
          {s.name}
        </button>
      ))}
    </div>
  );
}

// What winning the tie leads to, by the name of the round after it.
const NEXT_ROUND: Record<string, string> = { Quartas: "quem passar joga as quartas", Semifinal: "quem passar joga a semifinal", Final: "quem passar joga a final" };

/** The coach's next match in the cup, for the card under the bracket. */
function nextTieOf(competition: Competition, fixtures: readonly Fixture[], stages: readonly StageTab[], clubs: Clubs, coachClubId: string | null): NextTie {
  const own = fixtures.filter((f) => f.competitionId === competition.id && coachClubId !== null && (f.homeId === coachClubId || f.awayId === coachClubId));
  const next = own.filter((f) => !f.result).toSorted((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return { title: "Seu clube", sub: "mata-mata", none: own.length ? "Seu clube não tem mais jogos nesta copa." : "Seu clube não joga esta copa." };
  const stageName = stages[next.stage]?.name ?? "";
  const legs = fixtures.filter((f) => f.competitionId === competition.id && f.stage === next.stage && f.tie === next.tie).toSorted((a, b) => a.date.localeCompare(b.date));
  const [first] = legs;
  const isReturn = legs.length > 1 && first !== undefined && first.id !== next.id;
  const firstLeg = isReturn && first.result ? `${clubs[first.homeId]?.shortName ?? first.homeId} ${first.result.homeGoals} × ${first.result.awayGoals} ${clubs[first.awayId]?.shortName ?? first.awayId}` : null;
  const isFinal = next.stage === stages.length - 1;
  return {
    title: legs.length > 1 ? `${stageName}, ${isReturn ? "volta" : "ida"}` : stageName,
    sub: isFinal ? "quem vencer é campeão" : (NEXT_ROUND[stages[next.stage + 1]?.name ?? ""] ?? "quem passar segue no mata-mata"),
    homeId: next.homeId,
    awayId: next.awayId,
    date: next.date,
    firstLeg,
    isTwoLegged: legs.length > 1,
  };
}

/** A continental cup from its round of 16: the whole bracket, the coach's group as it ended and his next tie. */
function BracketPanel({ competition, state, clubs, stage, onStage, picker }: Omit<PanelProps, "round">) {
  const onOpenMatch = use(OpenMatchContext);
  const stages = competitionStages(competition, state.calendar);
  const name = competitionName(competition);
  const groupsAt = competition.stages.findIndex((s) => s.kind === "groups");
  const groups = groupsAt >= 0 ? groupTables(competition, groupsAt, state.fixtures).groups : [];
  const group = groups.find((g) => g.rows.some((row) => row.clubId === state.coachClubId)) ?? groups[0];
  return (
    <div className="tables-body wide" role="tabpanel" aria-label={name}>
      <section className="tables-main">
        <div className="tables-sub">
          {picker}
          <StagePicker stages={stages} stage={stage} onStage={onStage} />
          <h2 className="bk-title">
            {name} {competition.season}
            <span>mata-mata</span>
          </h2>
        </div>
        <Bracket name={name} rounds={knockoutBracket(competition, state.fixtures)} clubs={clubs} coachClubId={state.coachClubId} onOpenMatch={onOpenMatch} />
        <div className="bk-low">
          {group && <GroupCard group={group} clubs={clubs} coachClubId={state.coachClubId} />}
          <NextTieCard next={nextTieOf(competition, state.fixtures, stages, clubs, state.coachClubId)} clubs={clubs} />
        </div>
      </section>
    </div>
  );
}

const UEFA_STAGES = ["Fase de liga", "Playoffs", "Mata-mata"] as const;

/** The Super Cup of the season, as a line: its clubs, and its score once played. */
function superCupLine(superCup: SuperCup, clubs: Clubs): string {
  const [home, away] = superCup.clubIds.map((id) => clubs[id]?.shortName ?? id);
  const winner = superCupWinner(superCup);
  const score = superCupScore(superCup);
  if (!winner || !score) return `${home} × ${away}, ${formatDayMonth(superCup.date)}`;
  const onPenalties = score.homeGoals === score.awayGoals ? `, ${clubs[winner]?.shortName ?? winner} nos pênaltis` : "";
  return `${home} ${score.homeGoals} × ${score.awayGoals} ${away}${onPenalties}`;
}

/** A UEFA cup played result-only: its league phase table, its knockout play-offs, or its bracket from the round of 16. */
function UefaPanel({ cup, superCup, clubs, coachClubId, picker }: { cup: LeaguePhaseCup; superCup: SuperCup | null; clubs: Clubs; coachClubId: string | null; picker: ReactNode }) {
  const playoffs = uefaPlayoffs(cup);
  const bracket = uefaBracket(cup);
  const latest = bracket.length > 0 ? 2 : playoffs.length > 0 ? 1 : 0;
  const [stage, setStage] = useState(latest);
  const name = UEFA_NAMES[cup.cup];
  const isDrawn = [true, playoffs.length > 0, bracket.length > 0];
  const phase = uefaLeaguePhase(cup);
  return (
    <div className={stage === 2 ? "tables-body wide" : "tables-body"} role="tabpanel" aria-label={name}>
      <section className="tables-main">
        <div className="tables-sub">
          {picker}
          <StagePicker stages={UEFA_STAGES.map((stageName, index) => ({ index, name: stageName, isDrawn: isDrawn[index] ?? false }))} stage={stage} onStage={setStage} />
          {stage === 2 && (
            <h2 className="bk-title">
              {name} {cup.season}/{String(cup.season + 1).slice(2)}
              <span>mata-mata</span>
            </h2>
          )}
        </div>
        {stage === 0 && <GroupStage key={`${cup.cup}-phase`} name={UEFA_STAGES[0]} groups={phase.groups} clubs={clubs} coachClubId={coachClubId} />}
        {stage === 1 && <TieList key={`${cup.cup}-playoffs`} name={UEFA_STAGES[1]} ties={playoffs} clubs={clubs} coachClubId={coachClubId} />}
        {stage === 2 && <Bracket name={name} rounds={bracket} clubs={clubs} coachClubId={coachClubId} />}
      </section>
      {stage !== 2 && (
        <aside className="tables-side">
          {stage === 0 && phase.zones.length > 0 && <ZoneKeySticker zones={phase.zones} groups={phase.groups} />}
          {superCup && (
            <section className="stk tables-zones" aria-labelledby="super-cup-title">
              <h2 id="super-cup-title">Supercopa da UEFA</h2>
              <p className="tables-none">{superCupLine(superCup, clubs)}</p>
            </section>
          )}
        </aside>
      )}
    </div>
  );
}

/** The shown competition's stage: its table or ties, with its scorers and zones beside them; a continental cup's bracket from its round of 16. */
function CompetitionPanel({ competition, state, clubs, stage, round, onStage, picker }: PanelProps) {
  const onOpenMatch = use(OpenMatchContext);
  if (knockoutBracket(competition, state.fixtures).some((r) => r.stage === stage)) {
    return <BracketPanel competition={competition} state={state} clubs={clubs} stage={stage} onStage={onStage} picker={picker} />;
  }
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
            {stages.length > 1 && <StagePicker stages={stages} stage={stage} onStage={onStage} />}
          </div>
        )}
        {table ? (
          <GroupStage key={pageKey} name={name} groups={table.groups} clubs={clubs} coachClubId={state.coachClubId} />
        ) : (
          <TieList key={pageKey} name={stages[stage]?.name ?? name} ties={knockoutTies(competition, stage, state.fixtures)} clubs={clubs} coachClubId={state.coachClubId} onOpenMatch={onOpenMatch} />
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
                const club = clubs[s.clubId];
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
  const onOpenMatch = use(OpenMatchContext);
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
                  {row.form.map((outcome, i) => {
                    const ref = row.formRefs?.[i];
                    return ref ? (
                      <button key={i} type="button" className={outcome} title={`${OUTCOMES[outcome].word}: ver a ficha do jogo`} aria-label={`${OUTCOMES[outcome].word}, ficha do jogo`} onClick={() => onOpenMatch(ref)}>
                        {OUTCOMES[outcome].letter}
                      </button>
                    ) : (
                      <i key={i} className={outcome} title={OUTCOMES[outcome].word}>
                        {OUTCOMES[outcome].letter}
                      </i>
                    );
                  })}
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

/** The cup's ties; with `onOpenMatch`, a tie with a game played opens its latest game's ficha. */
function TieList({ name, ties, clubs, coachClubId, onOpenMatch }: { name: string; ties: TieView[]; clubs: Clubs; coachClubId: string | null; onOpenMatch?: (matchRef: string) => void }) {
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
          const played = onOpenMatch && lastPlayedLeg(tie);
          return (
            <li key={`${first}-${second}`} className={isMine ? "tie mine" : "tie"}>
              {played && (
                <button
                  type="button"
                  className="tie-open"
                  aria-label={`Ficha do jogo: ${clubs[played.homeId]?.shortName ?? played.homeId} x ${clubs[played.awayId]?.shortName ?? played.awayId}`}
                  onClick={() => onOpenMatch(played.fixtureId)}
                />
              )}
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
