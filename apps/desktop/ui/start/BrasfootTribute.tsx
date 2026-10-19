import { useRef, useState } from "react";
import { useDialogFocus } from "../app/useDialogFocus.js";
import { useTypedWord } from "../app/useTypedWord.js";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import "./brasfootTribute.css";

// The card folds back into its sticker this long after the close is asked (brasfootTribute.css, tribute-repeel).
const CLOSE_MS = 280;

/**
 * A thank-you to Brasfoot, hidden in the start menu's footer: a tiny sticker that peels at a hover and
 * opens on a click, or when the coach types "brasfoot". The card unpeels from the sticker, its old
 * monitor switches on and a pixel ball rolls into the net. Everything on it is drawn here; nothing is
 * Brasfoot's own. Facts: Brasfoot 2003 (pt.wikipedia.org/wiki/Brasfoot), inspired by Elifoot, written
 * by the Portuguese André Elias in 1987 (pt.wikipedia.org/wiki/Elifoot). The card thanks Brasfoot's
 * creator without a name: Wikipedia and brasfoot.com name nobody, and the one source found that does
 * (Máquina do Esporte, 1 September 2026) is too thin to print a person's name on.
 */
export function BrasfootTribute() {
  const [isOpen, setOpen] = useState(false);
  const [isClosing, setClosing] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const title = useDialogFocus<HTMLHeadingElement>(isOpen, { returnTo: opener });
  useTypedWord("brasfoot", () => open());

  function open() {
    setClosing(false);
    setOpen(true);
  }

  function close() {
    if (prefersReducedMotion()) {
      setOpen(false);
      return;
    }
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, CLOSE_MS);
  }

  return (
    <>
      <button ref={opener} className="tribute-sticker" aria-label="Uma homenagem ao Brasfoot" aria-expanded={isOpen} onClick={() => (isOpen ? close() : open())}>
        <span className="tribute-ball" aria-hidden="true" />
      </button>
      {isOpen && (
        <section
          className={isClosing ? "tribute closing" : "tribute"}
          role="dialog"
          aria-labelledby="tribute-title"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            close();
          }}
        >
          <div className="tribute-window">
            <header className="tribute-bar">
              <h2 id="tribute-title" ref={title} tabIndex={-1}>
                Valeu, Brasfoot
              </h2>
              <button className="tribute-x" aria-label="Fechar" onClick={close}>
                <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                  <path d="M0 0l8 8M8 0L0 8" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </button>
            </header>
            <PixelPitch />
            <div className="tribute-body">
              <p>
                Antes do Boleiro teve o Brasfoot. Lançado em 2003, filho do Elifoot que o português André Elias escreveu em 1987, foi nele que muita gente escalou o primeiro time e
                ficou vendo a rodada inteira, placar por placar.
              </p>
              <p>Este jogo existe porque a gente jogou muito Brasfoot. Obrigado a quem criou e a quem mantém o jogo vivo até hoje.</p>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

// GOL in three-by-five letters, one character a pixel.
const GOL = ["### ### #  ", "#   # # #  ", "# # # # #  ", "# # # # #  ", "### ### ###"];

// Who stands on the little pitch: the yellow side going right, the red one defending, its keeper on the line.
const PLAYERS: readonly (readonly [number, number, "home" | "away"])[] = [
  [18, 9, "home"], [24, 25, "home"], [44, 7, "home"], [56, 26, "home"],
  [33, 18, "away"], [52, 12, "away"], [62, 22, "away"], [70, 15, "away"],
];

/**
 * An old monitor's screen, drawn pixel by pixel (one unit a pixel, crisp edges): a striped pitch, two
 * sides of four, the goal on the right and a ball that rolls in and shakes the net.
 */
function PixelPitch() {
  const stripes = Array.from({ length: 8 }, (_, i) => i);
  return (
    <div className="tribute-crt" aria-hidden="true">
      <div className="tribute-screen">
        <svg className="tribute-pixels" viewBox="0 0 80 36" shapeRendering="crispEdges">
        {stripes.map((i) => (
          <rect key={i} x={i * 10} y="0" width="10" height="36" className={i % 2 ? "px-grass-2" : "px-grass"} />
        ))}
        <rect x="4" y="3" width="72" height="1" className="px-chalk" />
        <rect x="4" y="32" width="72" height="1" className="px-chalk" />
        <rect x="4" y="3" width="1" height="30" className="px-chalk" />
        <rect x="40" y="3" width="1" height="30" className="px-chalk" />
        <rect x="36" y="15" width="1" height="6" className="px-chalk" />
        <rect x="44" y="15" width="1" height="6" className="px-chalk" />
        <rect x="37" y="14" width="7" height="1" className="px-chalk" />
        <rect x="37" y="21" width="7" height="1" className="px-chalk" />
        <rect x="64" y="10" width="12" height="1" className="px-chalk" />
        <rect x="64" y="26" width="12" height="1" className="px-chalk" />
        <rect x="64" y="10" width="1" height="17" className="px-chalk" />
        <g className="px-net">
          {[13, 16, 19, 22].map((y) => (
            <rect key={y} x="77" y={y} width="2" height="1" className="px-mesh" />
          ))}
          <rect x="79" y="12" width="1" height="13" className="px-mesh" />
        </g>
        <rect x="76" y="12" width="1" height="13" className="px-post" />
        <rect x="76" y="12" width="3" height="1" className="px-post" />
        <rect x="76" y="24" width="3" height="1" className="px-post" />
        {PLAYERS.map(([x, y, side]) => (
          <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
            <rect width="2" height="2" className={side === "home" ? "px-gold" : "px-red"} />
            <rect y="2" width="2" height="1" className={side === "home" ? "px-blue" : "px-white"} />
          </g>
        ))}
        <g className="px-ball">
          <rect x="1" y="0" width="2" height="1" className="px-ink" />
          <rect x="0" y="1" width="4" height="2" className="px-white" />
          <rect x="1" y="1" width="1" height="1" className="px-ink" />
          <rect x="2" y="2" width="1" height="1" className="px-ink" />
          <rect x="1" y="3" width="2" height="1" className="px-ink" />
        </g>
        <g className="px-goal">
          <rect x="33" y="4" width="15" height="9" className="px-plate" />
          {GOL.flatMap((row, y) => [...row].map((dot, x) => (dot === "#" ? <rect key={`${x}-${y}`} x={35 + x} y={6 + y} width="1" height="1" className="px-gold" /> : null)))}
        </g>
        </svg>
        <span className="tribute-glass" />
      </div>
    </div>
  );
}
