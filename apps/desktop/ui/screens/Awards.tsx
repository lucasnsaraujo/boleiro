import { useEffect, useState } from "react";
import type { Club } from "@boleiro/data/clubs";
import type { Role } from "@boleiro/data/players";
import type { GameState } from "@boleiro/engine/sim/gameState";
import type { AwardedPlayer, BallonDorVote, SeasonAwards } from "@boleiro/engine/sim/history/history";
import type { AwardsBook } from "@boleiro/game-client/awards/awardsBook";
import { formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { useServices } from "../app/ServicesContext.js";
import { AwardSticker } from "../awards/AwardSticker.js";
import { Crest } from "../clubs/Crest.js";
import { clubById } from "../clubs/clubCatalog.js";
import "./awards.css";

const KEYS = ["season", "coachClubId", "clubs"] as const;
type AwardsState = Pick<GameState, (typeof KEYS)[number]>;
type ClubLookup = (clubId: string) => Club | null;

const TABS = [
  { id: "premios", title: "Prêmios" },
  { id: "temporadas", title: "Temporadas" },
  { id: "recordes", title: "Recordes" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** One season the book can open: a filed one, or the season under way so far. */
type Shown = { season: number; awards: SeasonAwards; championId: string | null; roundsPlayed: number | null };

const LETTERS: Record<Role, string> = { goleiro: "G", lateral: "L", zagueiro: "Z", meia: "M", atacante: "A" };
const ROLE_WORDS: Record<Role, string> = { goleiro: "goleiro", lateral: "lateral", zagueiro: "zagueiro", meia: "meia", atacante: "atacante" };

const decimal = (value: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const shortYear = (season: number) => String(season).slice(-2);

/** The season's prizes, the seasons before it, and the Brasileirão's and the club's records, as album pages. */
export function Awards() {
  const { engine } = useServices();
  const [loaded, setLoaded] = useState<{ state: AwardsState; book: AwardsBook } | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<TabId>("premios");
  const [shownIndex, setShownIndex] = useState(0);

  useEffect(() => {
    let current = true;
    Promise.all([engine.read(KEYS), engine.awards()]).then(
      ([state, book]) => current && setLoaded({ state, book }),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!loaded) return <p className="status">Abrindo os prêmios…</p>;
  const { state, book } = loaded;
  const clubOf: ClubLookup = (clubId) => state.clubs[clubId] ?? clubById(clubId);
  const seasons: Shown[] = [
    ...(book.provisional ? [{ ...book.provisional, championId: null }] : []),
    ...book.seasons.map((s) => ({ ...s, roundsPlayed: null })),
  ];
  const shown = seasons[Math.min(shownIndex, seasons.length - 1)] ?? null;
  const index = shown ? seasons.indexOf(shown) : 0;
  const open = (season: number) => {
    setShownIndex(Math.max(0, seasons.findIndex((s) => s.season === season)));
    setTab("premios");
  };

  return (
    <div className="awards fills-screen">
      <div className="awards-top">
        <div className="awards-tabs" role="tablist" aria-label="Seções dos prêmios">
          {TABS.map((own) => (
            <button key={own.id} role="tab" aria-selected={own.id === tab} className="awards-tab" onClick={() => setTab(own.id)}>
              {own.title}
            </button>
          ))}
        </div>
        {tab === "premios" && seasons.length > 1 && (
          <div className="awards-step" aria-label="Temporada">
            <button className="awards-step-btn" aria-label="Temporada anterior" disabled={index >= seasons.length - 1} onClick={() => setShownIndex(index + 1)}>
              <i className="ph-bold ph-caret-left" aria-hidden="true" />
            </button>
            <span>{shown?.season}</span>
            <button className="awards-step-btn" aria-label="Temporada seguinte" disabled={index === 0} onClick={() => setShownIndex(index - 1)}>
              <i className="ph-bold ph-caret-right" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <div className="awards-spread" role="tabpanel" aria-label={TABS.find((own) => own.id === tab)?.title}>
        {tab === "premios" &&
          (shown ? (
            <SeasonPages key={shown.season} shown={shown} book={book} clubOf={clubOf} coachClubId={state.coachClubId} onRecords={() => setTab("recordes")} onSeasons={() => setTab("temporadas")} />
          ) : (
            <EmptyPages />
          ))}
        {tab === "temporadas" && <SeasonsPage seasons={seasons} upcoming={book.provisional || seasons[0]?.season === state.season ? null : state.season} clubOf={clubOf} onOpen={open} />}
        {tab === "recordes" && <RecordsPages book={book} clubOf={clubOf} />}
      </div>
    </div>
  );
}

function EmptyPages() {
  return (
    <>
      <section className="aw-page is-left">
        <header className="aw-head">
          <h2>Prêmios</h2>
        </header>
        <div className="aw-empty slot">
          <i className="ph-fill ph-soccer-ball" aria-hidden="true" />
          <p>Os prêmios do Brasileirão saem a partir da primeira rodada, com as médias parciais.</p>
        </div>
      </section>
      <section className="aw-page is-right">
        <header className="aw-head">
          <h2 className="aw-ball-title">
            <span className="aw-ball is-silver" aria-hidden="true">
              <i className="ph-fill ph-soccer-ball" />
            </span>
            Bola de Prata
          </h2>
        </header>
        <div className="aw-empty slot">
          <p>A seleção do campeonato aparece aqui.</p>
        </div>
      </section>
    </>
  );
}

type SeasonProps = { shown: Shown; book: AwardsBook; clubOf: ClubLookup; coachClubId: string | null; onRecords: () => void; onSeasons: () => void };

function SeasonPages({ shown, book, clubOf, coachClubId, onRecords, onSeasons }: SeasonProps) {
  const { awards, season, roundsPlayed } = shown;
  const gold = awards.bolaDeOuro;
  const goldClub = gold ? clubOf(gold.clubId) : null;
  const isProvisional = roundsPlayed !== null;
  const team = awards.bolaDePrata;
  const coachClub = coachClubId ? clubOf(coachClubId) : null;
  const ours = coachClubId ? team.filter((p) => p.clubId === coachClubId).length : 0;
  const lines = { atacante: [] as AwardedPlayer[], meia: [] as AwardedPlayer[], back: [] as AwardedPlayer[], goleiro: [] as AwardedPlayer[] };
  for (const p of team) {
    if (p.role === "atacante") lines.atacante.push(p);
    else if (p.role === "meia") lines.meia.push(p);
    else if (p.role === "goleiro") lines.goleiro.push(p);
    else lines.back.push(p);
  }
  // The back four as a team sheet reads them: a full-back on each side of the centre-backs.
  const [leftBack, ...others] = lines.back.filter((p) => p.role === "lateral");
  const back = [...(leftBack ? [leftBack] : []), ...lines.back.filter((p) => p.role === "zagueiro"), ...others];
  const formation = `${back.length}-${lines.meia.length}-${lines.atacante.length}`;
  const numberOf = new Map(team.map((p, i) => [p.playerId, i + 1]));
  const rows = [lines.atacante, lines.meia, back, lines.goleiro];
  const [second, third] = awards.runnersUp;

  return (
    <>
      <section className="aw-page is-left" aria-labelledby="aw-season-title">
        <header className="aw-head">
          <h2 id="aw-season-title">Prêmios {season}</h2>
          <span>{isProvisional ? `Parcial · após ${roundsPlayed} ${roundsPlayed === 1 ? "rodada" : "rodadas"}` : "Brasileirão Série A · temporada encerrada"}</span>
        </header>
        <div className="aw-gold" aria-label="Bola de Ouro" role="group">
          {gold ? (
            <>
              <AwardSticker name={gold.name} club={goldClub} code={`BO ${shortYear(season)}`} caption={`${goldClub?.shortName ?? ""} · ${ROLE_WORDS[gold.role]}`} isWinner size="hero" />
              <div className="aw-gold-text">
                <div className="aw-award">
                  <span className="aw-ball is-gold" aria-hidden="true">
                    <i className="ph-fill ph-soccer-ball" />
                  </span>
                  Bola de Ouro{isProvisional && <span className="chip wait">parcial</span>}
                </div>
                <h3>{gold.name}</h3>
                <p>
                  {goldClub?.shortName}
                  {shown.championId === gold.clubId ? ", campeão brasileiro" : ""}. {isProvisional ? "A melhor média do campeonato até aqui." : "A melhor média do campeonato."}
                </p>
                <dl className="aw-nums">
                  <div>
                    <dd>{gold.apps}</dd>
                    <dt>jogos</dt>
                  </div>
                  <div>
                    <dd>{gold.goals}</dd>
                    <dt>gols</dt>
                  </div>
                  <div>
                    <dd>{gold.assists}</dd>
                    <dt>assist.</dt>
                  </div>
                  <div>
                    <dd>{decimal(gold.average)}</dd>
                    <dt>nota</dt>
                  </div>
                </dl>
                {second && (
                  <p className="aw-votes">
                    2º <b>{second.name}</b>
                    {third && (
                      <>
                        {" "}
                        · 3º <b>{third.name}</b>
                      </>
                    )}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="aw-none">Ninguém jogou o bastante para a Bola de Ouro: são 19 jogos no mínimo.</p>
          )}
        </div>
        <ul className="aw-trio" aria-label="Outros prêmios">
          <TrioItem label="Artilheiro" player={awards.topScorer} clubOf={clubOf} detail={(p) => `${p.goals} gols · ${clubOf(p.clubId)?.shortName ?? ""}`} order={1} />
          <TrioItem label="Revelação" player={awards.bestYoung} clubOf={clubOf} detail={(p) => `${p.age} anos · ${clubOf(p.clubId)?.shortName ?? ""}`} order={2} />
          <BallonItem vote={awards.ballonDor[0] ?? null} clubOf={clubOf} />
        </ul>
        <section className="aw-rec" aria-labelledby="aw-rec-title">
          <h4 id="aw-rec-title">Recordes</h4>
          <dl>
            <RecordRow term="Maior goleada do Brasileirão" value={book.league?.biggestWin ? winText(book.league.biggestWin, clubOf) : null} detail={book.league?.biggestWin ? String(book.league.biggestWin.season) : ""} />
            <RecordRow
              term="Mais gols numa temporada"
              value={book.league?.mostSeasonGoals ? `${book.league.mostSeasonGoals.name}, ${book.league.mostSeasonGoals.goals}` : null}
              detail={book.league?.mostSeasonGoals ? `${clubOf(book.league.mostSeasonGoals.clubId)?.shortName ?? ""}, ${book.league.mostSeasonGoals.season}` : ""}
            />
            <RecordRow
              term="Goleador mais jovem"
              value={book.league?.youngestScorer ? `${book.league.youngestScorer.name}, ${book.league.youngestScorer.age} anos` : null}
              detail={book.league?.youngestScorer ? `${clubOf(book.league.youngestScorer.clubId)?.shortName ?? ""}, ${book.league.youngestScorer.season}` : ""}
            />
            {book.club && (
              <RecordRow
                term={`Invencibilidade do ${clubOf(book.club.clubId)?.shortName ?? ""}`}
                value={book.club.records.longestUnbeaten ? `${book.club.records.longestUnbeaten.games} jogos` : null}
                detail={book.club.records.longestUnbeaten ? `${formatDayMonth(book.club.records.longestUnbeaten.from)} – ${formatDayMonth(book.club.records.longestUnbeaten.until)}` : ""}
              />
            )}
          </dl>
        </section>
        <div className="aw-acts">
          <button className="btn go" onClick={onRecords}>
            <i className="ph-bold ph-medal" aria-hidden="true" />
            Todos os recordes
          </button>
          <button className="btn flat" onClick={onSeasons}>
            <i className="ph-bold ph-list-numbers" aria-hidden="true" />
            Temporadas anteriores
          </button>
        </div>
      </section>
      <section className="aw-page is-right" aria-labelledby="aw-silver-title">
        <header className="aw-head">
          <h2 id="aw-silver-title" className="aw-ball-title">
            <span className="aw-ball is-silver" aria-hidden="true">
              <i className="ph-fill ph-soccer-ball" />
            </span>
            Bola de Prata
          </h2>
          <span>{team.length ? `Seleção do campeonato · ${formation}` : "Seleção do campeonato"}</span>
        </header>
        {coachClub && team.length > 0 && (
          <p className="note aw-note">
            <b>{ours === 0 ? `Nenhum do ${coachClub.shortName}` : `${ours} do ${coachClub.shortName}`}</b> na seleção.
            {gold && team.some((p) => p.playerId === gold.playerId) ? ` ${gold.name} leva também a Bola de Ouro.` : ""}
          </p>
        )}
        <div className="aw-pitch">
          <div className="aw-lines" aria-hidden="true" />
          {team.length === 0 ? (
            <p className="aw-none">A seleção sai quando os jogadores somarem 19 jogos.</p>
          ) : (
            <ol className="aw-team" aria-label="Bola de Prata">
              {rows.map((row, r) => (
                <li key={r} className="aw-row">
                  <ol className="aw-row-list">
                    {row.map((p) => {
                      const club = clubOf(p.clubId);
                      const number = numberOf.get(p.playerId) ?? 0;
                      return (
                        <li key={p.playerId} className="aw-pick" aria-label={`${p.name}, ${ROLE_WORDS[p.role]}, ${club?.shortName ?? ""}, nota ${decimal(p.average)}`}>
                          <AwardSticker name={p.name} club={club} code={`BP ${String(number).padStart(2, "0")}`} caption={club?.shortName ?? ""} isWinner={p.playerId === gold?.playerId} order={number + 2}>
                            <span className={`pos ${LETTERS[p.role]} aw-pos`} aria-hidden="true">
                              {LETTERS[p.role]}
                            </span>
                            <span className="aw-avg" aria-hidden="true">
                              {decimal(p.average)}
                            </span>
                          </AwardSticker>
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </>
  );
}

function winText(win: { homeId: string; awayId: string; homeGoals: number; awayGoals: number }, clubOf: ClubLookup): string {
  return `${clubOf(win.homeId)?.shortName ?? win.homeId} ${win.homeGoals} × ${win.awayGoals} ${clubOf(win.awayId)?.shortName ?? win.awayId}`;
}

function TrioItem({ label, player, clubOf, detail, order }: { label: string; player: AwardedPlayer | null; clubOf: ClubLookup; detail: (p: AwardedPlayer) => string; order: number }) {
  return (
    <li className="aw-trio-item" aria-label={player ? `${label}: ${player.name}` : `${label}: ninguém ainda`}>
      {player ? <AwardSticker name={player.name} club={clubOf(player.clubId)} isWinner size="mini" order={order} /> : <span className="aw-mini-slot slot" aria-hidden="true" />}
      <div>
        <span className="lbl">{label}</span>
        <b>{player?.name ?? "–"}</b>
        <small>{player ? detail(player) : "Ninguém ainda"}</small>
      </div>
    </li>
  );
}

function BallonItem({ vote, clubOf }: { vote: BallonDorVote | null; clubOf: ClubLookup }) {
  return (
    <li className="aw-trio-item" aria-label={vote ? `Ballon d'Or: ${vote.name}` : "Ballon d'Or: ninguém ainda"}>
      {vote ? <AwardSticker name={vote.name} club={clubOf(vote.clubId)} isWinner size="mini" order={3} /> : <span className="aw-mini-slot slot" aria-hidden="true" />}
      <div>
        <span className="lbl">Ballon d'Or</span>
        <b>{vote?.name ?? "–"}</b>
        <small>{vote ? `Melhor do mundo · ${vote.clubName}` : "Ninguém ainda"}</small>
      </div>
    </li>
  );
}

function RecordRow({ term, value, detail }: { term: string; value: string | null; detail: string }) {
  return (
    <div className="aw-rr">
      <dt>{term}</dt>
      <dd>
        {value ?? "–"}
        {value && detail && <small>{detail}</small>}
      </dd>
    </div>
  );
}

/** A prize in a season's row: the winner's mini sticker, his name and a detail. */
function PrizeCell({ name, clubId, detail, clubOf }: { name: string | null; clubId: string | null; detail: string; clubOf: ClubLookup }) {
  if (!name || !clubId) return <span className="aw-cell-none">–</span>;
  return (
    <span className="aw-cell">
      <AwardSticker name={name} club={clubOf(clubId)} size="mini" />
      <span>
        <b>{name}</b>
        <small>{detail}</small>
      </span>
    </span>
  );
}

type SeasonsProps = { seasons: readonly Shown[]; upcoming: number | null; clubOf: ClubLookup; onOpen: (season: number) => void };

function SeasonsPage({ seasons, upcoming, clubOf, onOpen }: SeasonsProps) {
  return (
    <section className="aw-page is-wide" aria-labelledby="aw-seasons-title">
      <header className="aw-head">
        <h2 id="aw-seasons-title">Temporadas</h2>
        <span>Os prêmios de cada ano, desde o começo da carreira</span>
      </header>
      {seasons.length === 0 ? (
        <p className="aw-none">Nenhuma temporada premiada ainda.</p>
      ) : (
        <table className="aw-table" aria-label="Prêmios por temporada">
          <thead>
            <tr>
              <th scope="col">Ano</th>
              <th scope="col">Campeão</th>
              <th scope="col">Bola de Ouro</th>
              <th scope="col">Ballon d'Or</th>
              <th scope="col">Artilheiro</th>
              <th scope="col">Revelação</th>
              <th scope="col">
                <span className="visually-hidden">Abrir</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {upcoming !== null && (
              <tr className="aw-upcoming">
                <th scope="row">{upcoming}</th>
                <td colSpan={6}>
                  <span className="slot">Os prêmios de {upcoming} começam a contar na primeira rodada do Brasileirão.</span>
                </td>
              </tr>
            )}
            {seasons.map((s, i) => {
              const champion = s.championId ? clubOf(s.championId) : null;
              const { bolaDeOuro: gold, topScorer: scorer, bestYoung: young } = s.awards;
              const [ballon] = s.awards.ballonDor;
              return (
                <tr key={s.season} style={{ animationDelay: `${i * 60}ms` }}>
                  <th scope="row">
                    {s.season}
                    {s.roundsPlayed !== null && <span className="chip wait">parcial</span>}
                  </th>
                  <td>
                    {champion ? (
                      <span className="aw-champion">
                        <span className="aw-crest" aria-hidden="true">
                          <Crest club={champion} size={28} />
                        </span>
                        {champion.shortName}
                      </span>
                    ) : (
                      <span className="aw-cell-none">{s.roundsPlayed !== null ? "em andamento" : "–"}</span>
                    )}
                  </td>
                  <td>
                    <PrizeCell name={gold?.name ?? null} clubId={gold?.clubId ?? null} detail={gold ? `nota ${decimal(gold.average)}` : ""} clubOf={clubOf} />
                  </td>
                  <td>
                    <PrizeCell name={ballon?.name ?? null} clubId={ballon?.clubId ?? null} detail={ballon ? ballon.clubName : ""} clubOf={clubOf} />
                  </td>
                  <td>
                    <PrizeCell name={scorer?.name ?? null} clubId={scorer?.clubId ?? null} detail={scorer ? `${scorer.goals} gols` : ""} clubOf={clubOf} />
                  </td>
                  <td>
                    <PrizeCell name={young?.name ?? null} clubId={young?.clubId ?? null} detail={young ? `${young.age} anos` : ""} clubOf={clubOf} />
                  </td>
                  <td>
                    <button className="btn sm" onClick={() => onOpen(s.season)} aria-label={`Ver os prêmios de ${s.season}`}>
                      Ver
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RecordsPages({ book, clubOf }: { book: AwardsBook; clubOf: ClubLookup }) {
  const league = book.league;
  const club = book.club;
  const clubFace = club ? clubOf(club.clubId) : null;
  const clubName = club ? (clubFace?.shortName ?? club.clubId) : "";
  const nameOf = (clubId: string) => clubOf(clubId)?.shortName ?? clubId;
  const records = club?.records;
  const mark = (m: { goalsFor: number; goalsAgainst: number; opponentId: string; season: number } | null | undefined) =>
    m ? { value: `${m.goalsFor} × ${m.goalsAgainst} ${clubOf(m.opponentId)?.shortName ?? m.opponentId}`, detail: String(m.season) } : null;
  const win = mark(records?.biggestWin);
  const loss = mark(records?.biggestLoss);
  return (
    <>
      <section className="aw-page is-left" aria-labelledby="aw-league-title">
        <header className="aw-head">
          <h2 id="aw-league-title">Brasileirão</h2>
          <span>Recordes da Série A desde o começo da carreira</span>
        </header>
        <dl className="aw-plates">
          <RecordPlate
            term="Maior goleada"
            big={league?.biggestWin ? `${league.biggestWin.homeGoals} × ${league.biggestWin.awayGoals}` : null}
            who={league?.biggestWin ? `${nameOf(league.biggestWin.homeId)} × ${nameOf(league.biggestWin.awayId)}` : ""}
            when={league?.biggestWin ? `${formatDayMonth(league.biggestWin.date)} de ${league.biggestWin.season}` : ""}
            clubId={league?.biggestWin ? (league.biggestWin.homeGoals > league.biggestWin.awayGoals ? league.biggestWin.homeId : league.biggestWin.awayId) : null}
            clubOf={clubOf}
          />
          <RecordPlate
            term="Mais gols numa temporada"
            big={league?.mostSeasonGoals ? String(league.mostSeasonGoals.goals) : null}
            who={league?.mostSeasonGoals?.name ?? ""}
            when={league?.mostSeasonGoals ? `${clubOf(league.mostSeasonGoals.clubId)?.shortName ?? ""}, ${league.mostSeasonGoals.season}` : ""}
            clubId={league?.mostSeasonGoals?.clubId ?? null}
            clubOf={clubOf}
          />
          <RecordPlate
            term="Goleador mais jovem"
            big={league?.youngestScorer ? `${league.youngestScorer.age} anos` : null}
            who={league?.youngestScorer?.name ?? ""}
            when={league?.youngestScorer ? `${clubOf(league.youngestScorer.clubId)?.shortName ?? ""} × ${clubOf(league.youngestScorer.opponentId)?.shortName ?? ""}, ${formatDayMonth(league.youngestScorer.date)} de ${league.youngestScorer.season}` : ""}
            clubId={league?.youngestScorer?.clubId ?? null}
            clubOf={clubOf}
          />
        </dl>
        <p className="aw-foot">Os recordes contam do início da carreira; quando um deles cai, o jornal e a caixa de entrada avisam.</p>
      </section>
      <section className="aw-page is-right" aria-labelledby="aw-club-title">
        <header className="aw-head">
          <h2 id="aw-club-title" className="aw-ball-title">
            {clubFace && (
              <span className="aw-crest" aria-hidden="true">
                <Crest club={clubFace} size={30} />
              </span>
            )}
            {club ? clubName : "Clube"}
          </h2>
          <span>Recordes do clube</span>
        </header>
        {!club || !records ? (
          <p className="aw-none">Sem clube, sem recordes de clube.</p>
        ) : (
          <>
            <dl className="aw-rec">
              <RecordRow term="Maior vitória" value={win?.value ?? null} detail={win?.detail ?? ""} />
              <RecordRow term="Maior derrota" value={loss?.value ?? null} detail={loss?.detail ?? ""} />
              <RecordRow term="Maior invencibilidade" value={records.longestUnbeaten ? `${records.longestUnbeaten.games} jogos` : null} detail={records.longestUnbeaten ? `${formatDayMonth(records.longestUnbeaten.from)} – ${formatDayMonth(records.longestUnbeaten.until)}` : ""} />
              <RecordRow term="Invencibilidade atual" value={records.unbeaten ? `${records.unbeaten.games} jogos` : null} detail={records.unbeaten ? `desde ${formatDayMonth(records.unbeaten.from)}` : ""} />
              <RecordRow term="Mais gols numa temporada" value={records.mostSeasonGoals ? `${records.mostSeasonGoals.name}, ${records.mostSeasonGoals.goals}` : null} detail={records.mostSeasonGoals ? String(records.mostSeasonGoals.season) : ""} />
              <RecordRow term="Goleador mais jovem" value={records.youngestScorer ? `${records.youngestScorer.name}, ${records.youngestScorer.age} anos` : null} detail={records.youngestScorer ? String(records.youngestScorer.season) : ""} />
            </dl>
            <div className="aw-leaders">
              <Leaders title="Mais jogos" rows={club.mostApps.map((p) => ({ id: p.playerId, name: p.name, value: p.apps }))} />
              <Leaders title="Artilheiros" rows={club.topScorers.map((p) => ({ id: p.playerId, name: p.name, value: p.goals }))} />
            </div>
          </>
        )}
      </section>
    </>
  );
}

/** A league record as a printed plate: the mark in display type, who holds it, and when. */
function RecordPlate({ term, big, who, when, clubId, clubOf }: { term: string; big: string | null; who: string; when: string; clubId: string | null; clubOf: ClubLookup }) {
  const club = clubId ? clubOf(clubId) : null;
  return (
    <div className="aw-plate stk">
      <dt className="lbl">{term}</dt>
      <dd>
        <span className="aw-plate-big">{big ?? "–"}</span>
        {big && (
          <span className="aw-plate-who">
            {club && (
              <span className="aw-crest" aria-hidden="true">
                <Crest club={club} size={22} />
              </span>
            )}
            <span>
              <b>{who}</b>
              <small>{when}</small>
            </span>
          </span>
        )}
      </dd>
    </div>
  );
}

function Leaders({ title, rows }: { title: string; rows: readonly { id: string; name: string; value: number }[] }) {
  return (
    <section className="aw-lead" aria-label={title}>
      <h4>{title}</h4>
      {rows.length === 0 ? (
        <p className="aw-none">–</p>
      ) : (
        <ol>
          {rows.map((row) => (
            <li key={row.id}>
              <span>{row.name}</span>
              <b>{row.value}</b>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
