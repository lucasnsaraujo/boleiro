import { useRef, useState } from "react";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { useTypedWord } from "../app/useTypedWord.js";
import "./brasfootTribute.css";

/**
 * A thank-you to Brasfoot, hidden in the start menu's footer: a tiny sticker that peels at a hover and
 * opens on a click, or when the coach types "brasfoot". The card winks at the grey windows of the
 * old PC games; it is drawn here and copies nothing of Brasfoot's own.
 */
export function BrasfootTribute() {
  const [isOpen, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const title = useDialogFocus<HTMLHeadingElement>(isOpen, { returnTo: opener });
  useTypedWord("brasfoot", () => setOpen(true));

  return (
    <>
      <button ref={opener} className="tribute-sticker" aria-label="Uma homenagem ao Brasfoot" aria-expanded={isOpen} onClick={() => setOpen(!isOpen)}>
        <span className="tribute-ball" aria-hidden="true" />
      </button>
      {isOpen && (
        <section
          className="tribute"
          role="dialog"
          aria-labelledby="tribute-title"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setOpen(false);
          }}
        >
          <header className="tribute-bar">
            <h2 id="tribute-title" ref={title} tabIndex={-1}>
              Valeu, Brasfoot
            </h2>
            <button className="tribute-x" aria-label="Fechar" onClick={() => setOpen(false)}>
              <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                <path d="M0 0l8 8M8 0L0 8" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </button>
          </header>
          <div className="tribute-body">
            <p>Antes do Boleiro teve o Brasfoot, lançado em 2003. Foi nele que muita gente escalou o primeiro time e ficou vendo a rodada inteira, placar por placar.</p>
            <p>Este jogo existe porque a gente jogou muito Brasfoot. Obrigado a quem criou.</p>
          </div>
        </section>
      )}
    </>
  );
}
