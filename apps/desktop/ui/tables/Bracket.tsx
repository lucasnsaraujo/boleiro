import { useLayoutEffect, useRef, useState } from "react";
import type { ClubFace } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import { formatBarDate } from "@boleiro/game-client/format/formatGameDate";
import { lastPlayedLeg, type BracketRound, type LadderPlace, type LadderRound, type TieView } from "./competitionTables.js";
import "./bracket.css";

type Clubs = Readonly<Record<string, ClubFace>>;

const TIE_WIDTH = 160;
const TIE_HEIGHT = 60;
const SEMI_WIDTH = 176;
const SEMI_HEIGHT = 124;
const FINAL_WIDTH = 188;
const FINAL_HEIGHT = 172;
const CAPTION_HEIGHT = 22;
const COLUMN_GAP = 14;

/** With `onOpenMatch`, a tie with a game played opens its latest game's ficha; `mark` is the cup's logo, on the final's medallion. */
type Props = { name: string; rounds: BracketRound[]; clubs: Clubs; coachClubId: string | null; mark?: string | null; onOpenMatch?: (matchRef: string) => void };

/** Where each card sits: the left half's rounds run in from the left edge, the right half's from the right, the final in the middle. */
function layoutOf(width: number, height: number) {
  const body = height - CAPTION_HEIGHT;
  const centreY = CAPTION_HEIGHT + body / 2;
  const columnX = [0, TIE_WIDTH + COLUMN_GAP, 2 * (TIE_WIDTH + COLUMN_GAP)];
  const slotY = (count: number, i: number, cardHeight: number) => CAPTION_HEIGHT + (body * (2 * i + 1)) / (2 * count) - cardHeight / 2;
  return { centreY, columnX, slotY, rightX: (x: number, cardWidth: number) => width - cardWidth - x };
}

const nameOf = (clubs: Clubs, id: string) => clubs[id]?.shortName ?? id;

/** "Flamengo ou Estudiantes" for a place whose tie is still being played, "A definir" before that. */
function pendingName(clubs: Clubs, feeder: TieView | null | undefined): string {
  if (!feeder) return "A definir";
  if (feeder.winnerId) return nameOf(clubs, feeder.winnerId);
  return `${nameOf(clubs, feeder.clubIds[0])} ou ${nameOf(clubs, feeder.clubIds[1])}`;
}

function TieRows({ tie, clubs, coachClubId, crest }: { tie: TieView; clubs: Clubs; coachClubId: string | null; crest: number }) {
  return (
    <>
      {tie.clubIds.map((id, side) => {
        const club = clubs[id];
        const outcome = tie.winnerId === null ? "" : tie.winnerId === id ? " won" : " lost";
        return (
          <div key={id} className={`bk-row${outcome}${id === coachClubId ? " mine" : ""}`}>
            {club ? <Crest club={club} size={crest} /> : <span />}
            <span className="bk-name">{nameOf(clubs, id)}</span>
            <span className={tie.aggregate ? "sbox" : "sbox x"}>{tie.aggregate?.[side] ?? ""}</span>
          </div>
        );
      })}
    </>
  );
}

const LEG_NAMES = ["Ida", "Volta"];

/** Each leg on its own line, or the tie's one match: its score once played, else its day and ground. */
function LegLines({ tie, clubs }: { tie: TieView; clubs: Clubs }) {
  return (
    <div className="bk-legs">
      {tie.legs.map((leg, i) => {
        const ground = clubs[leg.homeId]?.stadium;
        const played = leg.homeGoals !== null && leg.awayGoals !== null;
        return (
          <p key={leg.fixtureId}>
            {tie.legs.length === 1 ? "Jogo único" : (LEG_NAMES[i] ?? `${i + 1}º jogo`)}{" "}
            <b className={played ? undefined : "next"}>{played ? `${leg.homeGoals} × ${leg.awayGoals}` : formatBarDate(leg.date)}</b>
            {ground ? ` · ${ground}` : ""}
          </p>
        );
      })}
    </div>
  );
}

/** A button over a played tie's whole card, under its text, that opens its latest game's ficha. */
function TieOpener({ tie, clubs, onOpenMatch }: { tie: TieView; clubs: Clubs; onOpenMatch: ((matchRef: string) => void) | undefined }) {
  const played = onOpenMatch && lastPlayedLeg(tie);
  if (!played) return null;
  return <button type="button" className="bk-open" aria-label={`Ficha do jogo: ${nameOf(clubs, played.homeId)} x ${nameOf(clubs, played.awayId)}`} onClick={() => onOpenMatch(played.fixtureId)} />;
}

function TieCard({ tie, feeders, clubs, coachClubId, isSemi, style, onOpenMatch }: { tie: TieView | null; feeders: (TieView | null)[]; clubs: Clubs; coachClubId: string | null; isSemi: boolean; style: React.CSSProperties; onOpenMatch: Props["onOpenMatch"] }) {
  const isMine = tie !== null && coachClubId !== null && tie.clubIds.includes(coachClubId);
  const className = `stk bk-tie${isSemi ? " semi" : ""}${isMine ? " mine" : ""}${tie ? "" : " pending"}`;
  if (!tie) {
    return (
      <div className={className} style={style}>
        {[0, 1].map((side) => (
          <div key={side} className="slot bk-slot">
            <span>{pendingName(clubs, feeders[side])}</span>
          </div>
        ))}
      </div>
    );
  }
  const shootoutWinner = tie.onPenalties && tie.winnerId ? nameOf(clubs, tie.winnerId) : null;
  return (
    <div className={className} style={style} aria-label={`${nameOf(clubs, tie.clubIds[0])} x ${nameOf(clubs, tie.clubIds[1])}`}>
      <TieOpener tie={tie} clubs={clubs} onOpenMatch={onOpenMatch} />
      {shootoutWinner && <span className="bk-pens">{shootoutWinner} nos pênaltis</span>}
      <TieRows tie={tie} clubs={clubs} coachClubId={coachClubId} crest={isSemi ? 20 : 18} />
      {isSemi && <LegLines tie={tie} clubs={clubs} />}
    </div>
  );
}

/** The final's card: the cup's logo, or a trophy, on its medallion, its day, and its two clubs or the places still open. */
function FinalCard({ tie, date, pending, clubs, coachClubId, mark, style, onOpenMatch }: { tie: TieView | null; date: string | undefined; pending: [string, string]; clubs: Clubs; coachClubId: string | null; mark: string | null | undefined; style: React.CSSProperties; onOpenMatch: Props["onOpenMatch"] }) {
  return (
    <div className="stk bk-final" style={style}>
      <div className={mark ? "bk-trophy bk-mark" : "bk-trophy"} aria-hidden="true">
        {mark ? <img src={mark} alt="" /> : <i className="ph-fill ph-trophy" />}
      </div>
      <h3>Final</h3>
      <p>{date ? `${formatBarDate(date)} · jogo único` : "Jogo único"}</p>
      {tie && <TieOpener tie={tie} clubs={clubs} onOpenMatch={onOpenMatch} />}
      {tie ? (
        <TieRows tie={tie} clubs={clubs} coachClubId={coachClubId} crest={20} />
      ) : (
        pending.map((name, side) => (
          <div key={side} className="slot bk-slot">
            <i className="ph-bold ph-question" aria-hidden="true" />
            <span>{name}</span>
          </div>
        ))
      )}
    </div>
  );
}

/** The bracket's box and its size, measured again whenever it changes. */
function useBoxSize() {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { box, size };
}

/**
 * The knockout bracket as the album pastes it: the round of 16 at both edges, the halves meeting at
 * the final in the middle, the coach's tie lifted in yellow.
 */
export function Bracket({ name, rounds, clubs, coachClubId, mark, onOpenMatch }: Props) {
  const { box, size } = useBoxSize();

  const [sixteen, quarters, semis, final] = rounds;
  const cards: React.ReactNode[] = [];
  const lines: { d: string; isToFinal: boolean }[] = [];
  if (size && sixteen && quarters && semis && final) {
    const { centreY, columnX, slotY, rightX } = layoutOf(size.width, size.height);
    const halves = [
      { side: "l", x: (column: number) => columnX[column] ?? 0, edge: (x: number, w: number) => [x + w, x] as const },
      { side: "r", x: (column: number, w: number) => rightX(columnX[column] ?? 0, w), edge: (x: number, w: number) => [x, x + w] as const },
    ];
    halves.forEach(({ side, x, edge }, half) => {
      const columns = [
        { round: sixteen, count: 4, width: TIE_WIDTH, height: TIE_HEIGHT },
        { round: quarters, count: 2, width: TIE_WIDTH, height: TIE_HEIGHT },
        { round: semis, count: 1, width: SEMI_WIDTH, height: SEMI_HEIGHT },
      ];
      columns.forEach(({ round, count, width, height }, column) => {
        const previous = columns[column - 1];
        for (let i = 0; i < count; i++) {
          const place = half * count + i;
          const left = x(column, width);
          const top = column === 2 ? centreY - height / 2 : slotY(count, i, height);
          const feeders = previous ? [previous.round.ties[2 * place] ?? null, previous.round.ties[2 * place + 1] ?? null] : [];
          cards.push(
            <TieCard
              key={`${side}-${column}-${i}`}
              tie={round.ties[place] ?? null}
              feeders={feeders}
              clubs={clubs}
              coachClubId={coachClubId}
              isSemi={column === 2}
              onOpenMatch={onOpenMatch}
              style={{ left, top, width, minHeight: height }}
            />,
          );
          const [outX] = edge(left, width);
          const next = columns[column + 1];
          if (next) {
            const nextLeft = x(column + 1, next.width);
            const [, inX] = edge(nextLeft, next.width);
            const fromY = top + height / 2;
            const toY = column + 1 === 2 ? centreY : slotY(next.count, Math.floor(i / 2), next.height) + next.height / 2;
            const midX = (outX + inX) / 2;
            lines.push({ d: `M${outX} ${fromY}H${midX}V${toY}H${inX}`, isToFinal: false });
          }
        }
      });
      const semiLeft = x(2, SEMI_WIDTH);
      const [semiOut] = edge(semiLeft, SEMI_WIDTH);
      const finalEdge = half === 0 ? size.width / 2 - FINAL_WIDTH / 2 : size.width / 2 + FINAL_WIDTH / 2;
      lines.push({ d: `M${semiOut} ${centreY}H${finalEdge}`, isToFinal: true });
    });
    cards.push(
      <FinalCard
        key="final"
        tie={final.ties[0] ?? null}
        date={final.dates[0]}
        pending={[pendingName(clubs, semis.ties[0]), pendingName(clubs, semis.ties[1])]}
        clubs={clubs}
        coachClubId={coachClubId}
        mark={mark}
        onOpenMatch={onOpenMatch}
        style={{ left: size.width / 2 - FINAL_WIDTH / 2, top: centreY - FINAL_HEIGHT / 2, width: FINAL_WIDTH, minHeight: FINAL_HEIGHT }}
      />,
    );
  }

  const captions = rounds.slice(0, 3).map((round) => round.name);
  return (
    <div className="bk" ref={box} role="group" aria-label={`${name}, mata-mata`}>
      {size && (
        <>
          {captions.map((caption, column) => {
            const width = column === 2 ? SEMI_WIDTH : TIE_WIDTH;
            const left = layoutOf(size.width, size.height).columnX[column] ?? 0;
            return [
              <span key={`l${column}`} className="bk-cap" style={{ left, width }}>
                {caption}
              </span>,
              <span key={`r${column}`} className="bk-cap" style={{ left: size.width - width - left, width }}>
                {caption}
              </span>,
            ];
          })}
          <svg className="bk-lines" aria-hidden="true" width={size.width} height={size.height}>
            {lines.map((line) => (
              <path key={line.d} d={line.d} className={line.isToFinal ? "to-final" : undefined} />
            ))}
          </svg>
          {cards}
        </>
      )}
    </div>
  );
}

const TITLE_NAMES: Record<Extract<LadderPlace, { title: string }>["title"], string> = { Libertadores: "Campeão da Libertadores", "Champions League": "Campeão da Champions" };

/** A ladder place still open: the club already in, the winner of the round it waits on, or the champion of the cup that fills it. */
function placeName(clubs: Clubs, rounds: readonly LadderRound[], place: LadderPlace): string {
  if ("clubId" in place) return nameOf(clubs, place.clubId);
  if ("from" in place) return pendingName(clubs, rounds[place.from]?.tie);
  return TITLE_NAMES[place.title];
}

type LadderProps = { name: string; rounds: LadderRound[]; clubs: Clubs; coachClubId: string | null; mark: string | null; onOpenMatch?: (matchRef: string) => void };

/**
 * The Intercontinental Cup's ladder, pasted left to right: the play-off feeding the
 * African–Asian–Pacific Cup, which meets the Derby of the Americas' winner in the Challenger Cup,
 * whose winner goes on to the final against the Champions League's.
 */
export function LadderBracket({ name, rounds, clubs, coachClubId, mark, onOpenMatch }: LadderProps) {
  const { box, size } = useBoxSize();
  const [playOff, africanAsianPacific, derby, challenger, final] = rounds;
  const cards: React.ReactNode[] = [];
  const captions: React.ReactNode[] = [];
  const lines: { d: string; isToFinal: boolean }[] = [];
  if (size && playOff && africanAsianPacific && derby && challenger && final) {
    const body = size.height - CAPTION_HEIGHT;
    const upper = CAPTION_HEIGHT + body * 0.28;
    const lower = CAPTION_HEIGHT + body * 0.78;
    const centre = (upper + lower) / 2;
    const finalLeft = size.width - FINAL_WIDTH;
    const step = finalLeft / 3;
    const placed = [
      { round: playOff, left: 0, centreY: upper, width: TIE_WIDTH, height: TIE_HEIGHT },
      { round: africanAsianPacific, left: step, centreY: upper, width: TIE_WIDTH, height: TIE_HEIGHT },
      { round: derby, left: step, centreY: lower, width: TIE_WIDTH, height: TIE_HEIGHT },
      { round: challenger, left: 2 * step, centreY: centre, width: SEMI_WIDTH, height: SEMI_HEIGHT },
    ];
    for (const { round, left, centreY, width, height } of placed) {
      const top = centreY - height / 2;
      const isSemi = round === challenger;
      captions.push(
        <span key={`cap-${round.stage}`} className="bk-cap" style={{ left, width, top: top - CAPTION_HEIGHT }}>
          {round.name}
        </span>,
      );
      cards.push(
        round.tie ? (
          <TieCard key={round.stage} tie={round.tie} feeders={[]} clubs={clubs} coachClubId={coachClubId} isSemi={isSemi} onOpenMatch={onOpenMatch} style={{ left, top, width, minHeight: height }} />
        ) : (
          <div key={round.stage} className="stk bk-tie pending" style={{ left, top, width, minHeight: height }}>
            {round.places.map((place, side) => (
              <div key={side} className="slot bk-slot">
                <span>{placeName(clubs, rounds, place)}</span>
              </div>
            ))}
          </div>
        ),
      );
    }
    const join = (from: (typeof placed)[number], to: (typeof placed)[number]) => {
      const outX = from.left + from.width;
      const midX = (outX + to.left) / 2;
      lines.push({ d: `M${outX} ${from.centreY}H${midX}V${to.centreY}H${to.left}`, isToFinal: false });
    };
    const [first, second, third, fourth] = placed;
    if (first && second && third && fourth) {
      join(first, second);
      join(second, fourth);
      join(third, fourth);
      lines.push({ d: `M${fourth.left + fourth.width} ${centre}H${finalLeft}`, isToFinal: true });
    }
    cards.push(
      <FinalCard
        key="final"
        tie={final.tie}
        date={final.dates[0]}
        pending={[placeName(clubs, rounds, final.places[0]), placeName(clubs, rounds, final.places[1])]}
        clubs={clubs}
        coachClubId={coachClubId}
        mark={mark}
        onOpenMatch={onOpenMatch}
        style={{ left: finalLeft, top: centre - FINAL_HEIGHT / 2, width: FINAL_WIDTH, minHeight: FINAL_HEIGHT }}
      />,
    );
  }
  return (
    <div className="bk bk-ladder" ref={box} role="group" aria-label={`${name}, mata-mata`}>
      {size && (
        <>
          {captions}
          <svg className="bk-lines" aria-hidden="true" width={size.width} height={size.height}>
            {lines.map((line) => (
              <path key={line.d} d={line.d} className={line.isToFinal ? "to-final" : undefined} />
            ))}
          </svg>
          {cards}
        </>
      )}
    </div>
  );
}

