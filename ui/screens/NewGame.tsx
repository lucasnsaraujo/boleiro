import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { Division } from "../../src/data/players.js";
import type { Board } from "../../src/sim/coach/boardExpectations.js";
import { useServices } from "../app/ServicesContext.js";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { CLUBS, clubById } from "../clubs/clubCatalog.js";
import { ClubPlate } from "../clubs/ClubPlate.js";
import { Crest } from "../clubs/Crest.js";
import { formatGameDate } from "../format/formatGameDate.js";
import { saveToSlot } from "../saves/saveToSlot.js";
import { gameSlots, type GameSlot } from "../saves/slotMeta.js";
import { clubChoices, filterClubs, statesOf, type ClubChoice, type ClubFilter } from "./clubChoices.js";
import "./newGame.css";

type Mode = "club" | "career";
type Choice = { mode: "club"; choice: ClubChoice } | { mode: "career" };

const DIVISIONS: readonly Division[] = ["A", "B", "C", "D"];
const COACH_NAME_MAX = 40;

function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/**
 * Draws the season once with no coach, to show each board's goal. The real game then starts from the
 * same seed, so the goals shown are the ones the boards set.
 */
function useBoards(seed: number): Readonly<Record<string, Board>> | null {
  const { engine, game } = useServices();
  const [boards, setBoards] = useState<Readonly<Record<string, Board>> | null>(null);
  useEffect(() => {
    let current = true;
    game.current = null;
    engine
      .newGame(seed, { coachClubId: null })
      .then(() => engine.read(["boards"]))
      .then(
        (read) => current && setBoards(read.boards),
        () => undefined,
      );
    return () => {
      current = false;
    };
  }, [engine, game, seed]);
  return boards;
}

export function NewGame() {
  const [seed] = useState(newSeed);
  const boards = useBoards(seed);
  const [mode, setMode] = useState<Mode>("club");
  const [picked, setPicked] = useState<Choice | null>(null);

  if (picked) return <CoachAndSlot seed={seed} picked={picked} onBack={() => setPicked(null)} />;

  return (
    <div className="new-game">
      <header className="new-game-head">
        <h1 className="screen-title">Novo jogo</h1>
        <div className="tabs" role="tablist" aria-label="Como começar">
          <button role="tab" aria-selected={mode === "club"} onClick={() => setMode("club")}>
            Escolher clube
          </button>
          <button role="tab" aria-selected={mode === "career"} onClick={() => setMode("career")}>
            Modo carreira
          </button>
        </div>
      </header>
      {mode === "club" ? (
        <ClubPicker boards={boards} onPick={(choice) => setPicked({ mode: "club", choice })} />
      ) : (
        <section className="career" role="tabpanel" aria-label="Modo carreira">
          <h2 className="career-title">Você começa sem clube</h2>
          <p className="career-text">Ninguém conhece seu nome. No primeiro dia, três times pequenos fazem proposta.</p>
          <button className="btn-main" onClick={() => setPicked({ mode: "career" })}>
            Começar carreira
          </button>
        </section>
      )}
    </div>
  );
}

function ClubPicker({ boards, onPick }: { boards: Readonly<Record<string, Board>> | null; onPick: (choice: ClubChoice) => void }) {
  const [filter, setFilter] = useState<ClubFilter>({ query: "", division: null, state: null });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const choices = useMemo(() => clubChoices(CLUBS, boards), [boards]);
  const states = useMemo(() => statesOf(choices), [choices]);
  const shown = filterClubs(choices, filter);
  const selected = choices.find(({ club }) => club.id === selectedId) ?? null;

  return (
    <div className="picker" role="tabpanel" aria-label="Escolher clube">
      <div className="picker-list">
        <div className="filters">
          <input
            type="search"
            className="search"
            aria-label="Buscar clube"
            placeholder="Buscar clube"
            value={filter.query}
            onChange={(event) => setFilter({ ...filter, query: event.target.value })}
          />
          <div className="divisions" role="group" aria-label="Divisão">
            <button aria-pressed={filter.division === null} onClick={() => setFilter({ ...filter, division: null })}>
              Todas
            </button>
            {DIVISIONS.map((division) => (
              <button key={division} aria-pressed={filter.division === division} aria-label={`Série ${division}`} onClick={() => setFilter({ ...filter, division })}>
                {division}
              </button>
            ))}
          </div>
          <select
            className="state"
            aria-label="Estado"
            value={filter.state ?? ""}
            onChange={(event) => setFilter({ ...filter, state: states.find((state) => state === event.target.value) ?? null })}
          >
            <option value="">Todos os estados</option>
            {states.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </div>
        <div className="club-head" aria-hidden="true">
          <span />
          <span>Clube</span>
          <span>Série</span>
          <span>UF</span>
          <span>Meta da diretoria</span>
        </div>
        <ul className="clubs" aria-label="Clubes">
          {shown.map(({ club, goal }) => (
            <li key={club.id}>
              <button className="club-row" aria-label={club.shortName} aria-pressed={club.id === selectedId} onClick={() => setSelectedId(club.id)}>
                <Crest club={club} size={24} />
                <span className="club-name">{club.shortName}</span>
                <span className="club-division">{club.division}</span>
                <span className="club-state">{club.state}</span>
                <span className="club-goal">{goal ?? "…"}</span>
              </button>
            </li>
          ))}
        </ul>
        {shown.length === 0 && <p className="status">Nenhum clube com esse filtro.</p>}
      </div>
      <aside className="picked" aria-live="polite">
        {selected ? (
          <>
            <Crest club={selected.club} size={88} />
            <ClubPlate club={selected.club} />
            <p className="picked-facts">
              {selected.club.name}
              <br />
              Série {selected.club.division} · {selected.club.state} · {selected.club.stadium}
            </p>
            <p className="picked-goal-label">Meta da diretoria</p>
            <p className="picked-goal">{selected.goal ?? "…"}</p>
            <button className="btn-main" onClick={() => onPick(selected)}>
              Assumir o clube
            </button>
          </>
        ) : (
          <p className="picked-empty">Nenhum clube escolhido.</p>
        )}
      </aside>
    </div>
  );
}

function slotSummary(slot: GameSlot): string {
  if (!slot.meta) return "Vazio";
  const club = slot.meta.coachClubId ? (clubById(slot.meta.coachClubId)?.shortName ?? "Sem clube") : "Sem clube";
  return `${club}, ${slot.meta.coachName}, ${formatGameDate(slot.meta.date)}`;
}

function CoachAndSlot({ seed, picked, onBack }: { seed: number; picked: Choice; onBack: () => void }) {
  const { engine, slots, game } = useServices();
  const navigate = useNavigate();
  const [coachName, setCoachName] = useState("");
  const [saved, setSaved] = useState<GameSlot[] | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);

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
    setConfirming(false);
    setStarting(true);
    setFailed(false);
    try {
      const coachClubId = picked.mode === "club" ? picked.choice.club.id : null;
      await engine.newGame(seed, { coachClubId, careerMode: picked.mode === "career" });
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
    if (!target || !name) return;
    if (target.meta) setConfirming(true);
    else void start(target);
  }

  return (
    <div className="coach-step">
      <section className="coach-choice">
        {picked.mode === "club" ? (
          <>
            <Crest club={picked.choice.club} size={64} />
            <h1 className="screen-title">{picked.choice.club.shortName}</h1>
            <p className="screen-sub">
              Série {picked.choice.club.division} · Meta: {picked.choice.goal ?? "…"}
            </p>
          </>
        ) : (
          <>
            <h1 className="screen-title">Modo carreira</h1>
            <p className="screen-sub">Sem clube, à espera de propostas.</p>
          </>
        )}
        <button className="btn-quiet back" onClick={onBack}>
          Voltar
        </button>
      </section>
      <form
        className="coach-form"
        onSubmit={(event) => {
          event.preventDefault();
          requestStart();
        }}
      >
        <label className="field-label" htmlFor="coach-name">
          Nome do técnico
        </label>
        <input id="coach-name" className="name-input" type="text" maxLength={COACH_NAME_MAX} autoComplete="off" value={coachName} onChange={(event) => setCoachName(event.target.value)} />
        <fieldset className="slots">
          <legend className="field-label">Salvar em</legend>
          {saved === null && <p className="status">Lendo jogos salvos…</p>}
          {saved?.map((slot) => (
            <label key={slot.id} className="slot-option">
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
              <span className="slot-option-label">{slot.label}</span>
              <span className={slot.meta ? "slot-option-game" : "slot-option-game empty"}>{slotSummary(slot)}</span>
            </label>
          ))}
        </fieldset>
        {confirming && target ? (
          <div className="confirm" role="alertdialog" aria-labelledby="confirm-title">
            <p id="confirm-title" ref={confirmTitle} tabIndex={-1} className="confirm-title">
              Substituir o {target.label}?
            </p>
            <p className="confirm-text">{slotSummary(target)} será apagado.</p>
            <div className="confirm-actions">
              <button type="button" className="btn-danger" onClick={() => void start(target)}>
                Substituir
              </button>
              <button type="button" className="btn-quiet" onClick={() => setConfirming(false)}>
                Escolher outro
              </button>
            </div>
          </div>
        ) : (
          <button ref={startButton} type="submit" className="btn-main" disabled={!name || !target || starting}>
            {starting ? "Montando a temporada…" : "Começar"}
          </button>
        )}
        {failed && <p className="status error">Não deu para criar o jogo.</p>}
      </form>
    </div>
  );
}
