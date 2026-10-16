import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Link } from "react-router";
import type { Club } from "@boleiro/data/clubs";
import type { ChemistryPage, MapLink, MapPlayer } from "@boleiro/game-client/chemistry/chemistryPage";
import { useServices } from "../app/ServicesContext.js";
import { plateColours } from "../clubs/clubCatalog.js";
import { useCountUp } from "../finances/useCountUp.js";
import { chemistryWord, effectText, trendText } from "../chemistry/chemistryText.js";
import "./chemistry.css";

type Loaded = { page: ChemistryPage | null; club: Club | null; date: string };

// Stickers land one after another from the keeper up; the lines draw once the eleven is down.
const STICKER_STAGGER_MS = 45;
const LINES_AFTER_MS = 520;
const LINE_STAGGER_MS = 40;
const REASON_STAGGER_MS = 70;
// A pair that gets on draws thicker the longer they have played together at the club (weight 1 to 3).
const LINE_WIDTH = 2;
const LINE_WIDTH_PER_WEIGHT = 1.4;

const signed = (points: number) => (points > 0 ? `+${points}` : `−${Math.abs(points)}`);
const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

/** The coach's club's chemistry (entrosamento): the meter and why it is there, and who gets on with whom. */
export function Chemistry() {
  const { engine } = useServices();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [hasFailed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    Promise.all([engine.chemistry(), engine.read(["clubs", "coachClubId", "date"])]).then(
      ([page, state]) => current && setLoaded({ page, club: state.coachClubId ? (state.clubs[state.coachClubId] ?? null) : null, date: state.date }),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  const pitch = useRef<HTMLDivElement>(null);
  const size = useSize(pitch, loaded !== null);
  const shown = useCountUp(loaded?.page?.value ?? 0, loaded?.page ? `chemistry:${loaded.page.clubId}:${loaded.date}` : null);

  if (hasFailed) return <p className="status error">O entrosamento não abriu. Volte ao clube e tente de novo.</p>;
  if (!loaded) return <p className="status">Abrindo o entrosamento…</p>;
  const { page, club } = loaded;
  if (!page || !club) {
    return (
      <div className="chem-none">
        <h1 className="screen-title">Sem clube, sem elenco</h1>
        <p className="status">
          <Link to="/hub" className="btn">
            Voltar ao clube
          </Link>
        </p>
      </div>
    );
  }

  const tone = page.value < 35 ? "low" : page.value < 50 ? "mid" : "";
  const trend = trendText(page.value, page.was);
  return (
    <div className="chem fills-screen">
      <div className="chem-side">
        <section className="stk chem-gauge" aria-labelledby="chem-title">
          <h1 id="chem-title">Entrosamento</h1>
          <div className="chem-num">
            <b className={tone} aria-hidden="true">
              {shown}
            </b>
            <span>
              {chemistryWord(page.value)}
              {trend && <small>{trend}</small>}
            </span>
          </div>
          <div className="chem-scale">
            <div className={`meter ${tone}`} role="meter" aria-label="Entrosamento" aria-valuemin={0} aria-valuemax={100} aria-valuenow={page.value}>
              <i style={{ width: `${page.value}%` }} />
            </div>
            <div className="chem-ticks" aria-hidden="true">
              <span>0</span>
              <span>50</span>
              <span>100</span>
            </div>
          </div>
          <p className="chem-effect">
            <b className={page.effect < 0 ? "dn" : undefined}>{effectText(page.effect)}</b>
            <span>de força em campo para o time. Vai de −3% a +3%.</span>
          </p>
        </section>

        <section className="stk chem-why" aria-labelledby="chem-why-title">
          <h2 id="chem-why-title">Por que está assim</h2>
          {page.reasons.length === 0 ? (
            <p className="chem-why-none">Nada mexe no entrosamento por enquanto: o time ainda não jogou.</p>
          ) : (
            <ul>
              {page.reasons.map((reason, index) => (
                <li key={reason.kind} style={delay(index * REASON_STAGGER_MS)}>
                  <div>
                    <b>{reason.title}</b>
                    <small>{reason.detail}</small>
                  </div>
                  <span className={reason.points > 0 ? "up" : "dn"}>{signed(reason.points)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="page chem-map" aria-labelledby="chem-map-title">
        <header>
          <h2 id="chem-map-title">Quem se dá com quem</h2>
          <span>Titulares do {page.formation} e reservas ligados a eles</span>
          <div className="chem-legend">
            <span>
              <i className="good" />
              Se dão bem
            </span>
            <span>
              <i className="bad" />
              Disputam vaga ou brigaram
            </span>
          </div>
        </header>
        <div className="chem-pitch" ref={pitch} role="group" aria-label="Mapa do entrosamento">
          <i className="chem-lines" aria-hidden="true" />
          {size && (
            <svg viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
              {page.links.map((link, index) => (
                <Line key={`${link.kind}:${link.playerIds.join("|")}`} link={link} players={page.players} index={index} size={size} />
              ))}
            </svg>
          )}
          {page.links.map((link) => link.tag && <Tag key={`tag:${link.playerIds.join("|")}`} link={link} players={page.players} />)}
          <ul aria-label="Jogadores">
            {[...page.players]
              .sort((a, b) => b.y - a.y || a.x - b.x)
              .map((player, index) => (
                <Sticker key={player.id} player={player} club={club} index={index} />
              ))}
          </ul>
        </div>
        <ul className="chem-pairs" aria-label="Ligações">
          {page.links.map((link) => (
            <li key={`${link.kind}:${link.playerIds.join("|")}`} data-kind={link.kind}>
              {pairText(link, page.players)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function pairText(link: MapLink, players: readonly MapPlayer[]): string {
  const [a, b] = link.playerIds.map((id) => players.find((p) => p.id === id)?.name ?? id);
  return link.kind === "good" ? `${a} e ${b} se dão bem` : `${a} e ${b} ${link.tag ?? "disputam vaga"}`;
}

type Size = { width: number; height: number };

/** The element's size in pixels once it is laid out, following it as the window resizes. */
function useSize(ref: RefObject<HTMLElement | null>, isShown: boolean): Size | null {
  const [size, setSize] = useState<Size | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, isShown]);
  return size;
}

function Line({ link, players, index, size }: { link: MapLink; players: readonly MapPlayer[]; index: number; size: Size }) {
  const [a, b] = link.playerIds.map((id) => players.find((p) => p.id === id));
  if (!a || !b) return null;
  const isGood = link.kind === "good";
  return (
    <line
      className={isGood ? "good" : "bad"}
      x1={(a.x / 100) * size.width}
      y1={(a.y / 100) * size.height}
      x2={(b.x / 100) * size.width}
      y2={(b.y / 100) * size.height}
      pathLength={isGood ? 1 : undefined}
      strokeWidth={isGood ? LINE_WIDTH + (link.weight - 1) * LINE_WIDTH_PER_WEIGHT : 4}
      style={delay(LINES_AFTER_MS + index * LINE_STAGGER_MS)}
    />
  );
}

function Tag({ link, players }: { link: MapLink; players: readonly MapPlayer[] }) {
  const [a, b] = link.playerIds.map((id) => players.find((p) => p.id === id));
  if (!a || !b || !link.tag) return null;
  return (
    <span className="chem-tag" style={{ left: `${(a.x + b.x) / 2}%`, top: `${(a.y + b.y) / 2}%` }}>
      {link.tag}
    </span>
  );
}

function Sticker({ player, club, index }: { player: MapPlayer; club: Club; index: number }) {
  const { background, text } = plateColours(club.colours);
  return (
    <li
      className={player.isReserve ? "chem-p res" : "chem-p"}
      style={{ left: `${player.x}%`, top: `${player.y}%`, ...delay(index * STICKER_STAGGER_MS) }}
      aria-label={`${player.name}, força ${player.strength}${player.isCaptain ? ", capitão" : ""}${player.isReserve ? ", reserva" : ""}`}
    >
      <span className="chem-face" style={player.isReserve ? undefined : { background, color: text }}>
        {player.isCaptain && (
          <span className="chem-cap" title="Capitão">
            C
          </span>
        )}
        <span className="chem-f">{player.strength}</span>
        <b>{player.name.charAt(0)}</b>
      </span>
      <span className="chem-n">{player.name}</span>
      {player.isReserve && <span className="chem-r">reserva</span>}
    </li>
  );
}
