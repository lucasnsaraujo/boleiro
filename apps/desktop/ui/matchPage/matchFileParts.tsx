import type { GoalKind } from "@boleiro/engine/sim/live/goalDetails";
import type { MatchView, PageEvent, StatLine } from "@boleiro/game-client/matchPage/matchPageAt";
import type { MatchPage } from "@boleiro/game-client/matchPage/matchPageOf";
import type { Side } from "@boleiro/game-client/round/liveRoundOf";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import { contrast } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";

const THOUSANDS = new Intl.NumberFormat("pt-BR");

/** "Público 61.233 · Renda R$ 4,8 mi", for a match whose crowd is known. */
export function venueLine(page: MatchPage): string[] {
  const { stadium, crowd, gate } = page.venue;
  return [stadium, crowd ? `Público ${THOUSANDS.format(crowd)}` : null, gate ? `Renda ${formatMoney(gate)}` : null].filter((part): part is string => !!part);
}

/** The match's clock as its header shows it: the minute while it runs, else how it ended. */
export function clockLabel(page: MatchPage, view: MatchView): string {
  if (!view.isOver) return `${view.minute}'`;
  return page.penaltyWinnerId && view.score.home === view.score.away ? "Encerrado · pênaltis" : "Encerrado";
}

// The card the bars and shirts sit on, in each theme (album.css --card).
const CARD = { light: "#FFFDF7", dark: "#18301F" };
const INK = { light: "#14231A", dark: "#F2EAD9" };
// guess: a club colour reads as a bar on the card from 1.6:1 against it, and two sides read apart when their colours sit
// this far apart in RGB (red and blue do, two reds don't).
const SHOWS_ON_CARD = 1.6;
const TELLS_APART = 120;

/** How far apart two colours sit, as the straight distance between their RGB values. */
function distance(a: string, b: string): number {
  const channels = (hex: string) => (hex.replace("#", "").match(/../g) ?? []).map((pair) => parseInt(pair, 16));
  const [x, y] = [channels(a), channels(b)];
  return Math.hypot(...x.map((v, i) => v - (y[i] ?? 0)));
}

type Colours = MatchPage["home"]["club"]["colours"];

/** Each side's colour for its bars and shirts: its first colour, or its second when the first would vanish on the card or into the other side's. */
function sideColours(page: MatchPage): Record<Side, string> {
  const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const card = CARD[theme];
  const shows = (colour: string) => contrast(colour, card) >= SHOWS_ON_CARD;
  const pick = ({ primary, secondary }: Colours, apartFrom?: string) =>
    [primary, secondary].find((colour) => shows(colour) && (!apartFrom || distance(colour, apartFrom) >= TELLS_APART)) ?? null;
  const home = pick(page.home.club.colours) ?? INK[theme];
  const away = pick(page.away.club.colours, home) ?? pick(page.away.club.colours) ?? INK[theme];
  return { home, away: distance(home, away) >= TELLS_APART ? away : INK[theme] };
}

/** Text that reads on a side's colour: white or near-black, whichever stands out more. */
const inkOn = (colour: string) => (contrast(colour, "#ffffff") >= contrast(colour, "#0a0a0a") ? "#ffffff" : "#0a0a0a");

/** The clubs' colours as the file paints its bars and shirts with them. */
export function clubColours(page: MatchPage) {
  const { home, away } = sideColours(page);
  return { ["--home" as string]: home, ["--away" as string]: away, ["--home-ink" as string]: inkOn(home), ["--away-ink" as string]: inkOn(away) };
}

export function LiveChip({ page, view }: { page: MatchPage; view: MatchView }) {
  if (view.isOver) return <span className="chip off mf-state">{clockLabel(page, view)}</span>;
  return (
    <span className="chip bad mf-state is-live" aria-label={`Ao vivo, ${view.minute} minutos`}>
      <i className="mf-pulse" aria-hidden="true" />
      Ao vivo · {view.minute}'
    </span>
  );
}

export function ClubSticker({ page, side, size = 58 }: { page: MatchPage; side: Side; size?: number }) {
  const { club } = page[side];
  return (
    <div className={`mf-club ${side}`}>
      <Crest club={club} size={size} />
      <b>{club.shortName}</b>
      <small>{side === "home" ? "Mandante" : "Visitante"}</small>
    </div>
  );
}

/** A score digit that rolls up into place when a goal changes it. */
export function RollingDigit({ value }: { value: number }) {
  return (
    <span className="mf-digit">
      <span key={value}>{value}</span>
    </span>
  );
}

const GOAL_NOTES: Partial<Record<GoalKind, string>> = { header: "cabeça", penalty: "pênalti", freeKick: "falta", olympic: "olímpico", ownGoal: "contra" };

export function GoalNote({ event, names }: { event: PageEvent; names: Readonly<Record<string, string>> }) {
  const note = [event.goalKind && GOAL_NOTES[event.goalKind], event.otherId ? `ass. ${names[event.otherId] ?? "um companheiro"}` : null].filter(Boolean).join(" · ");
  return note ? <small>{note}</small> : null;
}

const EVENT_ICONS: Record<PageEvent["kind"], string> = {
  goal: "ph-fill ph-soccer-ball",
  penaltyMiss: "ph-bold ph-target",
  yellow: "",
  red: "",
  injury: "ph-fill ph-first-aid",
  substitution: "ph-bold ph-arrows-left-right",
};

export function EventMark({ event }: { event: PageEvent }) {
  if (event.kind === "yellow") return <span className="yc" aria-label="amarelo" />;
  if (event.kind === "red") return <span className="rc" aria-label="vermelho" />;
  return <i className={`${EVENT_ICONS[event.kind]} mf-ev-${event.kind}`} aria-hidden="true" />;
}

/** A pair of bars meeting in the middle, each side's share in its club's colour. */
export function StatBar({ line, index }: { line: StatLine; index: number }) {
  const total = line.home + line.away;
  const share = total ? line.home / total : 0.5;
  const unit = line.key === "possession" ? "%" : "";
  return (
    <div className="mf-bar" style={{ ["--share" as string]: share, ["--i" as string]: index }} aria-label={`${line.label}: ${line.home}${unit} a ${line.away}${unit}`}>
      <b>
        {line.home}
        {unit}
      </b>
      <span>{line.label}</span>
      <b>
        {line.away}
        {unit}
      </b>
      <i className="mf-track" aria-hidden="true">
        <i className="h" />
        <i className="a" />
      </i>
    </div>
  );
}
