import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import type { Club } from "@boleiro/data/clubs";
import type { CoachFired } from "@boleiro/engine/sim/coach/judgeCoaches";
import { useServices } from "../app/ServicesContext.js";
import { ClubPlate } from "../clubs/ClubPlate.js";
import { Crest } from "../clubs/Crest.js";
import { formatGameDate } from "@boleiro/game-client/format/formatGameDate";
import { useSound } from "../sound/SoundProvider.js";
import { stingerBeat } from "../sound/stingerBeat.js";
import "./career.css";

type Loaded = { firing: CoachFired; club: Club | undefined; offers: number } | "none";

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
    Promise.all([engine.turningPoint(), engine.read(["clubs", "coach"])]).then(
      ([point, { clubs, coach }]) => {
        if (!current) return;
        setLoaded(point?.kind === "fired" ? { firing: point.firing, club: clubs[point.firing.clubId], offers: coach.offers.length } : "none");
      },
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  const isSacked = loaded !== null && loaded !== "none";
  useEffect(() => {
    if (isSacked) sound.play("sacked");
  }, [isSacked, sound]);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!loaded) return <p className="status">Abrindo…</p>;
  if (loaded === "none") return <Navigate to="/hub" replace />;

  const { firing, club, offers } = loaded;

  async function seeOffers() {
    setLeaving(true);
    try {
      await engine.apply({ type: "closeTurningPoint" });
      navigate("/offers");
    } catch {
      setFailed(true);
    }
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
