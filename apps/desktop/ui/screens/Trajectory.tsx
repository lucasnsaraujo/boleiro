import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router";
import type { MarkerKind, Trajectory as Career, TrajectoryMarker } from "@boleiro/game-client/moments/trajectoryOf";
import { formatGameDate } from "@boleiro/game-client/format/formatGameDate";
import { useServices } from "../app/ServicesContext.js";
import { plateColours } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import { crestClub } from "../moments/MomentSticker.js";
import "./trajectory.css";

type Filter = "all" | "title" | "exit" | "idol" | "tribute";

const FILTERS: { id: Filter; label: string; kinds: readonly MarkerKind[] }[] = [
  { id: "all", label: "Tudo", kinds: ["title", "idol", "sacking", "exit", "tribute", "award"] },
  { id: "title", label: "Títulos", kinds: ["title"] },
  { id: "exit", label: "Saídas", kinds: ["exit", "sacking"] },
  { id: "idol", label: "Ídolo", kinds: ["idol"] },
  { id: "tribute", label: "Homenagens", kinds: ["tribute", "award"] },
];

// The playhead sweeps the career in 2.7 s when the screen opens, as in the mock.
const SWEEP_MS = 2700;
const SWEEP_FROM_MS = 300;
// Two markers closer than this share a row only if they don't touch, at the timeline's 1200 px or so.
const MARKER_GAP = 2.8;
const ROWS = 3;
const IDOL_LINE = 80;
// The idol lane's place in the timeline (trajectory.css .tj-idol), and the room a line's name takes.
const IDOL_TOP = 196;
const IDOL_HEIGHT = 72;
const LABEL_GAP = 13;

/** Each marker's row in the moments lane, so nearby markers stack instead of covering each other. */
function rowsOf(markers: readonly TrajectoryMarker[], at: (year: number) => number): Map<string, number> {
  const ends = Array.from({ length: ROWS }, () => -Infinity);
  const rows = new Map<string, number>();
  for (const marker of markers) {
    const x = at(marker.at);
    const row = Math.max(0, ends.findIndex((end) => x - end >= MARKER_GAP));
    ends[row] = x;
    rows.set(marker.id, row);
  }
  return rows;
}

/** Histórico › Trajetória: the career on one timeline, any time. Clubs, titles, idol crossings, sackings, exits and tributes, the fans' meter per club, and the records. */
export function Trajectory() {
  const { engine } = useServices();
  const navigate = useNavigate();
  const [career, setCareer] = useState<Career | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [pickedId, setPickedId] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    engine.trajectory().then(
      (loaded) => current && setCareer(loaded),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!career) return <p className="status">Abrindo a trajetória…</p>;

  const span = Math.max(1, career.to - career.from);
  const at = (year: number) => Math.max(0, Math.min(100, ((year - career.from) / span) * 100));
  const delay = (year: number) => SWEEP_FROM_MS + ((year - career.from) / span) * SWEEP_MS;
  const kinds = FILTERS.find((f) => f.id === filter)?.kinds ?? [];
  const markers = career.markers.filter((marker) => kinds.includes(marker.kind));
  const rows = rowsOf(markers, at);
  const picked = career.markers.find((marker) => marker.id === pickedId) ?? markers.at(-1) ?? null;
  const years = Array.from({ length: span }, (_, i) => career.from + i);
  // Clubs in the same colour get a dashed line after the first, so each can be told apart.
  const seenStrokes = new Set<string>();
  const idolStrokes = career.idolLines.map((line) => {
    const stroke = line.club.colours.primary.toUpperCase() === "#FFFFFF" ? line.club.colours.secondary : line.club.colours.primary;
    const dash = seenStrokes.has(stroke.toUpperCase()) ? "5 4" : undefined;
    seenStrokes.add(stroke.toUpperCase());
    return { line, stroke, dash };
  });
  // Each line is named at its last point; names closer than a line apart are pushed down so none covers another.
  const idolLabels = career.idolLines
    .flatMap((line) => {
      const last = line.points.at(-1);
      return last ? [{ line, year: last[0], value: last[1], top: IDOL_TOP + (IDOL_HEIGHT * (100 - last[1])) / 100 }] : [];
    })
    .sort((a, b) => a.top - b.top)
    .reduce<{ line: Career["idolLines"][number]; year: number; value: number; top: number }[]>((placed, label) => {
      const above = placed.at(-1);
      return [...placed, { ...label, top: above ? Math.max(label.top, above.top + LABEL_GAP) : label.top }];
    }, []);
  const step = span > 12 ? 5 : span > 6 ? 2 : 1;

  return (
    <div className="trajectory">
      <header className="tj-head">
        <h1 className="screen-title">
          Sua carreira
          <small>
            {career.coachName} · técnico desde {career.since} · {career.games.toLocaleString("pt-BR")} jogos
          </small>
        </h1>
        <div className="tj-sum">
          {career.summary.map((item) => (
            <div key={item.label} className={`nst${item.isFoil ? " foil" : ""}`}>
              <b>{item.value}</b>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </header>
      <div className="tj-tools">
        <div className="seg" role="group" aria-label="Mostrar">
          {FILTERS.map((f) => (
            <button key={f.id} className={f.id === filter ? "on" : undefined} aria-pressed={f.id === filter} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <Link className="btn-quiet" to="/history">
          <i className="ph-bold ph-book-open-text" aria-hidden="true" />
          Álbum
        </Link>
      </div>
      <section className="tj-line" aria-label="Linha do tempo">
        <span className="tj-lane" style={{ top: 12 }}>
          Marcos
        </span>
        <span className="tj-lane" style={{ top: 140 }}>
          Clubes
        </span>
        <span className="tj-lane" style={{ top: 202 }}>
          Ídolo
        </span>
        <div className="tj-track">
          <svg className="tj-idol" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <line x1="0" x2="100" y1={100 - IDOL_LINE} y2={100 - IDOL_LINE} className="tj-idol-line" />
            {idolStrokes.map(({ line, stroke, dash }) => (
              <polyline
                key={line.club.id}
                className="tj-idol-club"
                style={{ stroke, strokeDasharray: dash }}
                points={line.points.map(([year, value]) => `${at(year)},${100 - value}`).join(" ")}
              />
            ))}
          </svg>
          {idolLabels.map(({ line, top, value, year }) => (
            <span key={`label-${line.club.id}`} className="tj-idol-label" style={{ left: `${at(year)}%`, top } as CSSProperties}>
              {line.club.name} · {value}
            </span>
          ))}
          {career.bands.map((band, index) => (
            <div
              key={`${band.club.id}-${index}`}
              className="tj-band"
              style={{ left: `${at(band.from)}%`, width: `calc(${at(band.to) - at(band.from)}% - 3px)`, background: plateColours(band.club.colours).background, color: plateColours(band.club.colours).text, "--d": delay(band.from), "--len": Math.max(120, delay(band.to) - delay(band.from)) } as CSSProperties}
              title={`${band.club.name} · ${band.label}`}
            >
              <Crest club={crestClub(band.club)} size={24} />
              <span>
                {band.club.name} <small>{band.label}</small>
              </span>
            </div>
          ))}
          {markers.map((marker) => (
            <button
              key={marker.id}
              className={`tj-mk is-${marker.kind}${picked?.id === marker.id ? " on" : ""}`}
              style={{ left: `${at(marker.at)}%`, top: 26 + (rows.get(marker.id) ?? 0) * 33, "--d": delay(marker.at) } as CSSProperties}
              aria-label={`${marker.title}, ${formatGameDate(marker.date)}`}
              aria-pressed={picked?.id === marker.id}
              onClick={() => setPickedId(marker.id)}
            >
              <i className={`ph-fill ph-${marker.icon}`} aria-hidden="true" />
            </button>
          ))}
          {years.map((year) =>
            (year - career.from) % step === 0 ? (
              <span key={year} className={`tj-yr${year % 5 === 0 ? " big" : ""}`} style={{ left: `${at(year + 0.5)}%` }}>
                {year}
              </span>
            ) : null,
          )}
          <div className="tj-head-line" />
        </div>
        <span className="tj-today">hoje · {career.today}</span>
      </section>
      <div className="tj-low">
        {picked ? (
          <article className="tj-det" aria-live="polite">
            <Crest club={crestClub(picked.club)} size={64} />
            <div>
              <div className="kind">
                <i className={`ph-fill ph-${picked.icon}`} aria-hidden="true" />
                {formatGameDate(picked.date)} · {picked.club.name}
              </div>
              <h2>{picked.title}</h2>
              <p>{picked.detail}</p>
              <div className="links">
                {picked.momentId && (
                  <button className="btn sm" onClick={() => navigate(`/moment?replay=${encodeURIComponent(picked.momentId ?? "")}`)}>
                    <i className="ph-bold ph-play" aria-hidden="true" />
                    Rever o momento
                  </button>
                )}
                <Link className="btn sm flat" to="/history">
                  <i className="ph-bold ph-book-open-text" aria-hidden="true" />
                  Página do álbum
                </Link>
              </div>
            </div>
          </article>
        ) : (
          <article className="tj-det is-empty">
            <p>Os marcos da carreira aparecem aqui conforme acontecem: títulos, ídolo, saídas e homenagens.</p>
          </article>
        )}
        <section className="tj-rec">
          <h3>Recordes</h3>
          {career.records.length ? (
            career.records.map(([label, value]) => (
              <div key={label} className="rr">
                <span>{label}</span>
                <b>{value}</b>
              </div>
            ))
          ) : (
            <p className="tj-none">Nenhum recorde ainda.</p>
          )}
        </section>
      </div>
    </div>
  );
}
