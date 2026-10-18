import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import type { Club } from "@boleiro/data/clubs";
import type { CoachFired } from "@boleiro/engine/sim/coach/judgeCoaches";
import type { SackingView } from "@boleiro/game-client/moments/momentView";
import { SackingScene } from "../moments/scenes/SackingScene.js";
import { useServices } from "../app/ServicesContext.js";
import { ClubPlate } from "../clubs/ClubPlate.js";
import { Crest } from "../clubs/Crest.js";
import { formatGameDate } from "@boleiro/game-client/format/formatGameDate";
import { useSound } from "../sound/SoundProvider.js";
import { stingerBeat } from "../sound/stingerBeat.js";
import "./career.css";

type Loaded = { firing: CoachFired; club: Club | undefined; offers: number; night: SackingView | null } | "none";

/** The board's sacking, before the coach looks at what else is on the table. */
export function Sacked() {
  const { engine } = useServices();
  const { engine: sound } = useSound();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [isLeaving, setLeaving] = useState(false);

  useEffect(() => {
    let current = true;
    Promise.all([engine.turningPoint(), engine.read(["clubs", "coach", "history"])]).then(
      async ([point, { clubs, coach, history }]) => {
        if (point?.kind !== "fired") return current && setLoaded("none");
        // The board fires on the morning after the match day the moments engine dates the sacking with, so the club finds it.
        const waiting = history.coach.moments?.queue.findLast((moment) => moment.kind === "sacking" && moment.clubId === point.firing.clubId);
        const view = waiting ? await engine.momentView(waiting.id) : null;
        if (current) setLoaded({ firing: point.firing, club: clubs[point.firing.clubId], offers: coach.offers.length, night: view?.kind === "sacking" ? view : null });
      },
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  const isSacked = loaded !== null && loaded !== "none";
  const hasNight = isSacked && loaded.night !== null;
  useEffect(() => {
    if (isSacked && !hasNight) sound.play("sacked");
  }, [isSacked, hasNight, sound]);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!loaded) return <p className="status">Abrindo…</p>;
  if (loaded === "none") return <Navigate to="/hub" replace />;

  const { firing, club, offers, night } = loaded;

  async function leave(to: string) {
    setLeaving(true);
    try {
      await engine.apply({ type: "closeTurningPoint" });
      if (night) await engine.apply({ type: "closeMoment", id: night.id });
      navigate(to);
    } catch {
      setFailed(true);
    }
  }
  const seeOffers = () => leave("/offers");

  if (night) {
    return (
      <SackingScene
        view={night}
        actions={
          <>
            <button className="btn" disabled={isLeaving} onClick={() => void leave("/newspaper")}>
              <i className="ph-bold ph-newspaper" aria-hidden="true" />
              Jornal
            </button>
            <button className="btn go" autoFocus disabled={isLeaving} onClick={() => void seeOffers()}>
              Ver propostas
              <i className="ph-bold ph-arrow-right" aria-hidden="true" />
            </button>
          </>
        }
      />
    );
  }

  return (
    <div className="career-sacked">
      <section className="career-sacked-band" style={{ ["--career-sacked-beat" as string]: `${stingerBeat("sacked")}ms` }}>
        {club && <Crest club={club} size={88} />}
        <div>
          <p className="career-sacked-who">
            {club && <ClubPlate club={club} size="row" />}
            <span className="screen-sub">{formatGameDate(firing.date)}</span>
          </p>
          <h1 className="career-sacked-title">Demitido</h1>
        </div>
      </section>
      <dl className="career-sacked-facts">
        <div>
          <dt>Posição na tabela</dt>
          <dd>{firing.position}º</dd>
        </div>
        <div>
          <dt>Meta da diretoria</dt>
          <dd>{firing.targetPosition}º</dd>
        </div>
        <div>
          <dt>Propostas na mesa</dt>
          <dd>{offers === 0 ? "nenhuma" : offers}</dd>
        </div>
      </dl>
      <footer className="career-actions">
        <button className="btn-main" onClick={() => void seeOffers()} disabled={isLeaving}>
          Ver propostas
        </button>
      </footer>
    </div>
  );
}
