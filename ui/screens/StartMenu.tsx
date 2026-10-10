import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useServices } from "../app/ServicesContext.js";
import { formatGameDate } from "../format/formatGameDate.js";
import { loadFromSlot } from "../saves/saveToSlot.js";
import type { SlotMeta } from "../saves/slotMeta.js";
import "./startMenu.css";

type Slots = { kind: "loading" } | { kind: "ready"; slots: SlotMeta[] } | { kind: "failed" };

export function StartMenu() {
  const { engine, slots } = useServices();
  const navigate = useNavigate();
  const [saved, setSaved] = useState<Slots>({ kind: "loading" });
  const [opening, setOpening] = useState<string | null>(null);
  const [openFailed, setOpenFailed] = useState(false);

  useEffect(() => {
    let current = true;
    slots.list().then(
      (list) => current && setSaved({ kind: "ready", slots: list }),
      () => current && setSaved({ kind: "failed" }),
    );
    return () => {
      current = false;
    };
  }, [slots]);

  async function open(id: string) {
    setOpening(id);
    setOpenFailed(false);
    try {
      await loadFromSlot(engine, slots, id);
      navigate("/hub");
    } catch {
      setOpenFailed(true);
      setOpening(null);
    }
  }

  return (
    <div className="start">
      <section className="start-hero">
        <h1 className="screen-title">Futebol brasileiro, da Série A à D</h1>
        <Link to="/new-game" className="btn-main">
          Novo jogo
        </Link>
      </section>
      <section className="start-slots" aria-labelledby="slots-title">
        <h2 id="slots-title" className="start-slots-title">
          Jogos salvos
        </h2>
        {saved.kind === "loading" && <p className="status">Lendo jogos salvos…</p>}
        {saved.kind === "failed" && <p className="status error">Não deu para ler os jogos salvos.</p>}
        {saved.kind === "ready" && saved.slots.length === 0 && <p className="status">Nenhum jogo salvo.</p>}
        {saved.kind === "ready" && saved.slots.length > 0 && (
          <ul className="slot-list">
            {saved.slots.map((slot) => (
              <li key={slot.id}>
                <button className="slot" onClick={() => void open(slot.id)} disabled={opening !== null}>
                  <span className="slot-name">{slot.name}</span>
                  <span className="slot-date">{opening === slot.id ? "Abrindo…" : formatGameDate(slot.date)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {openFailed && <p className="status error">Esse jogo salvo não abriu.</p>}
      </section>
    </div>
  );
}
