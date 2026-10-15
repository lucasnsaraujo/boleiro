import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router";
import type { Division } from "@boleiro/data/players";
import type { Board } from "@boleiro/engine/sim/coach/boardExpectations";
import { formatDayMonth, formatGameDate } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import { saveToSlot } from "@boleiro/game-client/saves/saveToSlot";
import { gameSlots, type GameSlot } from "@boleiro/game-client/saves/slotMeta";
import { boardGoal, clubChoices, filterClubs, statesOf, type ClubChoice, type ClubFilter } from "@boleiro/game-client/screens/clubChoices";
import wordmark from "../../../../design/logo/boleiro-wordmark.svg";
import wordmarkDark from "../../../../design/logo/boleiro-wordmark-dark.svg";
import { useServices } from "../app/ServicesContext.js";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { CLUBS, clubById } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import { Select } from "../controls/Select.js";
import { clubPreviews, PREVIEW_KEYS, type ClubPreviews } from "../newGame/clubPreview.js";
import "./newGame.css";

type Choice = { mode: "club"; choice: ClubChoice } | { mode: "career" };
type Season = { date: string; boards: Readonly<Record<string, Board>>; previews: ClubPreviews };

const DIVISIONS: readonly Division[] = ["A", "B", "C", "D"];
const COACH_NAME_MAX = 40;
// The first stickers of the grid are dealt one after another; past these, the rest land together.
const DEALT_STICKERS = 20;

function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/**
 * Draws the season once with no coach, to show each board's goal and each squad. The real game then
 * starts from the same seed, so what the screen shows is what the coach gets.
 */
function useDrawnSeason(seed: number): Season | null {
  const { engine, game } = useServices();
  const [season, setSeason] = useState<Season | null>(null);
  useEffect(() => {
    let current = true;
    game.current = null;
    engine
      .apply({ type: "newGame", seed, choices: { coachClubId: null } })
      .then(() => engine.read([...PREVIEW_KEYS, "boards", "date"]))
      .then(
        (read) => current && setSeason({ date: read.date, boards: read.boards, previews: clubPreviews(read) }),
        () => undefined,
      );
    return () => {
      current = false;
    };
  }, [engine, game, seed]);
  return season;
}

function slotSummary(slot: GameSlot): string {
  if (!slot.meta) return "Vazio";
  const club = slot.meta.coachClubId ? (clubById(slot.meta.coachClubId)?.shortName ?? "Sem clube") : "Sem clube";
  return `${club}, ${slot.meta.coachName}, ${formatGameDate(slot.meta.date)}`;
}

export function NewGame() {
  const { engine, slots, game } = useServices();
  const navigate = useNavigate();
  const [seed] = useState(newSeed);
  const season = useDrawnSeason(seed);
  const [filter, setFilter] = useState<ClubFilter>({ query: "", division: null, state: null });
  const [picked, setPicked] = useState<Choice | null>(null);
  const [coachName, setCoachName] = useState("");
  const [saved, setSaved] = useState<GameSlot[] | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [playsEstaduais, setPlaysEstaduais] = useState(true);
  const [failed, setFailed] = useState(false);

  const choices = useMemo(() => clubChoices(CLUBS, season?.boards ?? null), [season]);
  const states = useMemo(() => statesOf(choices), [choices]);
  const shown = filterClubs(choices, filter);
  const pickedClubId = picked?.mode === "club" ? picked.choice.club.id : null;
  const pickedChoice = choices.find(({ club }) => club.id === pickedClubId) ?? null;

  useEffect(() => {
    let current = true;
    slots.list().then(
      (list) => {
        if (!current) return;
        const offered = gameSlots(list);
        setSaved(offered);
        setSlotId((offered.find((slot) => slot.meta === null) ?? offered[0])?.id ?? null);
      },
      () => current && setSaved(gameSlots([])),
    );
    return () => {
      current = false;
    };
  }, [slots]);

  const name = coachName.trim();
  const target = saved?.find((slot) => slot.id === slotId) ?? null;
  const startButton = useRef<HTMLButtonElement>(null);
  const confirmTitle = useDialogFocus<HTMLParagraphElement>(confirming && target !== null, { returnTo: startButton });

  async function start(slot: GameSlot) {
    if (!picked) return;
    setConfirming(false);
    setStarting(true);
    setFailed(false);
    try {
      const coachClubId = picked.mode === "club" ? picked.choice.club.id : null;
      await engine.apply({ type: "newGame", seed, choices: { coachClubId, careerMode: picked.mode === "career", stateChampionships: playsEstaduais } });
      const opened = { slotId: slot.id, coachName: name };
      await saveToSlot(engine, slots, slot.id, opened);
      game.current = opened;
      navigate("/hub");
    } catch {
      setFailed(true);
      setStarting(false);
    }
  }

  function requestStart() {
    if (!target || !name || !picked) return;
    if (target.meta) setConfirming(true);
    else void start(target);
  }

  return (
    <div className="career-new fills-screen">
      <header className="career-new-top" data-tauri-drag-region>
        <img className="career-new-mark" src={wordmark} height={28} alt="Boleiro" />
        <img className="career-new-mark dark" src={wordmarkDark} height={28} alt="" />
        <span className="lbl">Nova carreira</span>
        <Link to="/" className="btn sm career-new-back">
          <i className="ph-bold ph-arrow-left" aria-hidden="true" />
          Voltar
        </Link>
      </header>
      <div className="career-new-spread">
        <section className="page career-new-left" aria-labelledby="coach-title">
          <h2 id="coach-title" className="career-new-title">
            Seu técnico
          </h2>
          <form
            className="career-new-form"
            onSubmit={(event) => {
              event.preventDefault();
              requestStart();
            }}
          >
            <label className="career-new-name">
              <span className="lbl">Nome</span>
              <span className="field">
                <input
                  type="text"
                  aria-label="Nome do técnico"
                  placeholder="Como a imprensa vai te chamar"
                  maxLength={COACH_NAME_MAX}
                  autoComplete="off"
                  value={coachName}
                  onChange={(event) => setCoachName(event.target.value)}
                />
                <i className="ph-bold ph-pencil-simple" aria-hidden="true" />
              </span>
            </label>

            <PickedCard picked={picked} />
            {pickedChoice && <ClubFacts choice={pickedChoice} season={season} />}

            <div className="career-new-free">
              <p>
                <b id="career-mode-title">Começar sem clube</b>
                <br />
                <span className="mute">No primeiro dia, três times pequenos fazem proposta.</span>
              </p>
              <button
                type="button"
                className={picked?.mode === "career" ? "sw on" : "sw"}
                aria-label="Modo carreira"
                aria-pressed={picked?.mode === "career"}
                onClick={() => setPicked(picked?.mode === "career" ? null : { mode: "career" })}
              />
            </div>

            <div className="career-new-free">
              <p>
                <b>Estaduais</b>
                <br />
                <span className="mute">{playsEstaduais ? "De janeiro a março, antes do Brasileirão." : "Sem estaduais, o ranking nacional dá as vagas da Copa do Brasil e da Série D."}</span>
              </p>
              <button type="button" className={playsEstaduais ? "sw on" : "sw"} aria-label="Estaduais" aria-pressed={playsEstaduais} onClick={() => setPlaysEstaduais(!playsEstaduais)} />
            </div>

            <fieldset className="career-new-slots">
              <legend className="lbl">Salvar em</legend>
              {saved === null && <p className="status">Lendo jogos salvos…</p>}
              <div className="career-new-slot-row">
                {saved?.map((slot) => (
                  <label key={slot.id} className={slot.id === slotId ? "career-new-slot on" : "career-new-slot"} title={slotSummary(slot)}>
                    <input
                      type="radio"
                      name="slot"
                      value={slot.id}
                      checked={slot.id === slotId}
                      onChange={() => {
                        setSlotId(slot.id);
                        setConfirming(false);
                      }}
                    />
                    <b>{slot.label}</b>
                    <span>{slot.meta ? (slot.meta.coachClubId ? (clubById(slot.meta.coachClubId)?.shortName ?? "Sem clube") : "Sem clube") : "Vazio"}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="career-new-go">
              {confirming && target ? (
                <div className="note career-new-confirm" role="alertdialog" aria-labelledby="confirm-title">
                  <p id="confirm-title" ref={confirmTitle} tabIndex={-1} className="career-new-confirm-title">
                    Substituir o {target.label}?
                  </p>
                  <p>{slotSummary(target)} será apagado.</p>
                  <div className="career-new-confirm-acts">
                    <button type="button" className="btn sm no" onClick={() => void start(target)}>
                      Substituir
                    </button>
                    <button type="button" className="btn sm" onClick={() => setConfirming(false)}>
                      Escolher outro
                    </button>
                  </div>
                </div>
              ) : (
                <button ref={startButton} type="submit" className="btn go lg" disabled={!name || !target || !picked || starting}>
                  {starting ? "Montando a temporada…" : "Começar carreira"}
                  {!starting && <i className="ph-fill ph-play" aria-hidden="true" />}
                </button>
              )}
              <small>{season ? `A temporada ${season.date.slice(0, 4)} começa em ${formatGameDate(season.date)}.` : "Sorteando a temporada…"}</small>
              {failed && <p className="status error">Não deu para criar o jogo.</p>}
            </div>
          </form>
        </section>

        <section className="page career-new-right" aria-labelledby="clubs-title">
          <div className="career-new-head">
            <h2 id="clubs-title" className="career-new-title">
              Escolha seu time
            </h2>
            <Select
              label="Divisão"
              value={filter.division ?? ""}
              options={[{ value: "", label: "Todas" }, ...DIVISIONS.map((division) => ({ value: division, label: `Série ${division}` }))]}
              onChange={(value) => setFilter({ ...filter, division: DIVISIONS.find((division) => division === value) ?? null })}
            />
            <Select
              label="Estado"
              value={filter.state ?? ""}
              options={[{ value: "", label: "Todos" }, ...states.map((state) => ({ value: state, label: state }))]}
              onChange={(value) => setFilter({ ...filter, state: states.find((state) => state === value) ?? null })}
            />
            <label className="field career-new-search">
              <i className="ph-bold ph-magnifying-glass" aria-hidden="true" />
              <input type="search" aria-label="Buscar clube" placeholder="Buscar time…" value={filter.query} onChange={(event) => setFilter({ ...filter, query: event.target.value })} />
            </label>
          </div>

          <div className="career-new-grid">
            <ul className="career-new-clubs" aria-label="Clubes">
              {shown.map(({ club }, index) => {
                const isMine = club.id === pickedClubId;
                const preview = season?.previews[club.id];
                const style: CSSProperties & Record<`--${string}`, string> = { "--deal": `${Math.min(index, DEALT_STICKERS) * 18}ms` };
                return (
                  <li key={club.id} style={style}>
                    <button className={isMine ? "stk career-new-club mine" : "stk career-new-club"} aria-label={club.shortName} aria-pressed={isMine} onClick={() => setPicked({ mode: "club", choice: { club, goal: null } })}>
                      <span className="career-new-no">{String(index + 1).padStart(2, "0")}</span>
                      <Crest club={club} size={48} />
                      <span className="career-new-club-name">{club.shortName}</span>
                      <span className={isMine ? "career-new-club-meta yours" : "career-new-club-meta"}>{isMine ? "Seu time" : preview ? `Força ${preview.strength}` : "Força …"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {shown.length === 0 && <p className="career-new-none">Nenhum clube com esse filtro.</p>}
          </div>
          <footer className="career-new-legend">
            <span>Força é a média dos 11 titulares.</span>
            <span>
              {shown.length} {shown.length === 1 ? "time" : "times"}
              {filter.division && ` · Série ${filter.division}`}
            </span>
          </footer>
        </section>
      </div>
    </div>
  );
}

function PickedCard({ picked }: { picked: Choice | null }) {
  if (!picked) {
    return (
      <div className="slot career-new-pick empty">
        <span className="career-new-pick-hole" aria-hidden="true" />
        <p>Escolha um time ao lado.</p>
      </div>
    );
  }
  if (picked.mode === "career") {
    return (
      <div key="career" className="stk career-new-pick">
        <span className="career-new-pick-free" aria-hidden="true">
          <i className="ph-bold ph-briefcase" />
        </span>
        <div>
          <h3>Sem clube</h3>
          <p>Ninguém conhece seu nome ainda.</p>
        </div>
      </div>
    );
  }
  const { club } = picked.choice;
  return (
    <div key={club.id} className="stk career-new-pick">
      <Crest club={club} size={70} />
      <div>
        <h3>{club.shortName}</h3>
        <p>
          {club.state} · {club.stadium}, {club.capacity.toLocaleString("pt-BR")} lugares
        </p>
      </div>
    </div>
  );
}

function ClubFacts({ choice, season }: { choice: ClubChoice; season: Season | null }) {
  const { club } = choice;
  const preview = season?.previews[club.id];
  const board = season?.boards[club.id];
  const debut = preview?.debut;
  const opponent = debut ? clubById(debut.opponentId) : null;
  const wait = "…";
  return (
    <dl className="career-new-facts">
      <dt>Força do elenco</dt>
      <dd>{preview ? `${preview.strength} · ${preview.rank}ª da Série ${club.division}` : wait}</dd>
      <dt>Caixa</dt>
      <dd>{preview ? formatMoney(preview.cash) : wait}</dd>
      <dt>Folha mensal</dt>
      <dd>{preview ? formatMoney(preview.monthlyWages) : wait}</dd>
      <dt>A diretoria quer</dt>
      <dd>{board ? boardGoal(board, club.division) : wait}</dd>
      <dt>Estreia</dt>
      <dd>{debut && opponent ? `${opponent.shortName}, ${debut.isHome ? "em casa" : "fora"} · ${formatDayMonth(debut.date)}` : wait}</dd>
    </dl>
  );
}

