import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import type { Club } from "@boleiro/data/clubs";
import type { CompetitionKey } from "@boleiro/engine/sim/history/history";
import { useServices } from "../app/ServicesContext.js";
import { ClubPlate } from "../clubs/ClubPlate.js";
import { Crest } from "../clubs/Crest.js";
import { competitionKeyName } from "@boleiro/game-client/format/competitionName";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import { seasonHeadline, type Stamp } from "../seasonEnd/seasonHeadline.js";
import type { BoardVerdict, ContinentalPlace, ContractVerdict, Placing, SeasonReview } from "@boleiro/game-client/seasonEnd/seasonReview";
import type { Cue } from "../sound/soundCatalog.js";
import { useSound } from "../sound/SoundProvider.js";
import { stingerBeat } from "../sound/stingerBeat.js";
import { boardGoal } from "@boleiro/game-client/screens/clubChoices";
import "./seasonEnd.css";

type Clubs = Readonly<Record<string, Club>>;
type Loaded = { review: SeasonReview; clubs: Clubs } | "none";

const STAMPS: Record<Stamp, string> = { title: "Campeão", promoted: "Acesso", relegated: "Rebaixado" };
const STINGERS: Record<Stamp, Cue> = { title: "title", promoted: "promotion", relegated: "relegation" };
const CONTINENTAL: Record<ContinentalPlace, string> = {
  libertadores: "Libertadores",
  preLibertadores: "Pré-Libertadores",
  sulAmericana: "Sul-Americana",
};
const CHAMPION_KEYS: readonly CompetitionKey[] = ["serie-a", "serie-b", "serie-c", "serie-d", "copa-do-brasil"];

function contractText(contract: ContractVerdict): string {
  switch (contract.kind) {
    case "renewed":
      return `Renovado até ${contract.untilSeason}`;
    case "ended":
      return "Encerrado, você está sem clube";
    case "running":
      return `Até ${contract.untilSeason}`;
  }
}

/** The season's end: the club's result, then the board's verdict, then on to the next season. */
export function SeasonEnd() {
  const { engine } = useServices();
  const { engine: sound } = useSound();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState<"season" | "board">("season");
  const [isLeaving, setLeaving] = useState(false);

  useEffect(() => {
    let current = true;
    Promise.all([engine.turningPoint(), engine.read(["clubs"])]).then(
      ([point, { clubs }]) => current && setLoaded(point?.kind === "seasonEnd" ? { review: point.review, clubs } : "none"),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  useEffect(() => {
    if (!loaded || loaded === "none" || !loaded.review.clubId || !loaded.review.placing) return;
    const { stamp } = seasonHeadline(loaded.review.placing, loaded.review.titles);
    if (stamp) sound.play(STINGERS[stamp]);
  }, [loaded, sound]);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!loaded) return <p className="status">Fechando a temporada…</p>;
  if (loaded === "none") return <Navigate to="/hub" replace />;

  const { review, clubs } = loaded;
  const club = review.clubId ? clubs[review.clubId] : undefined;
  const next = review.season + 1;

  async function startNextSeason() {
    setLeaving(true);
    try {
      await engine.closeTurningPoint();
      navigate("/hub");
    } catch {
      setFailed(true);
    }
  }

  const start = (
    <button className="btn-main" onClick={() => void startNextSeason()} disabled={isLeaving}>
      Começar {next}
    </button>
  );

  return (
    <div className="season-end">
      <h1 className="screen-title">Fim da temporada {review.season}</h1>
      {!club || !review.placing ? (
        <Champions champions={review.champions} clubs={clubs} hasLostJob={review.hasLostJob} />
      ) : step === "season" || !review.verdict ? (
        <SeasonResult review={review} placing={review.placing} club={club} />
      ) : (
        <Verdict verdict={review.verdict} division={review.placing.division} club={club} />
      )}
      <footer className="season-end-actions">
        {club && review.verdict && step === "season" ? (
          <button className="btn-main" onClick={() => setStep("board")}>
            Ver a diretoria
          </button>
        ) : (
          start
        )}
      </footer>
    </div>
  );
}

function SeasonResult({ review, placing, club }: { review: SeasonReview; placing: Placing; club: Club }) {
  const headline = seasonHeadline(placing, review.titles);
  return (
    <>
      <section
        className="season-end-band"
        aria-label="Campanha"
        data-stamp={headline.stamp ?? undefined}
        style={headline.stamp ? { ["--season-end-beat" as string]: `${stingerBeat(STINGERS[headline.stamp])}ms` } : undefined}
      >
        <Crest club={club} size={88} />
        <div className="season-end-who">
          <ClubPlate club={club} />
          <p className="season-end-line">{headline.line}</p>
        </div>
        <p className="season-end-place">
          <span className="season-end-place-n">{placing.position}º</span>
          <span className="season-end-place-l">Série {placing.division}</span>
        </p>
        {headline.stamp && <p className={`season-end-stamp is-${headline.stamp}`}>{STAMPS[headline.stamp]}</p>}
      </section>
      <dl className="season-end-facts">
        <div>
          <dt>Títulos</dt>
          <dd className="season-end-titles">{review.titles.length === 0 ? "nenhum" : review.titles.map((key) => <span key={key}>{competitionKeyName(key)}</span>)}</dd>
        </div>
        {review.continental && (
          <div>
            <dt>Vaga continental</dt>
            <dd>{CONTINENTAL[review.continental]}</dd>
          </div>
        )}
        <div>
          <dt>Premiação</dt>
          <dd>{formatMoney(review.prizeMoney)}</dd>
        </div>
        {!review.verdict && review.hasLostJob && <LostJob />}
      </dl>
    </>
  );
}

function Verdict({ verdict, division, club }: { verdict: BoardVerdict; division: Placing["division"]; club: Club }) {
  const change = verdict.reputationAfter - verdict.reputationBefore;
  return (
    <>
      <section className="season-end-band" aria-label="Diretoria">
        <Crest club={club} size={88} />
        <div className="season-end-who">
          <ClubPlate club={club} />
          <p className={verdict.hasMetTarget ? "season-end-verdict is-met" : "season-end-verdict"}>{verdict.hasMetTarget ? "Meta cumprida" : "Meta não cumprida"}</p>
        </div>
      </section>
      <dl className="season-end-facts">
        <div>
          <dt>Meta</dt>
          <dd>{boardGoal(verdict, division)}</dd>
        </div>
        <div>
          <dt>Posição</dt>
          <dd>{verdict.position}º</dd>
        </div>
        <div>
          <dt>Contrato</dt>
          <dd>{contractText(verdict.contract)}</dd>
        </div>
        <div>
          <dt>Reputação</dt>
          <dd>
            {verdict.reputationAfter}
            {change !== 0 && <small className={change > 0 ? "season-end-up" : "season-end-down"}>{change > 0 ? `+${change}` : change}</small>}
          </dd>
        </div>
      </dl>
    </>
  );
}

function LostJob() {
  return (
    <div>
      <dt>Contrato</dt>
      <dd>{contractText({ kind: "ended" })}</dd>
    </div>
  );
}

function Champions({ champions, clubs, hasLostJob }: { champions: Record<CompetitionKey, string>; clubs: Clubs; hasLostJob: boolean }) {
  return (
    <dl className="season-end-facts season-end-champions" aria-label="Campeões">
      {hasLostJob && <LostJob />}
      {CHAMPION_KEYS.map((key) => {
        const champion = clubs[champions[key] ?? ""];
        if (!champion) return null;
        return (
          <div key={key}>
            <dt>{competitionKeyName(key)}</dt>
            <dd>
              <Crest club={champion} size={22} />
              {champion.shortName}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
