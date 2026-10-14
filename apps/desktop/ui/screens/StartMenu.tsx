import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useServices } from "../app/ServicesContext.js";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { clubById } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import { formatGameDate } from "@boleiro/game-client/format/formatGameDate";
import { loadFromSlot } from "@boleiro/game-client/saves/saveToSlot";
import { slotLabel, type SlotMeta } from "@boleiro/game-client/saves/slotMeta";
import "./startMenu.css";

type Slots = { kind: "loading" } | { kind: "ready"; slots: SlotMeta[] } | { kind: "failed" };

const SAVED_AT = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function clubOf(meta: SlotMeta) {
  return meta.coachClubId ? clubById(meta.coachClubId) : null;
}

/** A game without a club already says so where the club name goes, so its details skip the series. */
function details(...parts: (string | null)[]): string {
  return parts.filter((part) => part !== null).join(" · ");
}

function seriesOf(meta: SlotMeta): string | null {
  return meta.division ? `Série ${meta.division}` : null;
}

export function StartMenu() {
  const { engine, slots, game } = useServices();
  const navigate = useNavigate();
  const [saved, setSaved] = useState<Slots>({ kind: "loading" });
  const [opening, setOpening] = useState<string | null>(null);
  const [openFailed, setOpenFailed] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const confirmTitle = useDialogFocus<HTMLParagraphElement>(deleting !== null);

  async function refresh() {
    try {
      setSaved({ kind: "ready", slots: await slots.list() });
    } catch {
      setSaved({ kind: "failed" });
    }
  }

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

  async function open(meta: SlotMeta) {
    setOpening(meta.id);
    setOpenFailed(false);
    try {
      await loadFromSlot(engine, slots, meta.id);
      game.current = { slotId: meta.gameSlotId, coachName: meta.coachName };
      navigate("/hub");
    } catch {
      setOpenFailed(true);
      setOpening(null);
    }
  }

  async function remove(id: string) {
    setDeleting(null);
    setDeleteFailed(false);
    try {
      await slots.remove(id);
    } catch {
      setDeleteFailed(true);
    }
    await refresh();
  }

  const list = saved.kind === "ready" ? saved.slots : [];
  const latest = list[0] ?? null;
  const latestClub = latest ? clubOf(latest) : null;

  return (
    <div className="start">
      <section className="start-hero">
        {latest ? (
          <>
            <p className="start-kicker">Último jogo salvo</p>
            <div className="latest">
              {latestClub && <Crest club={latestClub} size={84} />}
              <div>
                <h1 className="screen-title">{latestClub?.shortName ?? "Sem clube"}</h1>
                <p className="screen-sub">
                  {details(latest.coachName, seriesOf(latest), formatGameDate(latest.date))}
                </p>
              </div>
            </div>
            <div className="start-actions">
              <button className="btn-main" onClick={() => void open(latest)} disabled={opening !== null}>
                Continuar
              </button>
              <Link to="/new-game" className="btn-quiet">
                Novo jogo
              </Link>
              <Link to="/options" className="btn-quiet">
                Opções
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="screen-title start-pitch">Futebol brasileiro, da Série A à D</h1>
            <div className="start-actions">
              <Link to="/new-game" className="btn-main">
                Novo jogo
              </Link>
              <Link to="/options" className="btn-quiet">
                Opções
              </Link>
            </div>
          </>
        )}
      </section>
      <section className="start-slots" aria-labelledby="slots-title">
        <h2 id="slots-title" className="start-slots-title">
          Jogos salvos
        </h2>
        {saved.kind === "loading" && <p className="status">Lendo jogos salvos…</p>}
        {saved.kind === "failed" && <p className="status error">Não deu para ler os jogos salvos.</p>}
        {saved.kind === "ready" && list.length === 0 && <p className="status">Nenhum jogo salvo.</p>}
        {list.length > 0 && (
          <ul className="slot-list">
            {list.map((meta) => {
              const club = clubOf(meta);
              const label = slotLabel(meta.id);
              return (
                <li key={meta.id} className="slot-row">
                  <button className="slot" onClick={() => void open(meta)} disabled={opening !== null}>
                    <span className="slot-crest">{club && <Crest club={club} size={30} />}</span>
                    <span className="slot-main">
                      <span className="slot-name">{club?.shortName ?? "Sem clube"}</span>
                      <span className="slot-sub">
                        {details(label, meta.coachName, seriesOf(meta))}
                      </span>
                    </span>
                    <span className="slot-when">
                      <span className="slot-date">{opening === meta.id ? "Abrindo…" : formatGameDate(meta.date)}</span>
                      <span className="slot-saved">jogado em {SAVED_AT.format(new Date(meta.savedAt))}</span>
                    </span>
                  </button>
                  <button className="slot-delete" aria-label={`Apagar ${label}`} onClick={() => setDeleting(meta.id)}>
                    Apagar
                  </button>
                  {deleting === meta.id && (
                    <div className="slot-confirm" role="alertdialog" aria-labelledby={`delete-${meta.id}`}>
                      <p id={`delete-${meta.id}`} ref={confirmTitle} tabIndex={-1} className="slot-confirm-title">
                        Apagar o {label}?
                      </p>
                      <button className="btn-danger" onClick={() => void remove(meta.id)}>
                        Apagar
                      </button>
                      <button className="btn-quiet" onClick={() => setDeleting(null)}>
                        Cancelar
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {openFailed && <p className="status error">Esse jogo salvo não abriu.</p>}
        {deleteFailed && <p className="status error">Não deu para apagar esse jogo.</p>}
      </section>
    </div>
  );
}
