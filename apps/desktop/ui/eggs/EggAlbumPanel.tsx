import type { EggAlbum } from "@boleiro/game-client/eggs/eggAlbum";
import { EggStickerCard, stickerNumber } from "./EggStickerCard.js";
import "./eggAlbumPanel.css";

/**
 * The career's rare stickers as an album page: every egg of the game has its slot, the ones found
 * stuck in with the day they turned up, the rest left as the empty outline the album prints. The
 * count is the only hint of how many there are.
 */
export function EggAlbumPanel({ album }: { album: EggAlbum }) {
  const byNumber = new Map(album.found.map((sticker) => [sticker.number, sticker]));
  return (
    <section className="egg-album" aria-labelledby="egg-album-title">
      <header className="egg-album-head">
        <h2 id="egg-album-title" className="history-section-title">
          Figurinhas raras da carreira
        </h2>
        <p className="egg-album-count" aria-label={`${album.found.length} de ${album.total}`}>
          <b aria-hidden="true">{album.found.length}</b>
          <span aria-hidden="true">de {album.total}</span>
        </p>
      </header>
      <ol className="egg-album-grid">
        {Array.from({ length: album.total }, (_, i) => {
          const number = i + 1;
          const sticker = byNumber.get(number);
          return (
            <li key={number} className={sticker?.look === "page" ? "wide" : undefined} style={{ ["--i" as string]: i }}>
              {sticker ? (
                <div className="egg-album-stuck" title={sticker.headline}>
                  <EggStickerCard sticker={sticker} />
                  {sticker.times > 1 && <span className="egg-album-times">{sticker.times}×</span>}
                </div>
              ) : (
                <span className="slot egg-album-slot" aria-label={`Figurinha ${stickerNumber(number)}, ainda escondida`}>
                  {stickerNumber(number)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
