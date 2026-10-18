import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { OpenJob } from "@boleiro/engine/sim/coach/jobCentre";
import { RESIGN_COOLDOWN_SEASONS, RESIGN_REPUTATION_COST } from "@boleiro/engine/sim/coach/resign";
import type { GameState } from "@boleiro/engine/sim/gameState";
import type { CoachesPage, CoachProfile, RankedClub, RankedCoach } from "@boleiro/game-client/coaches/coachesPage";
import { formatMonthYear } from "@boleiro/game-client/format/formatGameDate";
import { useServices } from "../app/ServicesContext.js";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { clubFaceOf, plateColours, type ClubFace } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import { answerText, countryName, exitWord, nationalityName, jobRefusalText, STYLE_WORDS, titleName } from "../coaches/coachWords.js";
import { Select } from "../controls/Select.js";
import { usePlayRound } from "../hub/usePlayRound.js";
import { useFlip } from "../motion/useFlip.js";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import "./coaches.css";
import { clubArticle, withArticle } from "@boleiro/data/articles";

const KEYS = ["date", "season", "coachClubId", "clubs", "coach"] as const;
type CoachesState = Pick<GameState, (typeof KEYS)[number]>;
type Loaded = { page: CoachesPage; before: ReadonlyMap<string, number>; state: CoachesState; isRoundUnderWay: boolean };

const TABS = [
  { id: "tecnicos", title: "Técnicos" },
  { id: "cbf", title: "Ranking CBF" },
  { id: "mundial", title: "Ranking mundial" },
  { id: "vagas", title: "Vagas" },
] as const;
type TabId = (typeof TABS)[number]["id"];
const TAB_PARAM = "aba";
const isTabId = (value: string | null): value is TabId => TABS.some((tab) => tab.id === value);

// The rows that come in one after another when a tab opens; the rest arrive with the last.
const STAGGERED_ROWS = 16;
// FLIP tints for a coach who climbed or fell when the season steps (Round.tsx's table uses the same idea).
const ROSE = "color-mix(in srgb, var(--green) 22%, transparent)";
const FELL = "color-mix(in srgb, var(--red) 18%, transparent)";
const EXPO_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

const points = (n: number) => n.toLocaleString("pt-BR");
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const DAY_MS = 86_400_000;

/** Two letters for a person: the first of the first and last names ("Abel Ferreira" gives AF). */
export function personInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "?";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : (words[0]?.[1] ?? "");
  return `${first}${last}`.toUpperCase();
}

function slideRow(row: HTMLElement, offset: number) {
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
    { duration: 1100, easing: EXPO_OUT, fill: "backwards" },
  );
}

/** Técnicos (F7): the coach and club rankings, the job centre and every coach's career. */
export function Coaches() {
  const { engine, game } = useServices();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const asked = params.get(TAB_PARAM);
  const tab: TabId = isTabId(asked) ? asked : "tecnicos";
  const [season, setSeason] = useState<number | undefined>(undefined);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<CoachProfile | null>(null);
  const [isResigning, setResigning] = useState(false);
  const [isRetiring, setRetiring] = useState(false);
  const [note, setNote] = useState<{ id: number; text: string; isError: boolean } | null>(null);
  const [stamped, setStamped] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);
  const wait = usePlayRound(() => navigate("/offers"));

  const load = useCallback(
    (isCurrent: () => boolean = () => true) =>
      Promise.all([engine.coaches(season), engine.read(KEYS), engine.liveRound()]).then(
        async ([page, state, live]) => {
          const previous = page.season !== null && page.seasons.includes(page.season - 1) ? await engine.coaches(page.season - 1) : null;
          if (!isCurrent()) return;
          setLoaded({ page, state, isRoundUnderWay: live !== null, before: new Map(previous?.coaches.map((row) => [row.key, row.position])) });
        },
        () => isCurrent() && setFailed(true),
      ),
    [engine, season],
  );

  useEffect(() => {
    let current = true;
    void load(() => current);
    return () => {
      current = false;
    };
  }, [load]);

  useEffect(() => {
    let current = true;
    if (pickedKey === null) {
      setPicked(null);
      return;
    }
    engine.coachProfile(pickedKey).then(
      (profile) => current && setPicked(profile),
      () => current && setPicked(null),
    );
    return () => {
      current = false;
    };
  }, [engine, pickedKey, loaded]);

  useEffect(() => {
    if (!note) return;
    const gone = setTimeout(() => setNote(null), 2600);
    return () => clearTimeout(gone);
  }, [note]);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!loaded) return <p className="status">Abrindo os técnicos…</p>;

  const { page, state, isRoundUnderWay } = loaded;
  const profile = picked ?? page.you;
  const face = (clubId: string | null) => (clubId ? clubFaceOf(state.clubs, clubId) : null);
  const coachName = game.current?.coachName ?? "Técnico";
  const show = (next: TabId) => setParams(next === "tecnicos" ? {} : { [TAB_PARAM]: next }, { replace: true });
  const say = (text: string, isError = false) => setNote({ id: Date.now(), text, isError });
  const offers = state.coach.offers.length;
  const openJobs = page.jobs.filter((job) => job.openedOn !== null).length;

  async function apply(job: OpenJob) {
    const club = face(job.clubId)?.shortName ?? job.clubId;
    setBusy(true);
    try {
      const answer = await engine.apply({ type: "applyForJob", clubId: job.clubId });
      say(answerText(answer, club), answer !== "offered" && answer !== "alreadyOffered");
      if (answer === "offered") setStamped(job.clubId);
      await load();
    } catch {
      say("A candidatura não chegou ao clube. Tente de novo.", true);
    } finally {
      setBusy(false);
    }
  }

  async function resign() {
    const club = face(state.coachClubId)?.shortName ?? "o clube";
    setBusy(true);
    try {
      await engine.apply({ type: "resign" });
      setResigning(false);
      setPickedKey(null);
      say(`Você deixou ${club}. As vagas estão abertas.`);
      show("vagas");
      await load();
    } catch {
      say("A diretoria não recebeu sua carta. Tente de novo.", true);
    } finally {
      setBusy(false);
    }
  }

  async function retire() {
    setBusy(true);
    try {
      await engine.apply({ type: "retireCoach" });
      navigate("/moment");
    } catch {
      say("A carta de despedida não saiu. Tente de novo.", true);
      setBusy(false);
    }
  }

  const stepper = page.seasons.length > 1 && page.season !== null && (
    <div className="coaches-season" aria-label="Temporada do ranking">
      <button className="coaches-season-step" aria-label="Temporada anterior" disabled={page.seasons[0] === page.season} onClick={() => setSeason((page.season ?? 0) - 1)}>
        <i className="ph-bold ph-caret-left" aria-hidden="true" />
      </button>
      <span className="coaches-season-now">{page.season}</span>
      <button className="coaches-season-step" aria-label="Próxima temporada" disabled={page.seasons.at(-1) === page.season} onClick={() => setSeason((page.season ?? 0) + 1)}>
        <i className="ph-bold ph-caret-right" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div className="coaches fills-screen">
      <div className="coaches-main">
        <header className="coaches-head">
          <div>
            <h1 className="coaches-title">Técnicos</h1>
            <p className="coaches-sub">{page.season === null ? `Temporada ${state.season} · o primeiro ranking sai no fim dela` : `Ranking ao fim de ${page.season} · pesos 5-4-3-2-1 das últimas cinco temporadas`}</p>
          </div>
          {stepper}
          <Link className="btn sm coaches-offers" to="/offers">
            <i className="ph-bold ph-handshake" aria-hidden="true" />
            Propostas
            {offers > 0 && <span className="coaches-n">{offers}</span>}
          </Link>
        </header>
        <div className="coaches-tabs" role="tablist" aria-label="Técnicos">
          {TABS.map((own) => (
            <button key={own.id} role="tab" aria-selected={own.id === tab} className="coaches-tab" onClick={() => show(own.id)}>
              {own.title}
              {own.id === "vagas" && openJobs > 0 && <span className="coaches-n">{openJobs}</span>}
            </button>
          ))}
        </div>
        <section className="stk coaches-board" role="tabpanel" aria-label={TABS.find((own) => own.id === tab)?.title}>
          {tab === "tecnicos" && <CoachTable page={page} before={loaded.before} face={face} youName={coachName} pickedKey={profile.key} onPick={setPickedKey} />}
          {tab === "cbf" && <ClubTable rows={page.national} state={state} face={face} kind="cbf" season={page.season} />}
          {tab === "mundial" && <ClubTable rows={page.world} state={state} face={face} kind="mundial" season={page.season} waiting={page.waitingCountries} />}
          {tab === "vagas" && (
            <JobCentre
              jobs={page.jobs}
              state={state}
              face={face}
              stamped={stamped}
              canApply={!isRoundUnderWay && !isBusy && !state.coach.retiredOn}
              onApply={(job) => void apply(job)}
              onWait={() => void wait.play()}
              isWaiting={wait.isPlaying}
            />
          )}
        </section>
      </div>
      <ProfileCard
        key={profile.key}
        profile={profile}
        youName={coachName}
        isYou={profile.key === page.you.key}
        face={face}
        canResign={!isRoundUnderWay && !isBusy}
        hasRetired={state.coach.retiredOn !== undefined}
        onResign={() => setResigning(true)}
        onRetire={() => setRetiring(true)}
        onBackToYou={() => setPickedKey(null)}
        onJobs={() => show("vagas")}
      />
      {isResigning && state.coachClubId && (
        <ResignQuestion club={face(state.coachClubId)} reputation={state.coach.reputation} season={state.season} isBusy={isBusy} onResign={() => void resign()} onStay={() => setResigning(false)} />
      )}
      {isRetiring && <RetireQuestion isBusy={isBusy} onRetire={() => void retire()} onStay={() => setRetiring(false)} />}
      {note && (
        <p key={note.id} className={note.isError ? "toast stk error" : "toast stk"} role="status">
          <i className={note.isError ? "ph-bold ph-warning" : "ph-bold ph-check-circle"} aria-hidden="true" />
          {note.text}
        </p>
      )}
      {wait.hasFailed && <p className="status error">Os dias não andaram. Tente de novo.</p>}
    </div>
  );
}

type Face = (clubId: string | null) => ClubFace | null;

function ClubCell({ face }: { face: ClubFace | null }) {
  if (!face) return <span className="coaches-club is-none">Sem clube</span>;
  return (
    <span className="coaches-club">
      <Crest club={face} size={18} />
      {face.shortName}
    </span>
  );
}

function Avatar({ name, club, size }: { name: string; club: ClubFace | null; size: "row" | "big" }) {
  const colours = club ? plateColours(club.colours) : null;
  const style: CSSProperties | undefined = colours ? { background: colours.background, color: colours.text } : undefined;
  return (
    <span className={size === "big" ? "coaches-av is-big" : "coaches-av"} style={style} aria-hidden="true">
      {personInitials(name)}
    </span>
  );
}

function Movement({ now, before }: { now: number; before: number | undefined }) {
  if (before === undefined) return <span className="coaches-move is-new">novo</span>;
  if (before === now) return <span className="coaches-move is-same">–</span>;
  const rose = before > now;
  return (
    <span className={rose ? "coaches-move is-up" : "coaches-move is-down"} aria-label={rose ? `subiu ${before - now}` : `caiu ${now - before}`}>
      <i className={rose ? "ph-fill ph-caret-up" : "ph-fill ph-caret-down"} aria-hidden="true" />
      {Math.abs(before - now)}
    </span>
  );
}

// The world ranking's note names this many countries still out, then counts the rest.
const WAITING_NAMED = 3;

/** Names in a sentence: "A, B e C", or the first `named` and "mais N". */
function listOf(names: readonly string[], named: number): string {
  if (names.length > named) return `${names.slice(0, named).join(", ")} e mais ${names.length - named}`;
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}` : (names[0] ?? "");
}

/** The quiet tag on a coach the game made up, so nobody takes him for a real person. */
function InventedMark() {
  return (
    <span className="coaches-invented" title="Técnico inventado pelo jogo">
      fictício
    </span>
  );
}

function EmptyRanking({ title }: { title: string }) {
  return (
    <div className="coaches-empty">
      <div className="slot coaches-empty-slot">
        <i className="ph-bold ph-list-numbers" aria-hidden="true" />
      </div>
      <p className="coaches-empty-title">{title}</p>
      <p className="coaches-empty-text">Os pontos saem dos campeonatos que terminam: a tabela do Brasileiro, a Copa do Brasil e as copas continentais.</p>
    </div>
  );
}

function CoachTable({ page, before, face, youName, pickedKey, onPick }: { page: CoachesPage; before: ReadonlyMap<string, number>; face: Face; youName: string; pickedKey: string; onPick: (key: string | null) => void }) {
  const body = useRef<HTMLTableSectionElement>(null);
  useFlip(body, `${page.season}:${page.coaches.map((row) => row.key).join()}`, slideRow);
  if (page.season === null) return <EmptyRanking title="Ninguém no ranking ainda." />;
  const hasBefore = before.size > 0;
  return (
    <table className="tb coaches-table">
      <thead>
        <tr>
          <th className="coaches-pos">#</th>
          {hasBefore && <th className="l">Var.</th>}
          <th className="l">Técnico</th>
          <th className="l">Clube</th>
          <th>Pontos</th>
        </tr>
      </thead>
      <tbody ref={body}>
        {page.coaches.map((row: RankedCoach, index) => {
          const club = face(row.clubId);
          const name = row.isHuman ? row.name || youName : row.name;
          const isPicked = row.key === pickedKey;
          return (
            <tr key={row.key} data-flip={row.key} className={["coaches-row", isPicked ? "sel" : "", row.isSeated ? "is-you" : ""].join(" ").trim()} style={{ "--i": Math.min(index, STAGGERED_ROWS) } as CSSProperties}>
              <td className="coaches-pos">{row.position}º</td>
              {hasBefore && (
                <td className="l">
                  <Movement now={row.position} before={before.get(row.key)} />
                </td>
              )}
              <td className="l nm">
                <button className="coaches-who" aria-pressed={isPicked} onClick={() => onPick(row.isSeated ? null : row.key)}>
                  <Avatar name={name} club={club} size="row" />
                  {name}
                  {row.isSeated && <span className="chip ink coaches-you">você</span>}
                  {row.isInvented && <InventedMark />}
                </button>
              </td>
              <td className="l">
                <ClubCell face={club} />
              </td>
              <td className="coaches-points">{points(row.points)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ClubTable({
  rows,
  state,
  face,
  kind,
  season,
  waiting = [],
}: {
  rows: readonly RankedClub[];
  state: CoachesState;
  face: Face;
  kind: "cbf" | "mundial";
  season: number | null;
  waiting?: readonly string[];
}) {
  if (season === null) return <EmptyRanking title={kind === "cbf" ? "O ranking da CBF sai no fim da temporada." : "O ranking mundial sai no fim da temporada."} />;
  return (
    <>
      <table className="tb coaches-table">
        <thead>
          <tr>
            <th className="coaches-pos">#</th>
            <th className="l">Clube</th>
            <th className="l">{kind === "cbf" ? "UF" : "País"}</th>
            <th>Pontos</th>
          </tr>
        </thead>
        <tbody key={`${kind}-${season}`}>
          {rows.map((row, index) => {
            const club = face(row.clubId);
            return (
              <tr key={row.clubId} className={row.clubId === state.coachClubId ? "coaches-row is-you" : "coaches-row"} style={{ "--i": Math.min(index, STAGGERED_ROWS) } as CSSProperties}>
                <td className="coaches-pos">{row.position}º</td>
                <td className="l nm">
                  <ClubCell face={club} />
                </td>
                <td className="l dim">{kind === "cbf" ? (state.clubs[row.clubId]?.state ?? "") : countryName(row.country)}</td>
                <td className="coaches-points">{points(row.points)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="coaches-foot">
        {kind === "cbf"
          ? "Como a CBF conta: campeão da Série A 800 pontos, B 400, C 200, D 100; vice 80%, 3º 75%, 4º 70% e 1 ponto percentual a menos por posição, até 51%. Copa do Brasil: 600 ao campeão, 480 ao vice, 450 na semifinal, 400 nas quartas."
          : "Os dez primeiros de cada liga, o campeão da segunda divisão, os finalistas da copa nacional e os campeões continentais e do Mundial, tudo pesado pela força da liga do clube. Estimativa do jogo, à moda do IFFHS e da UEFA."}
      </p>
      {waiting.length > 0 && (
        <p className="coaches-foot coaches-waiting">
          Ainda fora: {listOf(waiting.map(countryName), WAITING_NAMED)}. Entram quando fecharem a primeira temporada no jogo; as ligas europeias fecham em julho.
        </p>
      )}
    </>
  );
}

function divisionOf(state: CoachesState, clubId: string): string {
  const club = state.clubs[clubId];
  if (!club) return "";
  if (club.division) return `Série ${club.division}`;
  if (club.abroad) return `${countryName(club.abroad.country)} · ${club.abroad.level + 1}ª div.`;
  return "Estadual";
}

function JobCentre({
  jobs,
  state,
  face,
  stamped,
  canApply,
  onApply,
  onWait,
  isWaiting,
}: {
  jobs: readonly OpenJob[];
  state: CoachesState;
  face: Face;
  stamped: string | null;
  canApply: boolean;
  onApply: (job: OpenJob) => void;
  onWait: () => void;
  isWaiting: boolean;
}) {
  const [country, setCountry] = useState("");
  const [onlyReachable, setOnlyReachable] = useState(false);
  const countryOf = (clubId: string) => state.clubs[clubId]?.abroad?.country ?? "br";
  const countries = [...new Set(jobs.map((job) => countryOf(job.clubId)))].sort();
  const shown = jobs.filter((job) => (!country || countryOf(job.clubId) === country) && (!onlyReachable || job.wouldHire));
  const offered = new Set(state.coach.offers.map((offer) => offer.clubId));
  const today = Date.parse(state.date);
  return (
    <div className="coaches-jobs">
      <div className="coaches-jobs-bar">
        {countries.length > 1 && <Select label="País" value={country} options={[{ value: "", label: "Todos" }, ...countries.map((id) => ({ value: id, label: countryName(id) }))]} onChange={setCountry} />}
        <label className="coaches-toggle">
          <input className="sw-input" type="checkbox" checked={onlyReachable} onChange={(event) => setOnlyReachable(event.target.checked)} />
          <span className={onlyReachable ? "sw on" : "sw"} aria-hidden="true" />
          Só onde me aceitam
        </label>
        <span className="coaches-rep">
          Sua reputação <b>{state.coach.reputation}</b>
        </span>
      </div>
      {!state.coachClubId && (
        <div className="note coaches-free">
          <b>Sem clube.</b> Candidate-se a uma vaga ou espere as propostas chegarem.
          <button className="btn sm y" onClick={onWait} disabled={isWaiting}>
            {isWaiting ? "Esperando…" : "Esperar propostas"}
          </button>
        </div>
      )}
      {shown.length === 0 ? (
        <p className="coaches-jobs-none">{jobs.length === 0 ? "Nenhuma vaga aberta agora. Elas abrem quando uma diretoria demite o técnico." : "Nenhuma vaga com esses filtros."}</p>
      ) : (
        <ul className="coaches-job-list" aria-label="Vagas">
          {shown.map((job, index) => {
            const club = face(job.clubId);
            const isOffered = offered.has(job.clubId);
            const days = job.openedOn ? Math.round((today - Date.parse(job.openedOn)) / DAY_MS) : 0;
            return (
              <li key={job.clubId} className={job.openedOn ? "coaches-job" : "coaches-job is-shaky"} style={{ "--i": Math.min(index, STAGGERED_ROWS) } as CSSProperties}>
                {club && <Crest club={club} size={34} />}
                <span className="coaches-job-club">
                  <b>{club?.shortName ?? job.clubId}</b>
                  <small>{divisionOf(state, job.clubId)}</small>
                </span>
                <span className="coaches-job-state">
                  {job.openedOn ? (
                    <>
                      <span className="chip ok">vaga aberta</span>
                      <small>{days === 0 ? "desde hoje" : `há ${plural(days, "dia", "dias")}`}</small>
                    </>
                  ) : (
                    <>
                      <span className="chip wait">balançando</span>
                      <small>{job.coachName ?? "técnico"} pressionado</small>
                    </>
                  )}
                </span>
                <span className="coaches-job-size" title="Porte do clube">
                  <span className="meter thin">
                    <i style={{ width: `${Math.max(4, job.stature)}%` }} />
                  </span>
                  <small>porte {job.stature}</small>
                </span>
                <span className="coaches-job-act">
                  {isOffered ? (
                    <Link to="/offers" className={job.clubId === stamped ? "coaches-stamp is-stamped" : "coaches-stamp"}>
                      Proposta na mesa
                    </Link>
                  ) : job.openedOn ? (
                    <>
                      <span className={job.wouldHire ? "coaches-verdict is-yes" : "coaches-verdict"}>
                        {job.wouldHire ? "aceitaria você" : job.refusal === "rivalIdol" ? "porta fechada" : "fora do alcance"}
                        {job.refusal && <small id={`coaches-why-${job.clubId}`}>{jobRefusalText(job.refusal, job.idolOf ? withArticle(state.clubs[job.idolOf]?.shortName ?? job.idolOf, clubArticle(job.idolOf), "de") : "de rival")}</small>}
                      </span>
                      <button
                        className="btn sm go"
                        onClick={() => onApply(job)}
                        disabled={!canApply || !job.wouldHire}
                        aria-label={`Candidatar-se: ${club?.shortName ?? job.clubId}`}
                        aria-describedby={job.refusal ? `coaches-why-${job.clubId}` : undefined}
                      >
                        Candidatar
                      </button>
                    </>
                  ) : (
                    <span className="coaches-verdict">{job.wouldHire ? "fique de olho" : "fora do alcance"}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ProfileCard({
  profile,
  youName,
  isYou,
  face,
  canResign,
  hasRetired,
  onResign,
  onRetire,
  onBackToYou,
  onJobs,
}: {
  profile: CoachProfile;
  youName: string;
  isYou: boolean;
  face: Face;
  canResign: boolean;
  /** Whether the coach in the seat has ended his career, at a club or out of work. */
  hasRetired: boolean;
  onResign: () => void;
  onRetire: () => void;
  onBackToYou: () => void;
  onJobs: () => void;
}) {
  const name = profile.name ?? youName;
  const club = face(profile.clubId);
  const stints = [...profile.stints].reverse();
  const titlesByKey = new Map<string, number[]>();
  for (const title of profile.titles) titlesByKey.set(title.competition, [...(titlesByKey.get(title.competition) ?? []), title.season]);
  const isRetired = (isYou && hasRetired) || profile.stints.at(-1)?.left === "retired";
  const isInvented = !profile.isHuman && !profile.isReal && !profile.formerPlayer;
  const formerClub = profile.formerPlayer ? face(profile.formerPlayer.clubId) : null;
  const who = [profile.nationality && nationalityName(profile.nationality), profile.age !== null && `${profile.age} anos`].filter(Boolean).join(" · ");
  return (
    <aside className="stk coaches-profile" aria-label={`Perfil de ${name}`}>
      <div className="coaches-profile-top">
        <div className="coaches-profile-face">
          <Avatar name={name} club={club} size="big" />
          {club && (
            <span className="coaches-profile-crest">
              <Crest club={club} size={26} />
            </span>
          )}
        </div>
        <div className="coaches-profile-who">
          <h2>
            {name}
            {isInvented && <InventedMark />}
          </h2>
          <p>{isYou ? "Você" : who || "Técnico"}</p>
          <p className="coaches-profile-club">{club ? club.shortName : isRetired ? "Aposentado" : "Sem clube"}</p>
        </div>
        <div className="coaches-rank" aria-label={profile.ranking ? `${profile.ranking.position}º no ranking` : "Sem ranking"}>
          <span className="coaches-rank-n">{profile.ranking ? `${profile.ranking.position}º` : "–"}</span>
          <small>{profile.ranking ? `${points(profile.ranking.points)} pts` : "sem ranking"}</small>
        </div>
      </div>
      <dl className="coaches-facts">
        <div>
          <dt>Reputação</dt>
          <dd>
            <span className="meter thin">
              <i style={{ width: `${Math.max(3, profile.reputation)}%` }} />
            </span>
            <b>{profile.reputation}</b>
          </dd>
        </div>
        <div>
          <dt>Títulos</dt>
          <dd>
            <b>{profile.titles.length}</b>
          </dd>
        </div>
        {profile.formation && (
          <div>
            <dt>Esquema</dt>
            <dd>
              <b>{profile.formation}</b>
            </dd>
          </div>
        )}
        {profile.style && (
          <div>
            <dt>Estilo</dt>
            <dd>
              <b>{STYLE_WORDS[profile.style]}</b>
            </dd>
          </div>
        )}
      </dl>
      {profile.formerPlayer && (
        <p className="note coaches-former">
          Ex-craque do jogo, força {Math.round(profile.formerPlayer.strength)} no auge. Último clube como jogador: <b>{formerClub?.shortName ?? "–"}</b>.
        </p>
      )}
      {titlesByKey.size > 0 && (
        <section className="coaches-titles" aria-label="Títulos">
          {[...titlesByKey].map(([key, seasons]) => (
            <span key={key} className="coaches-title-chip">
              <i className="ph-fill ph-trophy" aria-hidden="true" />
              {titleName(key)}
              <small>{seasons.length > 1 ? `${seasons.length}× · ${seasons.join(", ")}` : seasons[0]}</small>
            </span>
          ))}
        </section>
      )}
      {profile.idolOf.length > 0 && (
        <section className="coaches-idol" aria-label="Ídolo">
          {profile.idolOf.map((clubId) => {
            const idolClub = face(clubId);
            return (
              <span key={clubId} className="coaches-idol-chip">
                {idolClub && <Crest club={idolClub} size={16} />}
                Ídolo {withArticle(idolClub?.shortName ?? clubId, clubArticle(clubId), "de")}
              </span>
            );
          })}
        </section>
      )}
      {profile.rivals.length > 0 && (
        <section className="coaches-rivals" aria-labelledby="coaches-rivals-title">
          <h3 id="coaches-rivals-title" className="lbl">
            Duelos com técnicos
          </h3>
          <ol>
            {profile.rivals.map((rival) => {
              const at = face(rival.clubId);
              return (
                <li key={rival.key} className={rival.isRivalry ? "coaches-rival is-hot" : "coaches-rival"}>
                  <Avatar name={rival.name} club={at} size="row" />
                  <span className="coaches-rival-who">
                    <b>{rival.name}</b>
                    <small>{at?.shortName ?? "sem clube"}</small>
                  </span>
                  <span className="coaches-rival-record" aria-label={`${rival.wins} vitórias, ${rival.draws} empates, ${rival.losses} derrotas em ${rival.meetings} jogos`}>
                    <b>{rival.wins}</b>V <b>{rival.draws}</b>E <b>{rival.losses}</b>D
                  </span>
                  <span className="coaches-rival-tags">
                    {rival.isRivalry && <span className="chip bad">Rivalidade</span>}
                    {rival.fregues === "them" && <span className="chip ok">Freguês</span>}
                    {rival.fregues === "us" && <span className="chip off">Seu carrasco</span>}
                    {rival.finals > 0 && <small>{rival.finals === 1 ? "1 final" : `${rival.finals} finais`}</small>}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}
      <section className="coaches-career" aria-labelledby="coaches-career-title">
        <h3 id="coaches-career-title" className="lbl">
          Carreira
        </h3>
        {stints.length === 0 ? (
          <p className="coaches-career-none">Nenhum clube ainda.</p>
        ) : (
          <ol className="coaches-timeline">
            {stints.map((stint, index) => {
              const at = face(stint.clubId);
              return (
                <li key={`${stint.clubId}-${stint.from}`} className={stint.until === null ? "coaches-stint is-now" : "coaches-stint"} style={{ "--i": Math.min(index, 8) } as CSSProperties}>
                  <span className="coaches-stint-dot" aria-hidden="true" />
                  {at && <Crest club={at} size={20} />}
                  <span className="coaches-stint-club">{at?.shortName ?? stint.clubId}</span>
                  <span className="coaches-stint-when">
                    {formatMonthYear(stint.from)} – {stint.until ? formatMonthYear(stint.until) : "hoje"}
                  </span>
                  <span className={`coaches-exit is-${stint.left ?? "now"}`}>{exitWord(stint.left)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <div className="coaches-profile-acts">
        {isYou ? (
          isRetired ? null : (
            <>
              {profile.clubId ? (
                <button className="btn sm no" onClick={onResign} disabled={!canResign}>
                  <i className="ph-bold ph-door-open" aria-hidden="true" />
                  Pedir demissão
                </button>
              ) : (
                <button className="btn sm go" onClick={onJobs}>
                  <i className="ph-bold ph-briefcase" aria-hidden="true" />
                  Ver vagas
                </button>
              )}
              <button className="btn sm flat" onClick={onRetire} disabled={!canResign}>
                <i className="ph-bold ph-flag-banner" aria-hidden="true" />
                Encerrar carreira
              </button>
            </>
          )
        ) : (
          <button className="btn sm flat" onClick={onBackToYou}>
            <i className="ph-bold ph-arrow-left" aria-hidden="true" />
            Voltar ao seu perfil
          </button>
        )}
      </div>
    </aside>
  );
}

function RetireQuestion({ isBusy, onRetire, onStay }: { isBusy: boolean; onRetire: () => void; onStay: () => void }) {
  const title = useDialogFocus<HTMLHeadingElement>(true, { isModal: true });
  return createPortal(
    <div className="coaches-veil">
      <section
        className="page coaches-resign"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="coaches-retire-title"
        aria-describedby="coaches-retire-what"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          if (!isBusy) onStay();
        }}
      >
        <div className="coaches-resign-letter" aria-hidden="true">
          <i className="ph-bold ph-flag-banner" />
        </div>
        <h2 id="coaches-retire-title" ref={title} tabIndex={-1}>
          Encerrar a carreira?
        </h2>
        <ul id="coaches-retire-what" className="coaches-resign-list">
          <li>Você deixa o clube e não volta a treinar ninguém.</li>
          <li>Nenhum clube faz proposta daqui pra frente.</li>
          <li>A despedida passa a carreira inteira pelo álbum, com as homenagens dos ex-clubes.</li>
        </ul>
        <div className="coaches-resign-acts">
          <button className="btn no" onClick={onRetire} disabled={isBusy}>
            Encerrar carreira
          </button>
          <button className="btn flat" onClick={onStay} disabled={isBusy}>
            Continuar treinando
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function ResignQuestion({ club, reputation, season, isBusy, onResign, onStay }: { club: ClubFace | null; reputation: number; season: number; isBusy: boolean; onResign: () => void; onStay: () => void }) {
  const title = useDialogFocus<HTMLHeadingElement>(true, { isModal: true });
  const name = club?.shortName ?? "O clube";
  return createPortal(
    <div className="coaches-veil">
      <section
        className="page coaches-resign"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="coaches-resign-title"
        aria-describedby="coaches-resign-what"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          if (!isBusy) onStay();
        }}
      >
        <div className="coaches-resign-letter" aria-hidden="true">
          {club && <Crest club={club} size={40} />}
          <i className="ph-bold ph-signature" />
        </div>
        <h2 id="coaches-resign-title" ref={title} tabIndex={-1}>
          Pedir demissão?
        </h2>
        <ul id="coaches-resign-what" className="coaches-resign-list">
          <li>
            Sua reputação cai de <b>{reputation}</b> para <b>{Math.max(0, reputation - RESIGN_REPUTATION_COST)}</b>.
          </li>
          <li>
            {name} não contrata você de novo até o fim de <b>{season + RESIGN_COOLDOWN_SEASONS}</b>.
          </li>
          <li>{name} abre a vaga, e outro técnico assume em duas semanas.</li>
          <li>Seus pedidos à diretoria são cancelados.</li>
        </ul>
        <div className="coaches-resign-acts">
          <button className="btn no" onClick={onResign} disabled={isBusy}>
            Pedir demissão
          </button>
          <button className="btn flat" onClick={onStay} disabled={isBusy}>
            Continuar no cargo
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
