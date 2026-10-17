import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { IsoDate } from "@boleiro/engine/sim/gameState";
import type { EggSticker } from "@boleiro/game-client/eggs/eggAlbum";
import { useServices } from "../app/ServicesContext.js";
import { prefersReducedMotion } from "../motion/reducedMotion.js";
import { EggStickerCard, RARITY_NAMES } from "./EggStickerCard.js";
import "./eggReveal.css";

// The reveal stays this long unless the coach closes it, and takes this long to peel away.
const SHOWN_MS = 9000;
const LEAVE_MS = 320;

/**
 * The rare stickers the career finds while the coach plays: read again whenever the game's day moves
 * (or `bump` changes), each new sticker or special page queued for the reveal once. Clippings only go
 * to the newspaper and the album. The ones found before the game was opened are not revealed.
 */
export function useFoundStickers(isInGame: boolean, date: IsoDate | null, bump: number): { shown: EggSticker | null; dismiss: () => void } {
  const { engine } = useServices();
  const known = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<EggSticker[]>([]);
  useEffect(() => {
    if (!isInGame) {
      known.current = null;
      setQueue([]);
      return;
    }
    let current = true;
    engine.eggAlbum().then(
      (album) => {
        if (!current) return;
        const seen = known.current;
        known.current = new Set(album.found.map((sticker) => sticker.eggId));
        if (!seen) return;
        const fresh = album.found.filter((sticker) => !seen.has(sticker.eggId) && sticker.look !== "clipping");
        if (fresh.length) setQueue((waiting) => [...waiting, ...fresh]);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [engine, isInGame, date, bump]);
  return { shown: queue[0] ?? null, dismiss: () => setQueue((waiting) => waiting.slice(1)) };
}

/**
 * A rare sticker turning up, in the corner and out of the way: a foil packet slides in and tears
 * open, the sticker rises out of it and lands, and its note unrolls beside it. It never blocks play;
 * it peels away by itself after a while, or when closed.
 */
export function EggReveal({ sticker, onDone }: { sticker: EggSticker; onDone: () => void }) {
  const [isLeaving, setLeaving] = useState(false);
  const latest = useRef(onDone);
  useEffect(() => {
    latest.current = onDone;
  });
  const leave = useCallback(() => {
    if (prefersReducedMotion()) {
      latest.current();
      return;
    }
    setLeaving(true);
    window.setTimeout(() => latest.current(), LEAVE_MS);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(leave, SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [leave]);

  const kind = sticker.look === "page" ? "Página especial" : "Figurinha rara";
  return (
    <aside className={isLeaving ? "egg-reveal leaving" : "egg-reveal"} role="status" aria-label={kind}>
      <div className="egg-reveal-stage" aria-hidden="true">
        <span className="egg-packet">
          <span className="egg-packet-top" />
          <span className="egg-packet-print">
            <b>Boleiro</b>
            {kind}
          </span>
        </span>
      </div>
      <div className="egg-reveal-sticker">
        <EggStickerCard sticker={sticker} />
      </div>
      <div className="egg-reveal-note">
        <span className="lbl">{RARITY_NAMES[sticker.rarity]}</span>
        <p className="egg-reveal-title">{sticker.headline}</p>
        <div className="egg-reveal-acts">
          <Link className="btn sm" to="/history?aba=raridades" onClick={leave}>
            Ver no álbum
          </Link>
          <button className="btn sm flat" onClick={leave}>
            Fechar
          </button>
        </div>
      </div>
    </aside>
  );
}
