import { useRef, type CSSProperties, type ReactNode } from "react";
import type { RetirementView } from "@boleiro/game-client/moments/momentView";
import { Crest } from "../../clubs/Crest.js";
import { MomentStage, useCanvasTick, useCueAt, useTick } from "../MomentStage.js";
import { artColours, crestClub, MomentSticker } from "../MomentSticker.js";
import { confetti, ease, mosaic, mosaicFace, span } from "../paperMotion.js";
import "./retirement.css";

type Props = { view: RetirementView; actions: ReactNode };

const ms = (value: number) => ({ "--d": Math.round(value) }) as CSSProperties;
const COVER_AT = 400;
const FIRST_LEAF_AT = 1350;
// The career speeds up: the first page waits 950 ms, the last ones 500, all of it over by 4.3 s.
const LEAVES_END = 3800;
const FINAL_AT = 10200;

/** When each leaf turns: the cover, then one page per club, the gaps shrinking so the career speeds up. */
function leafTimes(eras: number): number[] {
  if (!eras) return [COVER_AT];
  const gaps = Array.from({ length: Math.max(0, eras - 1) }, (_, i) => 950 - (450 * i) / Math.max(1, eras - 2));
  const total = gaps.reduce((sum, gap) => sum + gap, 0);
  const fit = total > LEAVES_END - FIRST_LEAF_AT ? (LEAVES_END - FIRST_LEAF_AT) / total : 1;
  const times = [COVER_AT, FIRST_LEAF_AT];
  for (const gap of gaps) times.push((times.at(-1) ?? FIRST_LEAF_AT) + gap * fit);
  return times;
}

function Counter({ to, at, length }: { to: number; at: number; length: number }) {
  const node = useRef<HTMLElement>(null);
  useTick((t) => {
    if (node.current) node.current.textContent = Math.round(to * ease.out(span(t, at, length))).toLocaleString("pt-BR");
  });
  return <b ref={node}>0</b>;
}

function Strip({ strip }: { strip: RetirementView["strip"] }) {
  const years = Math.max(1, strip.to - strip.from);
  const at = (year: number) => `${((year - strip.from) / years) * 100}%`;
  const marks: number[] = [];
  for (let year = strip.from; year < strip.to; year += Math.max(1, Math.round(years / 5))) marks.push(year);
  return (
    <div className="rt-strip mo-up" style={ms(6850)}>
      <span className="lbl">Trajetória</span>
      {strip.bands.map((band, index) => (
        <i key={index} className="bd" style={{ left: at(band.from), width: `calc(${((band.to - band.from) / years) * 100}% - 2px)`, background: band.club.colours.primary }} />
      ))}
      {strip.titles.map((year, index) => (
        <i key={`t${index}`} className="tk" style={{ left: at(year) }} />
      ))}
      {strip.idols.map((year, index) => (
        <i key={`i${index}`} className="tk i" style={{ left: at(year) }} />
      ))}
      {strip.sackings.map((year, index) => (
        <i key={`x${index}`} className="tk x" style={{ left: at(year) }} />
      ))}
      {marks.map((year) => (
        <span key={year} className="yr" style={{ left: at(year + 0.5) }}>
          {year}
        </span>
      ))}
    </div>
  );
}

/** The farewell match's score running up to its final number between 8.8 s and 9.9 s. */
function FarewellScore({ score }: { score: [number, number] }) {
  const home = useRef<HTMLSpanElement>(null);
  const away = useRef<HTMLSpanElement>(null);
  // The sides take turns while both still have goals to score, as a game climbs, then the rest come in.
  const sides: number[] = [];
  for (let home = score[0], away = score[1], turn = 0; home + away > 0; turn++) {
    if ((turn % 2 === 0 && home > 0) || away === 0) {
      sides.push(0);
      home--;
    } else {
      sides.push(1);
      away--;
    }
  }
  const order = sides.map((side, index) => ({ side, at: 8800 + (index / Math.max(1, sides.length)) * 1100 }));
  useTick((t) => {
    if (home.current) home.current.textContent = String(order.filter((g) => g.side === 0 && t >= g.at).length);
    if (away.current) away.current.textContent = String(order.filter((g) => g.side === 1 && t >= g.at).length);
  });
  return (
    <div className="s">
      <span ref={home}>0</span>
      <em>×</em>
      <span ref={away}>0</span>
    </div>
  );
}

/**
 * The retirement: the career replayed as the album. The cover opens, one page per club turns faster and
 * faster, then the last spread fills with the numbers, every former club's tribute, the farewell match with
 * the coach's old players, and the last sticker flying into the last empty slot.
 */
export function RetirementScene({ view, actions }: Props) {
  const times = leafTimes(view.eras.length);
  const caption = useRef<HTMLSpanElement>(null);
  const captions: [number, string][] = [[0, `Seu álbum, ${view.strip.from} a ${view.strip.to - 1}`], ...view.eras.map((era, index): [number, string] => [(times[index + 1] ?? 0) + 200, `${era.name} · ${era.years}`]), [4300, "A última página"]];
  useTick((t) => {
    if (!caption.current) return;
    let text = captions[0]?.[1] ?? "";
    for (const [at, line] of captions) if (t >= at) text = line;
    caption.current.textContent = text;
  });
  const allColours = [...new Set(view.eras.flatMap((era) => [era.club.colours.primary, era.club.colours.secondary])), "#FFCC00", "#FFFFFF"];
  const paper = useCanvasTick((surface) => {
    const left = confetti(surface, { at: FINAL_AT + 550, colours: allColours, count: 130, origin: [0.62, 1.04], spread: 0.45, speed: 1550, seed: 21, life: 5200 });
    const right = confetti(surface, { at: FINAL_AT + 650, colours: allColours, count: 130, origin: [0.9, 1.04], spread: 0.45, speed: 1500, seed: 22, life: 5200 });
    return (t) => {
      left(t);
      surface.g.save();
      right(t);
      surface.g.restore();
    };
  });
  const firstName = (view.coachName.split(" ")[0] ?? view.coachName).toUpperCase();
  const stand = useCanvasTick((surface) => mosaic(surface, { cell: 4, at: 7100, wave: 1200, flip: 300, back: "#2A1214", draw: mosaicFace(view.lastClub.colours, ["OBRIGADO,", firstName], 11, 2) }));
  useCueAt("title", FINAL_AT + 550);
  return (
    <MomentStage durationMs={12400} backdrop="#241C14" tone="dark" label={`Aposentadoria: ${view.coachName}`} className="mo-retire" actions={actions}>
      <div className="rt-spread">
        <section className="rt-pg rt-pl">
          <div className="rt-kick mo-up" style={ms(4500)}>
            <i className="ph-fill ph-flag-banner" />
            {view.when}
          </div>
          <h1 className="mo-up" style={ms(4600)}>
            {view.coachName}
          </h1>
          <p className="rt-sub mo-up" style={ms(4750)}>
            {view.span}
          </p>
          <div className="rt-clubs">
            {view.clubs.slice(-5).map((club, index) => (
              <div key={`${club.club.id}-${index}`} className={`ps rt-sl${club.isIdol ? " shiny" : ""}`} style={{ ...artColours(club.club), ...ms(5000 + index * 140) }}>
                {club.isIdol && (
                  <span className="rt-star">
                    <i className="ph-fill ph-star" />
                  </span>
                )}
                <div className="art">
                  <Crest club={crestClub(club.club)} size={44} />
                </div>
                <div className="nm">{club.club.name}</div>
                <div className="cl">
                  {club.years} · {club.note}
                </div>
              </div>
            ))}
          </div>
          <div className="rt-nums">
            {view.numbers.map((number, index) => (
              <div key={number.label} className={`nst rt-sl${number.isFoil ? " foil" : ""}`} style={ms(5800 + index * 150)}>
                {typeof number.value === "number" ? <Counter to={number.value} at={5800 + index * 150} length={1100} /> : <b>{number.value}</b>}
                <span>{number.label}</span>
              </div>
            ))}
          </div>
          <p className="rt-tits mo-up" style={ms(6700)}>
            {view.titles}
          </p>
          <Strip strip={view.strip} />
          <div className="cause mo-up rt-cause" style={ms(6900)}>
            <b>Por quê</b>
            <span>{view.cause}</span>
          </div>
          <span className="rt-pgno">fim · 1</span>
        </section>

        <section className="rt-pg rt-pr">
          <div className="rt-sec mo-up" style={ms(4700)}>
            <h3>Homenagens</h3>
            <span>dos clubes por onde você passou</span>
          </div>
          <div className="rt-tribs">
            {view.tributes.map((tribute, index) => (
              <div key={tribute.club.id} className="rt-tr" style={ms(5000 + index * 400)}>
                <Crest club={crestClub(tribute.club)} size={28} />
                <div>
                  <b>{tribute.club.name}</b>
                  {tribute.text}
                </div>
              </div>
            ))}
          </div>
          <div className="rt-sec mo-up" style={{ ...ms(7600), marginTop: 12 }}>
            <h3>Jogo de despedida</h3>
            <span>seus jogadores de cada época</span>
          </div>
          <div className="rt-match">
            <div className="sc">
              <div className="t">
                Amigos de {view.coachName.split(" ")[0]}
                <small>
                  {view.strip.from} a {view.strip.to - 1}
                </small>
              </div>
              <FarewellScore score={view.farewell.score} />
              <div className="t r">
                {view.lastClub.name}
                <small>o último clube</small>
              </div>
            </div>
            <div className="xi">
              {view.farewell.eleven.map((sticker, index) => (
                <MomentSticker key={sticker.id} sticker={sticker} className="rt-sl" style={ms(7900 + index * 90)} showCaption={false} />
              ))}
            </div>
            <div className="note-l">{view.farewell.note}</div>
          </div>
          <div className="rt-last">
            <div className="txt">
              <div className="rt-mos mo-up" style={ms(7000)}>
                <canvas ref={stand} />
                <span>{view.games.toLocaleString("pt-BR")} jogos. A torcida diz uma última vez.</span>
              </div>
              <div className="mo-up" style={ms(9800)}>
                <b>A última figurinha</b>
                <p>Fecha o álbum. Daqui pra frente, seu nome aparece na página de quem veio antes.</p>
              </div>
            </div>
            <div className="rt-slot">
              <div className="rt-thud" />
              <MomentSticker
                sticker={{ id: "coach", name: view.coachName, initial: view.coachName.charAt(0).toUpperCase(), number: view.games.toLocaleString("pt-BR"), caption: `técnico · ${view.strip.from} a ${view.strip.to - 1}`, isShiny: true, club: view.lastClub }}
                className="rt-final"
                crest={20}
                sheenAt={FINAL_AT + 700}
              />
            </div>
          </div>
          <span className="rt-pgno">fim · 2</span>
        </section>

        {view.eras.map((era, index) => (
          <div key={`${era.club.id}-${index}`} className="rt-leaf" style={{ ...ms(times[index + 1] ?? 0), "--z0": 40 - index - 1, "--z1": 50 + index + 1 } as CSSProperties}>
            <div className="f">
              <div className="rt-era">
                <Crest club={crestClub(era.club)} size={96} />
                <h3>{era.name}</h3>
                <div className="yrs">{era.years}</div>
                <p>{era.line}</p>
                <div className="grid">
                  {Array.from({ length: 12 }, (_, cell) => (
                    <i key={cell} style={{ "--c": era.club.colours.primary } as CSSProperties} />
                  ))}
                </div>
              </div>
            </div>
            <div className="b">
              <div className="rt-backside">
                {era.stickers.slice(0, 15).map((sticker) => (
                  <div key={sticker.id} className={`rt-mini${sticker.isShiny ? " shiny" : ""}`} style={artColours(era.club)}>
                    <b>{sticker.initial}</b>
                    <span>{sticker.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
        <div className="rt-leaf rt-cover" style={{ ...ms(times[0] ?? COVER_AT), "--z0": 40, "--z1": 50 } as CSSProperties}>
          <div className="f">
            <span className="wm">
              <span className="b">BOLEIRO</span>
              <span className="o">{view.strip.from}</span>
            </span>
            <div className="nm">
              {view.coachName}
              <small>
                TÉCNICO · {view.strip.from} A {view.strip.to - 1}
              </small>
            </div>
          </div>
          <div className="b" />
        </div>
      </div>
      <div className="rt-caption">
        <i className="ph-bold ph-book-open-text" aria-hidden="true" />
        <span ref={caption}>{captions[0]?.[1]}</span>
      </div>
      <canvas ref={paper} className="fill rt-conf" />
    </MomentStage>
  );
}
