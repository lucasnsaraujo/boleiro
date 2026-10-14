import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { formatBarDate, formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { loadFromSlot, saveToSlot } from "@boleiro/game-client/saves/saveToSlot";
import { AUTOSAVE_SLOT_ID, GAME_SLOT_IDS, slotLabel, type SlotMeta } from "@boleiro/game-client/saves/slotMeta";
import { useCommands } from "../app/AppCommands.js";
import { useGameClock } from "../app/gameClock.js";
import { useServices } from "../app/ServicesContext.js";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { clubById, plateColours } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import { savedWhen } from "../start/savedWhen.js";
import "./saves.css";

/** The autosave first, then the slots a game can be started in. */
const SLOT_IDS = [AUTOSAVE_SLOT_ID, ...GAME_SLOT_IDS] as const;

type Slots = { kind: "loading" } | { kind: "ready"; saved: SlotMeta[] } | { kind: "failed" };
type Status = { text: string; isError: boolean } | null;

const seriesOf = (meta: SlotMeta) => (meta.division ? `Série ${meta.division}` : "Sem clube");
const yearOf = (meta: SlotMeta) => `${formatDayMonth(meta.date)} ${meta.season}`;
/** A game slot's number, the one in its name (Jogo 1 is 01); the autosave goes by its chip instead. */
const numberOf = (id: string) => (id === AUTOSAVE_SLOT_ID ? null : String(GAME_SLOT_IDS.findIndex((slotId) => slotId === id) + 1).padStart(2, "0"));

/** Every save of the game, the autosave included: save the open game, open another, or delete one. */
export function Saves() {
  const { engine, slots, game } = useServices();
  const navigate = useNavigate();
  const clock = useGameClock();
  const [list, setList] = useState<Slots>({ kind: "loading" });
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState<"saving" | "opening" | "removing" | null>(null);
  const [isConfirming, setConfirming] = useState(false);

  const refresh = useCallback(
    (isCurrent: () => boolean = () => true) =>
      slots.list().then(
        (saved) => isCurrent() && setList({ kind: "ready", saved }),
        () => isCurrent() && setList({ kind: "failed" }),
      ),
    [slots],
  );

  useEffect(() => {
    let current = true;
    void refresh(() => current);
    return () => {
      current = false;
    };
  }, [refresh]);

  const opened = game.current;
  async function save() {
    if (!opened || busy) return;
    setBusy("saving");
    try {
      await saveToSlot(engine, slots, opened.slotId, opened);
      setStatus({ text: `Salvo em ${slotLabel(opened.slotId)}.`, isError: false });
      setPickedId(opened.slotId);
    } catch {
      setStatus({ text: "Não deu para salvar.", isError: true });
    } finally {
      setBusy(null);
    }
    await refresh();
  }
  useCommands({ salvar: opened !== null && (() => void save()) });

  async function open(meta: SlotMeta) {
    setBusy("opening");
    setStatus(null);
    try {
      await loadFromSlot(engine, slots, meta.id);
      game.current = { slotId: meta.gameSlotId, coachName: meta.coachName };
      clock.refresh();
      navigate("/hub");
    } catch {
      setStatus({ text: "Não deu para abrir esse jogo.", isError: true });
      setBusy(null);
    }
  }

  async function remove(meta: SlotMeta) {
    setConfirming(false);
    if (busy) return;
    setBusy("removing");
    try {
      await slots.remove(meta.id);
      setStatus({ text: `${slotLabel(meta.id)} apagado.`, isError: false });
    } catch {
      setStatus({ text: "Não deu para apagar esse jogo.", isError: true });
    } finally {
      setBusy(null);
    }
    await refresh();
  }

  const saved = list.kind === "ready" ? list.saved : [];
  const byId = new Map(saved.map((meta) => [meta.id, meta]));
  const picked = byId.get(pickedId ?? "") ?? (opened ? byId.get(opened.slotId) : undefined) ?? saved[0] ?? null;
  const now = new Date();

  return (
    <div className="saves fills-screen">
      <section className="page saves-page" aria-labelledby="saves-title">
        <header className="saves-head">
          <h1 id="saves-title">Jogos salvos</h1>
          <p>O jogo salva sozinho no Automático a cada rodada.</p>
          {opened && (
            <button className="btn go" onClick={() => void save()} disabled={busy !== null}>
              <i className="ph-bold ph-floppy-disk" aria-hidden="true" />
              {busy === "saving" ? "Salvando…" : "Salvar agora"}
            </button>
          )}
        </header>
        {status && (
          <p className={status.isError ? "status error saves-status" : "status saves-status"} role="status">
            {status.text}
          </p>
        )}
        {list.kind === "failed" ? (
          <p className="status error">Não deu para ler os jogos salvos.</p>
        ) : (
          <ul className="saves-grid" aria-label="Vagas" aria-busy={list.kind === "loading"}>
            {SLOT_IDS.map((id) => {
              const meta = byId.get(id);
              const number = numberOf(id);
              if (!meta) {
                return (
                  <li key={id} className="slot saves-free">
                    {number && <b>{number}</b>}
                    {slotLabel(id)} · Vaga livre
                  </li>
                );
              }
              const club = meta.coachClubId ? clubById(meta.coachClubId) : null;
              const plate = club ? plateColours(club.colours) : null;
              const isPicked = meta.id === picked?.id;
              return (
                <li key={id}>
                  <button
                    className={isPicked ? "stk saves-card sel" : "stk saves-card"}
                    aria-pressed={isPicked}
                    aria-label={`${slotLabel(id)} · ${club?.shortName ?? "Sem clube"} · ${meta.coachName}`}
                    onClick={() => {
                      setPickedId(id);
                      setConfirming(false);
                    }}
                  >
                    <span className="saves-art" style={plate ? { background: plate.background, color: plate.text } : undefined}>
                      {number && <span className="saves-no">{number}</span>}
                      {id === AUTOSAVE_SLOT_ID && (
                        <span className="chip saves-auto">
                          <i className="ph-bold ph-arrows-clockwise" aria-hidden="true" />
                          Automático
                        </span>
                      )}
                      {club ? <Crest club={club} size={70} /> : <i className="ph-bold ph-briefcase saves-no-club" aria-hidden="true" />}
                    </span>
                    <span className="saves-tx">
                      <b className="saves-club">{club?.shortName ?? "Sem clube"}</b>
                      <span className="saves-coach">
                        {meta.coachName}
                        {id !== AUTOSAVE_SLOT_ID && ` · ${slotLabel(id)}`}
                      </span>
                      <span className="saves-dl">
                        <span>Jogo</span>
                        <b>
                          {seriesOf(meta)} · {yearOf(meta)}
                        </b>
                        <span>Salvo</span>
                        <b>{savedWhen(meta.savedAt, now)}</b>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="stk saves-det" aria-label="Jogo escolhido">
        {picked ? (
          <Details
            key={picked.id}
            meta={picked}
            isOpening={busy === "opening"}
            isBusy={busy !== null}
            isOpen={opened !== null && (picked.id === opened.slotId || (picked.id === AUTOSAVE_SLOT_ID && picked.gameSlotId === opened.slotId))}
            isConfirming={isConfirming}
            onOpen={() => void open(picked)}
            onAsk={() => setConfirming(true)}
            onCancel={() => setConfirming(false)}
            onRemove={() => void remove(picked)}
          />
        ) : (
          <p className="saves-none">{list.kind === "loading" ? "Lendo os jogos salvos…" : "Nenhum jogo salvo ainda."}</p>
        )}
      </aside>
    </div>
  );
}

type DetailsProps = {
  meta: SlotMeta;
  isOpening: boolean;
  /** A save or a load under way: nothing else may touch the slots until it ends. */
  isBusy: boolean;
  /** Whether this save is the game open now, so deleting or reloading it loses what was played since. */
  isOpen: boolean;
  isConfirming: boolean;
  onOpen: () => void;
  onAsk: () => void;
  onCancel: () => void;
  onRemove: () => void;
};

function Details({ meta, isOpening, isBusy, isOpen, isConfirming, onOpen, onAsk, onCancel, onRemove }: DetailsProps) {
  const club = meta.coachClubId ? clubById(meta.coachClubId) : null;
  const label = slotLabel(meta.id);
  const confirmTitle = useDialogFocus<HTMLParagraphElement>(isConfirming);
  return (
    <>
      <div className="saves-big">
        {club ? <Crest club={club} size={72} /> : <i className="ph-bold ph-briefcase saves-no-club" aria-hidden="true" />}
        <h2>
          {club?.shortName ?? "Sem clube"} {meta.season}
        </h2>
        <p>{meta.id === AUTOSAVE_SLOT_ID ? "Salvo sozinho pelo jogo" : `Salvo por você no ${label}`}</p>
      </div>
      <dl className="saves-facts">
        <dt>Data no jogo</dt>
        <dd>
          {formatBarDate(meta.date)} {meta.season}
        </dd>
        <dt>Divisão</dt>
        <dd>{seriesOf(meta)}</dd>
        <dt>Técnico</dt>
        <dd>{meta.coachName}</dd>
        <dt>Salvo</dt>
        <dd>{savedWhen(meta.savedAt, new Date())}</dd>
      </dl>
      <div className="saves-acts">
        <button className="btn saves-open" onClick={onOpen} disabled={isBusy}>
          <i className="ph-fill ph-play" aria-hidden="true" />
          {isOpening ? "Abrindo…" : "Carregar este jogo"}
        </button>
        <button className="btn flat saves-del" onClick={onAsk} disabled={isBusy}>
          <i className="ph-bold ph-trash" aria-hidden="true" />
          Apagar
        </button>
        {isConfirming && (
          <div
            className="note saves-confirm"
            role="alertdialog"
            aria-labelledby="saves-confirm-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") onCancel();
            }}
          >
            <p id="saves-confirm-title" ref={confirmTitle} tabIndex={-1}>
              Apagar o {label}? {isOpen ? "É o jogo aberto agora. " : ""}Não tem volta.
            </p>
            <button className="btn sm no" onClick={onRemove} disabled={isBusy}>
              Apagar o {label}
            </button>
            <button className="btn sm" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        )}
      </div>
    </>
  );
}
