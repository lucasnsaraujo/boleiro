import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useServices } from "../app/ServicesContext.js";
import { SCREENS } from "../app/screens.js";
import { formatGameDate } from "../format/formatGameDate.js";
import type { CurrentGame } from "../saves/currentGame.js";
import { saveToSlot } from "../saves/saveToSlot.js";
import { slotLabel } from "../saves/slotMeta.js";
import "./hub.css";

type Game = { date: string; season: number; clubName: string | null };
type Saving = "idle" | "saving" | "saved" | "failed";

export function Hub() {
  const { engine, slots, game: open } = useServices();
  const [game, setGame] = useState<Game | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState<Saving>("idle");

  useEffect(() => {
    let current = true;
    engine.read(["date", "season", "coachClubId", "clubs"]).then(
      ({ date, season, coachClubId, clubs }) => {
        if (current) setGame({ date, season, clubName: coachClubId ? (clubs[coachClubId]?.shortName ?? null) : null });
      },
      () => current && setMissing(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

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
  if (!game) return <p className="status">Abrindo o jogo…</p>;

  return (
    <div className="hub">
      <h1 className="screen-title">{game.clubName ?? "Sem clube"}</h1>
      <p className="screen-sub">{formatGameDate(game.date)}</p>
      <p className="status">
        <button className="btn-main" onClick={() => void save(current)} disabled={saving === "saving"}>
          Salvar jogo
        </button>
      </p>
      {saving === "saved" && <p className="status">Salvo em {slotLabel(current.slotId)}.</p>}
      {saving === "failed" && <p className="status error">Não deu para salvar.</p>}
      <nav className="hub-nav" aria-label="Telas">
        {SCREENS.filter((screen) => screen.inHub).map((screen) => (
          <Link key={screen.path} to={screen.path} className="btn-quiet">
            {screen.title}
          </Link>
        ))}
      </nav>
    </div>
  );
}
