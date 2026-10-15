import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { saveToSlot } from "@boleiro/game-client/saves/saveToSlot";
import { slotLabel } from "@boleiro/game-client/saves/slotMeta";
import { useServices } from "./ServicesContext.js";
import { useDialogFocus } from "./useDialogFocus.js";
import "./askBeforeDiscarding.css";

type Asking = {
  /** Runs `discard`, which throws the open game away, at once when nothing would be lost; otherwise asks the coach first. */
  askBeforeDiscarding: (discard: () => void) => void;
  /** The question while it is up; the screen renders it. */
  question: ReactNode;
};

export function useAskBeforeDiscarding(): Asking {
  const { game } = useServices();
  const [discard, setDiscard] = useState<(() => void) | null>(null);

  function askBeforeDiscarding(next: () => void) {
    if (game.current?.hasUnsavedPlay) setDiscard(() => next);
    else next();
  }

  const question = discard && (
    <DiscardQuestion
      onClose={(isDiscarding) => {
        setDiscard(null);
        if (isDiscarding) discard();
      }}
    />
  );
  return { askBeforeDiscarding, question };
}

/** Save the open game first, drop what it played since its last save, or keep playing it. */
function DiscardQuestion({ onClose }: { onClose: (isDiscarding: boolean) => void }) {
  const { engine, slots, game } = useServices();
  const [isSaving, setSaving] = useState(false);
  const [hasSaveFailed, setSaveFailed] = useState(false);
  const title = useDialogFocus<HTMLHeadingElement>(true, { isModal: true });
  const opened = game.current;

  async function saveAndGoOn() {
    if (!opened) return onClose(true);
    setSaving(true);
    setSaveFailed(false);
    try {
      await saveToSlot(engine, slots, opened.slotId, opened);
      onClose(true);
    } catch {
      setSaveFailed(true);
      setSaving(false);
    }
  }

  return createPortal(
    <div className="discard-veil">
      <section
        className="page discard"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="discard-title"
        aria-describedby="discard-what"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          if (!isSaving) onClose(false);
        }}
      >
        <i className="ph-bold ph-floppy-disk discard-icon" aria-hidden="true" />
        <h2 id="discard-title" ref={title} tabIndex={-1}>
          Salvar o jogo aberto?
        </h2>
        <p id="discard-what">
          Sem salvar, você perde o que foi jogado desde o último save.
        </p>
        {hasSaveFailed && (
          <p className="status error" role="status">
            Não deu para salvar.
          </p>
        )}
        <div className="discard-acts">
          <button className="btn go" onClick={() => void saveAndGoOn()} disabled={isSaving}>
            <i className="ph-bold ph-floppy-disk" aria-hidden="true" />
            {isSaving ? "Salvando…" : "Salvar e continuar"}
          </button>
          <button className="btn no" onClick={() => onClose(true)} disabled={isSaving}>
            Descartar
          </button>
          <button className="btn flat" onClick={() => onClose(false)} disabled={isSaving}>
            Cancelar
          </button>
        </div>
        {opened && <p className="discard-where">Salvar e continuar grava no {slotLabel(opened.slotId)}.</p>}
      </section>
    </div>,
    document.body,
  );
}
