import { eggBookOf } from "@boleiro/engine/sim/eggs/eggBook";
import { EGG_BANK } from "@boleiro/engine/sim/eggs/eggBank";
import type { EggLook, EggRarity } from "@boleiro/engine/sim/eggs/eggType";
import type { GameState, IsoDate } from "@boleiro/engine/sim/gameState";

/** An egg in the album: when it was first found and its headline then, and how many times it was found. */
export type EggSticker = { eggId: string; title: string; look: EggLook; rarity: EggRarity; date: IsoDate; headline: string; times: number };

/** The eggs the career found, each once, oldest first, out of `total` in the game. */
export type EggAlbum = { found: EggSticker[]; total: number };

export function eggAlbumOf(state: Pick<GameState, "eggs">): EggAlbum {
  const found = new Map<string, EggSticker>();
  for (const find of eggBookOf(state).log) {
    const known = found.get(find.eggId);
    const egg = EGG_BANK.find((type) => type.id === find.eggId);
    if (known) known.times++;
    else if (egg) found.set(find.eggId, { eggId: egg.id, title: egg.title, look: egg.look, rarity: egg.rarity, date: find.date, headline: find.headline, times: 1 });
  }
  return { found: [...found.values()], total: EGG_BANK.length };
}
