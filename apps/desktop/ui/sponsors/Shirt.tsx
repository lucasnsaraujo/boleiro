import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Club } from "@boleiro/data/clubs";
import type { SponsorSlot } from "@boleiro/data/sponsors";
import { plateColours } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import { springTiming } from "../motion/springEasing.js";
import { logoOf } from "./brandLogos.js";
import "./shirt.css";
import { clubArticle, withArticle } from "@boleiro/data/articles";

/** A brand printed on the shirt. */
export type Print = { brandId: string; name: string };

/** The places the front of a shirt shows, with the box each print fits in (px, on the 330×360 drawing). */
const PLACES = {
  master: { left: 95, top: 150, width: 140, height: 40 },
  front: { left: 115, top: 202, width: 100, height: 22 },
  kit: { left: 190, top: 84, width: 54, height: 24 },
  sleeves: { left: 18, top: 92, width: 54, height: 26 },
} as const satisfies Partial<Record<SponsorSlot, { left: number; top: number; width: number; height: number }>>;
export type ShirtPlace = keyof typeof PLACES;

// A print presses on like a heat transfer: a stiff spring that overshoots a little.
const PRESS = springTiming({ stiffness: 420, damping: 22 });
const SHIRT = "M112 22 C128 40 202 40 218 22 L286 50 L322 128 L270 154 L256 132 L256 340 C220 352 110 352 74 340 L74 132 L60 154 L8 128 L44 50 Z";

/** One print, in the kit's ink: the logo as a mask over the ink colour, or the brand's name where the data has no logo. */
function Printed({ print, place, ink, state }: { print: Print; place: ShirtPlace; ink: string; state: "on" | "off" }) {
  const box = PLACES[place];
  const logo = logoOf(print.brandId, box.height);
  const scale = logo ? Math.min(1, box.width / logo.width) : 1;
  const style: CSSProperties = { left: box.left, top: box.top, width: box.width, height: box.height };
  return (
    <span className={`shirt-print ${place} ${state}`} style={style} aria-hidden={state === "off"}>
      {logo?.isBadge ? (
        <span className="patch" style={{ height: box.height }}>
          <img src={logo.url} alt={print.name} height={box.height - 6} width={Math.round(((box.height - 6) * logo.width) / box.height)} draggable={false} />
        </span>
      ) : logo ? (
        <span
          className="ink"
          role="img"
          aria-label={print.name}
          style={{ width: logo.width * scale, height: box.height * scale, background: ink, maskImage: `url(${logo.url})`, WebkitMaskImage: `url(${logo.url})` }}
        />
      ) : (
        <span className="ink-name" style={{ color: ink, fontSize: Math.round(Math.min(box.height * 0.5, (box.width / Math.max(1, print.name.length)) * 1.15)) }}>
          {print.name}
        </span>
      )}
    </span>
  );
}

/** The place's print now and the one it replaced a moment ago, which peels off while the new one presses on. */
function usePeeling(print: Print | null): { current: Print | null; peeling: Print | null } {
  const last = useRef(print);
  const [peeling, setPeeling] = useState<Print | null>(null);
  useLayoutEffect(() => {
    const before = last.current;
    last.current = print;
    if (before && before.brandId !== print?.brandId) {
      setPeeling(before);
      const timer = window.setTimeout(() => setPeeling(null), PRESS.duration);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [print]);
  return { current: print, peeling };
}

function Place({ place, print, ink }: { place: ShirtPlace; print: Print | null; ink: string }) {
  const { current, peeling } = usePeeling(print);
  return (
    <>
      {peeling && <Printed key={`off:${peeling.brandId}`} print={peeling} place={place} ink={ink} state="off" />}
      {current && <Printed key={`on:${current.brandId}`} print={current} place={place} ink={ink} state="on" />}
    </>
  );
}

type Props = { club: Pick<Club, "id" | "shortName" | "colours">; prints: Partial<Record<ShirtPlace, Print>>; previewing?: ShirtPlace | null };

/**
 * The club's shirt in its colours with its sponsors printed in the kit's ink, as the real one carries them;
 * a print that changes peels off and the new one presses on. `previewing` marks the place an offer would take.
 */
export function Shirt({ club, prints, previewing = null }: Props) {
  const { background, text } = plateColours(club.colours);
  const trim = club.colours.secondary.toLowerCase() === background.toLowerCase() ? text : club.colours.secondary;
  const style = { "--press-ease": PRESS.easing, "--press-ms": `${PRESS.duration}ms` } as CSSProperties;
  return (
    <figure className="shirt" style={style} aria-label={`Camisa ${withArticle(club.shortName, clubArticle(club.id), "de")}`}>
      <svg width="330" height="360" viewBox="0 0 330 360" aria-hidden="true">
        <defs>
          <clipPath id="shirt-cut">
            <path d={SHIRT} />
          </clipPath>
          <linearGradient id="shirt-fold" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#000" stopOpacity=".16" />
            <stop offset=".22" stopColor="#000" stopOpacity="0" />
            <stop offset=".78" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity=".2" />
          </linearGradient>
        </defs>
        <g clipPath="url(#shirt-cut)">
          <rect width="330" height="360" fill={background} />
          <path d="M8 128 L44 50 L60 44 L28 136 Z M322 128 L286 50 L270 44 L302 136 Z" fill={trim} opacity=".9" />
          <rect width="330" height="360" fill="url(#shirt-fold)" />
          <path d="M60 154 L74 132 L74 340 M270 154 L256 132 L256 340" stroke="#000" strokeOpacity=".12" strokeWidth="2" fill="none" />
        </g>
        <path d={SHIRT} fill="none" stroke="rgba(0,0,0,.28)" strokeWidth="2" />
        <path d="M112 22 C128 40 202 40 218 22 C206 50 124 50 112 22 Z" fill={trim} />
        <path d="M112 22 C128 40 202 40 218 22" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="1.5" />
      </svg>
      <span className="shirt-crest">
        <Crest club={club} size={30} />
      </span>
      {(Object.keys(PLACES) as ShirtPlace[]).map((place) => (
        <Place key={place} place={place} print={prints[place] ?? null} ink={text} />
      ))}
      {previewing && <span className={`shirt-target ${previewing}`} style={PLACES[previewing]} aria-hidden="true" />}
    </figure>
  );
}
