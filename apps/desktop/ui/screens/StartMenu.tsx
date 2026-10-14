import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router";
import type { Club } from "@boleiro/data/clubs";
import { formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { loadFromSlot } from "@boleiro/game-client/saves/saveToSlot";
import { slotLabel, type SlotMeta } from "@boleiro/game-client/saves/slotMeta";
import wordmark from "../../../../design/logo/boleiro-wordmark-dark.svg";
import icon from "../../../../design/logo/boleiro-icon-small.svg";
import tauriConfig from "../../src-tauri/tauri.conf.json?raw";
import { platformOf } from "../app/platform.js";
import { useServices } from "../app/ServicesContext.js";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { CLUBS, clubById } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import { savedWhen } from "../start/savedWhen.js";
import "./startMenu.css";

type Slots = { kind: "loading" } | { kind: "ready"; slots: SlotMeta[] } | { kind: "failed" };

const PLATFORM_NAMES = { mac: "macOS", windows: "Windows", other: "" } as const;
const PLATFORM = PLATFORM_NAMES[platformOf(navigator.userAgent)];

/** The app's version, as the desktop build stamps it on the installer. */
function appVersion(config: string): string {
  const parsed: unknown = JSON.parse(config);
  return typeof parsed === "object" && parsed !== null && "version" in parsed && typeof parsed.version === "string" ? parsed.version : "";
}
const VERSION = appVersion(tauriConfig);

/**
 * The album's cover: three of the pack's stars as stickers, as the game's data names them. `no` is
 * the sticker's number in Boleiro's own album.
 */
const COVER_STICKERS = [
  { clubId: "flamengo-rj", name: "Samuel Lino", letter: "L", no: "012", x: 6, y: 70, tilt: -7 },
  { clubId: "palmeiras-sp", name: "José Manuel López", letter: "J", no: "047", x: 142, y: 18, tilt: 4 },
  { clubId: "santos-sp", name: "Neymar", letter: "N", no: "133", x: 252, y: 120, tilt: -3 },
] as const;

function clubOf(meta: SlotMeta): Club | null {
  return meta.coachClubId ? clubById(meta.coachClubId) : null;
}

function seriesOf(meta: SlotMeta): string | null {
  return meta.division ? `Série ${meta.division}` : null;
}

/** A game without a club already says so where the club name goes, so its details skip the series. */
function details(...parts: (string | null)[]): string {
  return parts.filter((part) => part !== null).join(" · ");
}

/** The newest save of each career other than the one on the Continuar card. */
function otherCareers(list: readonly SlotMeta[]): SlotMeta[] {
  const [latest, ...rest] = list;
  const seen = new Set(latest ? [latest.gameSlotId] : []);
  return rest.filter((meta) => !seen.has(meta.gameSlotId) && seen.add(meta.gameSlotId));
}

export function StartMenu() {
  const { engine, slots, game } = useServices();
  const navigate = useNavigate();
  const [saved, setSaved] = useState<Slots>({ kind: "loading" });
  const [opening, setOpening] = useState<string | null>(null);
  const [openFailed, setOpenFailed] = useState(false);
  const [isLoading, setLoading] = useState(false);
  const now = new Date();

  async function refresh() {
    try {
      const list = await slots.list();
      setSaved({ kind: "ready", slots: list });
      if (list.length === 0) setLoading(false);
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

  const list = saved.kind === "ready" ? saved.slots : [];
  const latest = list[0] ?? null;
  const latestClub = latest ? clubOf(latest) : null;
  const others = otherCareers(list);

  return (
    <div className="lobby fills-screen">
      <div className="lobby-spread">
        <section className="lobby-cover" aria-label="Boleiro">
          <span className="lobby-edition">Edição 2026 · Brasil</span>
          <img className="lobby-wordmark" src={wordmark} height={112} alt="Boleiro 2026" />
          <p className="lobby-pitch">Você é o técnico. Escala, contrata, negocia com a diretoria e vê a rodada inteira ao vivo.</p>
          <div className="lobby-pile" aria-hidden="true">
            {COVER_STICKERS.map((sticker, index) => (
              <CoverSticker key={sticker.no} {...sticker} order={index} />
            ))}
          </div>
          <p className="lobby-pack">
            <img src={icon} width={16} height={16} alt="" />
            <span>
              <b>Pacote de dados</b> · {CLUBS.length.toLocaleString("pt-BR")} times do Brasil
            </span>
          </p>
        </section>

        <div className="lobby-page page">
          {latest && (
            <section className="lobby-continue" aria-labelledby="continue-title">
              <h2 id="continue-title" className="lobby-title">
                Continuar
              </h2>
              <div className="stk lobby-last">
                {latestClub ? <Crest club={latestClub} size={78} /> : <span className="lobby-no-crest" aria-hidden="true" />}
                <div className="lobby-last-what">
                  <h3>{latestClub?.shortName ?? "Sem clube"}</h3>
                  <p>
                    Técnico <b>{latest.coachName}</b>
                    {seriesOf(latest) && ` · ${seriesOf(latest)}`}
                  </p>
                  <p className="lobby-last-meta">
                    <span>
                      <i className="ph-bold ph-calendar-dots" aria-hidden="true" />
                      {formatDayMonth(latest.date)} {latest.season}
                    </span>
                    <span>
                      <i className="ph-bold ph-floppy-disk" aria-hidden="true" />
                      {slotLabel(latest.id)} · salvo {savedWhen(latest.savedAt, now)}
                    </span>
                  </p>
                </div>
                <button className="btn go lobby-go" onClick={() => void open(latest)} disabled={opening !== null}>
                  <i className="ph-fill ph-play" aria-hidden="true" />
                  {opening === latest.id ? "Abrindo…" : "Continuar"}
                </button>
              </div>
            </section>
          )}

          {others.length > 0 && (
            <section className="lobby-others" aria-labelledby="others-title">
              <h2 id="others-title" className="lbl">
                Outras carreiras
              </h2>
              <ul aria-labelledby="others-title">
                {others.map((meta) => {
                  const club = clubOf(meta);
                  return (
                    <li key={meta.id}>
                      <button className="lobby-row" onClick={() => void open(meta)} disabled={opening !== null}>
                        <span className="lobby-row-crest">{club && <Crest club={club} size={28} />}</span>
                        <span>
                          <b>{club?.shortName ?? "Sem clube"}</b> <span className="mute">· {meta.coachName}</span>
                        </span>
                        <span className="mute">{details(seriesOf(meta) && `${seriesOf(meta)} ${meta.season}`, slotLabel(meta.id))}</span>
                        <span className="lobby-row-when">{opening === meta.id ? "Abrindo…" : savedWhen(meta.savedAt, now)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {saved.kind === "loading" && <p className="status">Lendo jogos salvos…</p>}
          {saved.kind === "failed" && <p className="status error">Não deu para ler os jogos salvos.</p>}
          {saved.kind === "ready" && list.length === 0 && (
            <header>
              <h2 className="lobby-title">Primeira carreira</h2>
              <p className="lobby-empty">Nenhum jogo salvo.</p>
            </header>
          )}
          {openFailed && <p className="status error">Esse jogo salvo não abriu.</p>}

          <Link to="/new-game" className={latest ? "slot lobby-fresh" : "slot lobby-fresh is-first"} aria-labelledby="fresh-title">
            <span className="lobby-plus" aria-hidden="true">
              <i className="ph-bold ph-plus" />
            </span>
            <span className="lobby-fresh-what">
              <b id="fresh-title">Novo jogo</b>
              <span>Qualquer um dos {CLUBS.length.toLocaleString("pt-BR")} times do pacote, do Flamengo ao Ivinhema.</span>
            </span>
            <span className={latest ? "btn" : "btn y"} aria-hidden="true">
              Escolher time
            </span>
          </Link>

          <footer className="lobby-acts">
            <button className="btn" onClick={() => setLoading(true)} disabled={list.length === 0}>
              <i className="ph-bold ph-folder-open" aria-hidden="true" />
              Carregar jogo
            </button>
            <Link to="/options" className="btn flat">
              <i className="ph-bold ph-gear-six" aria-hidden="true" />
              Opções
            </Link>
            <span className="lobby-version">
              Boleiro {VERSION}
              <br />
              {PLATFORM}
            </span>
          </footer>
        </div>
      </div>
      {isLoading && <SavedGames list={list} opening={opening} onOpen={(meta) => void open(meta)} onChanged={() => void refresh()} onClose={() => setLoading(false)} />}
    </div>
  );
}

type StickerProps = { clubId: string; name: string; letter: string; no: string; x: number; y: number; tilt: number; order: number };

/** A player sticker on the cover; it is dealt onto the pile when the game opens. */
function CoverSticker({ clubId, name, letter, no, x, y, tilt, order }: StickerProps) {
  const club = clubById(clubId);
  if (!club) return null;
  const photo = club.colours.primary.toUpperCase() === "#FFFFFF" ? "#2A2A2A" : club.colours.primary;
  const style: CSSProperties & Record<`--${string}`, string> = {
    left: `${x}px`,
    top: `${y}px`,
    "--tilt": `${tilt}deg`,
    "--deal": `${order * 90 + 120}ms`,
  };
  return (
    <div className="lobby-sticker" style={style}>
      <div className="lobby-sticker-photo" style={{ background: photo }}>
        <span className="lobby-sticker-crest">
          <Crest club={club} size={22} />
        </span>
        <b>{letter}</b>
        <span className="lobby-sticker-no">{no}</span>
      </div>
      <div className="lobby-sticker-name">{name}</div>
      <div className="lobby-sticker-club">{club.shortName}</div>
    </div>
  );
}

type SavedGamesProps = {
  list: readonly SlotMeta[];
  opening: string | null;
  onOpen: (meta: SlotMeta) => void;
  onChanged: () => void;
  onClose: () => void;
};

/** Every save, autosave included, to open or delete; the saves screen will take its place. */
function SavedGames({ list, opening, onOpen, onChanged, onClose }: SavedGamesProps) {
  const { slots } = useServices();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);
  // The sheet takes focus once, when it opens, and hands it back to Carregar jogo when it closes.
  const title = useDialogFocus<HTMLHeadingElement>(true);
  const confirmTitle = useDialogFocus<HTMLParagraphElement>(deleting !== null);
  const now = new Date();

  async function remove(id: string) {
    setDeleting(null);
    setDeleteFailed(false);
    try {
      await slots.remove(id);
    } catch {
      setDeleteFailed(true);
    }
    onChanged();
  }

  return (
    <div
      className="lobby-veil"
      onClick={(event) => event.target === event.currentTarget && onClose()}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        if (deleting) setDeleting(null);
        else onClose();
      }}
    >
      <div className="page lobby-saves" role="dialog" aria-modal="true" aria-labelledby="saves-title">
        <header className="lobby-saves-head">
          <h2 id="saves-title" ref={title} tabIndex={-1} className="lobby-title">
            Jogos salvos
          </h2>
          <button className="btn sm" onClick={onClose}>
            Fechar
          </button>
        </header>
        <ul className="lobby-saves-list">
          {list.map((meta) => {
            const club = clubOf(meta);
            const label = slotLabel(meta.id);
            return (
              <li key={meta.id} className="lobby-save">
                <button className="lobby-save-open" onClick={() => onOpen(meta)} disabled={opening !== null}>
                  <span className="lobby-row-crest">{club && <Crest club={club} size={30} />}</span>
                  <span className="lobby-save-main">
                    <b>{club?.shortName ?? "Sem clube"}</b>
                    <span className="mute">{details(label, meta.coachName, seriesOf(meta))}</span>
                  </span>
                  <span className="lobby-row-when">
                    {opening === meta.id ? "Abrindo…" : `${formatDayMonth(meta.date)} ${meta.season}`}
                    <small>salvo {savedWhen(meta.savedAt, now)}</small>
                  </span>
                </button>
                <button className="lobby-save-delete" aria-label={`Apagar ${label}`} title={`Apagar ${label}`} onClick={() => setDeleting(meta.id)}>
                  <i className="ph-bold ph-trash" aria-hidden="true" />
                </button>
                {deleting === meta.id && (
                  <div className="note lobby-confirm" role="alertdialog" aria-labelledby={`delete-${meta.id}`}>
                    <p id={`delete-${meta.id}`} ref={confirmTitle} tabIndex={-1}>
                      Apagar o {label}?
                    </p>
                    <button className="btn sm no" onClick={() => void remove(meta.id)}>
                      Apagar
                    </button>
                    <button className="btn sm" onClick={() => setDeleting(null)}>
                      Cancelar
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {deleteFailed && <p className="status error">Não deu para apagar esse jogo.</p>}
      </div>
    </div>
  );
}
