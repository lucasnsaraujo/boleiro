import type { MatchOddsSticker } from "@boleiro/game-client/sponsors/sponsorsPage";
import { BrandLogo } from "./BrandLogo.js";
import "./oddsSticker.css";

const odd = (value: number) => value.toFixed(2).replace(".", ",");
const shortName = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();

type Props = { match: MatchOddsSticker; brand: { id: string; name: string }; className?: string };

/** A betting sponsor's odds for a match as a sticker peeled onto the page: its logo tab, then home, draw and away. */
export function OddsSticker({ match, brand, className }: Props) {
  const { odds, homeName, awayName } = match;
  return (
    <div className={`odds-sticker ${className ?? ""}`} role="group" aria-label={`Odds da ${brand.name}: ${homeName} ${odd(odds.home)}, empate ${odd(odds.draw)}, ${awayName} ${odd(odds.away)}`}>
      <em>
        <BrandLogo brandId={brand.id} name={brand.name} height={9} maxWidth={52} />
      </em>
      <span>
        {shortName(homeName)}
        <b>{odd(odds.home)}</b>
      </span>
      <span>
        X<b>{odd(odds.draw)}</b>
      </span>
      <span>
        {shortName(awayName)}
        <b>{odd(odds.away)}</b>
      </span>
    </div>
  );
}
