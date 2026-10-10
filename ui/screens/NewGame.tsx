import { useState } from "react";
import { useNavigate } from "react-router";
import { useServices } from "../app/ServicesContext.js";
import { saveToSlot } from "../saves/saveToSlot.js";
import { AUTOSAVE_SLOT_ID } from "../saves/slotMeta.js";

export function NewGame() {
  const { engine, slots } = useServices();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function start() {
    setStarting(true);
    setFailed(false);
    try {
      await engine.newGame(crypto.getRandomValues(new Uint32Array(1))[0] ?? 0, { coachClubId: null, careerMode: true });
      await saveToSlot(engine, slots, { id: AUTOSAVE_SLOT_ID, name: "Salvamento automático" });
      navigate("/hub");
    } catch {
      setFailed(true);
      setStarting(false);
    }
  }

  return (
    <>
      <h1 className="screen-title">Novo jogo</h1>
      <p className="screen-sub">Você começa sem clube, com propostas de times pequenos.</p>
      <p className="status">
        <button className="btn-main" onClick={() => void start()} disabled={starting}>
          {starting ? "Montando a temporada…" : "Começar carreira"}
        </button>
      </p>
      {failed && <p className="status error">Não deu para criar o jogo.</p>}
    </>
  );
}
