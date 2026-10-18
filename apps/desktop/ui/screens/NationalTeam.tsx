import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Role } from "@boleiro/data/players";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { clubArticle, withArticle } from "@boleiro/data/articles";
import { addDays } from "@boleiro/engine/sim/dates";
import { formatDayMonth, formatMonthYear } from "@boleiro/game-client/format/formatGameDate";
import { nationalTeamWithPreposition } from "@boleiro/game-client/format/nationalTeamName";
import type { NationalCompetitionView, NationalFixtureRow, NationalPlayerCard, NationalTeamPage } from "@boleiro/game-client/nationalTeam/nationalTeamPage";
import { useServices } from "../app/ServicesContext.js";
import { useMatchFile } from "../matchPage/MatchFile.js";
import { Crest } from "../clubs/Crest.js";
import { Select } from "../controls/Select.js";
import { NationalCrest } from "../nationalTeam/NationalCrest.js";
import "./nationalTeam.css";

const KEYS = ["clubs", "coachClubId", "date"] as const;
type NationalState = Pick<GameState, (typeof KEYS)[number]>;

const ROLE_GROUPS: Record<Role, string> = { goleiro: "Goleiros", lateral: "Laterais", zagueiro: "Zagueiros", meia: "Meio-campo", atacante: "Atacantes" };
const ROLE_ONE: Record<Role, string> = { goleiro: "goleiro", lateral: "lateral", zagueiro: "zagueiro", meia: "meia", atacante: "atacante" };
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const ROUND_NAMES: Record<string, string> = {
  "round-of-32": "16 avos",
  "round-of-16": "Oitavas",
  "quarter-finals": "Quartas",
  "semi-finals": "Semifinal",
  "third-place": "3º lugar",
  final: "Final",
};
// A row holds eight stickers; a pick list opened from its right half opens leftward.
const ROW_HALF = 4;
type Tab = "callUp" | "tables" | "ranking";
const TABS: { id: Tab; label: string }[] = [
  { id: "callUp", label: "Convocação" },
  { id: "tables", label: "Jogos e tabelas" },
  { id: "ranking", label: "Ranking Fifa" },
];

const spanLabel = (from: string, until: string) => {
  const [a, b] = [formatDayMonth(from), formatDayMonth(until)];
  return a.split(" ")[1] === b.split(" ")[1] ? `${a.split(" ")[0]} a ${b}` : `${a} a ${b}`;
};

function scoreOf(row: NationalFixtureRow): string | null {
  if (!row.result) return null;
  const pens = row.result.penaltyWinnerId ? ` (pên. ${row.result.penaltyWinnerId === row.homeId ? row.home : row.away})` : row.result.isAfterExtraTime ? " (prorr.)" : "";
  return `${row.result.home} × ${row.result.away}${pens}`;
}

function Sticker({ player, number, colours, index, onDrop }: { player: NationalPlayerCard; number: number; colours: NationalTeamPage["team"]["colours"]; index: number; onDrop?: () => void }) {
  const style = { "--nt-a": colours.primary, "--nt-b": colours.secondary, "--i": index } as CSSProperties;
  const label = `${player.name}, ${player.club}, força ${player.strength}${player.isCoachClub ? ", seu clube" : ""}`;
  return (
    <li className={player.isCoachClub ? "nt-ms mine" : "nt-ms"} style={style} aria-label={label}>
      {onDrop && (
        <button type="button" className="nt-drop" aria-label={`Tirar ${player.name} da convocação`} onClick={onDrop}>
          <i className="ph-bold ph-x" aria-hidden="true" />
        </button>
      )}
      <div className="nt-art" aria-hidden="true">
        {player.crestId && <Crest club={{ id: player.crestId, shortName: player.club, colours }} size={16} />}
        <em>{player.strength}</em>
        <b>{player.name.charAt(0)}</b>
        <span className="nt-no">{String(number).padStart(2, "0")}</span>
      </div>
      <div className="nt-nm">{player.name}</div>
      <div className="nt-cl">{player.club}</div>
    </li>
  );
}

/** A played match's row opens its ficha: a button over the whole row, under its text. */
function OpenMatch({ row, onOpen, className }: { row: NationalFixtureRow; onOpen: (matchRef: string) => void; className: string }) {
  const ref = row.pageRef;
  if (!ref) return null;
  return <button type="button" className={className} aria-label={`Ficha do jogo: ${row.home} x ${row.away}`} onClick={() => onOpen(ref)} />;
}

function FixtureLine({ row, page, onOpen }: { row: NationalFixtureRow; page: NationalTeamPage; onOpen: (matchRef: string) => void }) {
  const day = new Date(row.date);
  const looks = (id: string) => page.teams.find((t) => t.id === id);
  const home = looks(row.homeId);
  const away = looks(row.awayId);
  const score = scoreOf(row);
  return (
    <li className="nt-fx">
      <OpenMatch row={row} onOpen={onOpen} className="nt-open" />
      <div className="nt-d">
        {WEEKDAYS[day.getUTCDay()]}
        <b>{day.getUTCDate()}</b>
      </div>
      <div>
        <div className="nt-m">
          {home && <NationalCrest teamId={home.id} code={home.code} colours={home.colours} size={20} label={home.name} />}
          <span>{row.home}</span>
          <span className={score ? "nt-score" : "nt-x"}>{score ?? "×"}</span>
          <span>{row.away}</span>
          {away && <NationalCrest teamId={away.id} code={away.code} colours={away.colours} size={20} label={away.name} />}
        </div>
        <small>
          {row.competition}
          {row.round !== "group" && row.round !== "friendly" ? ` · ${ROUND_NAMES[row.round] ?? row.round}` : ""}
        </small>
      </div>
    </li>
  );
}

/** A group's heading: a competition of one table (CONMEBOL's qualifiers) has a standing, not a group. */
const groupLabel = (competition: NationalCompetitionView, name: string) => (competition.groups.length === 1 ? "Classificação" : name.length <= 2 ? `Grupo ${name}` : name);

function CompetitionTables({ competition, page, onOpen }: { competition: NationalCompetitionView; page: NationalTeamPage; onOpen: (matchRef: string) => void }) {
  const [own, ...others] = competition.groups;
  const [isAll, setAll] = useState(false);
  const shown = own ? [own, ...(isAll ? others : [])] : [];
  const champion = competition.winnerId ? page.teams.find((t) => t.id === competition.winnerId)?.name : null;
  return (
    <section className="nt-comp" aria-label={competition.name}>
      <h3>
        {competition.name}
        {champion && <span className="chip ok">Campeão: {champion}</span>}
      </h3>
      <div className="nt-groups">
        {shown.map((group) => (
          <table key={group.name} className="nt-table" aria-label={`${competition.name}, ${competition.groups.length === 1 ? "classificação" : group.name.length <= 2 ? `grupo ${group.name}` : group.name}`}>
            <thead>
              <tr>
                <th scope="col" className="nt-tn">{groupLabel(competition, group.name)}</th>
                <th scope="col" title="Jogos">J</th>
                <th scope="col" title="Vitórias">V</th>
                <th scope="col" title="Empates">E</th>
                <th scope="col" title="Derrotas">D</th>
                <th scope="col" title="Saldo de gols">SG</th>
                <th scope="col" title="Pontos">Pts</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row, i) => (
                <tr key={row.teamId} className={[row.teamId === page.team.id ? "own" : "", row.isThrough ? "through" : ""].filter(Boolean).join(" ") || undefined}>
                  <th scope="row" className="nt-tn">
                    <span className="nt-pos">{i + 1}</span>
                    {(() => {
                      const looks = page.teams.find((t) => t.id === row.teamId);
                      return looks ? <NationalCrest teamId={looks.id} code={looks.code} colours={looks.colours} size={18} label={looks.name} /> : null;
                    })()}
                    {row.name}
                  </th>
                  <td>{row.played}</td>
                  <td>{row.won}</td>
                  <td>{row.drawn}</td>
                  <td>{row.lost}</td>
                  <td>{row.goalsFor - row.goalsAgainst > 0 ? `+${row.goalsFor - row.goalsAgainst}` : row.goalsFor - row.goalsAgainst}</td>
                  <td className="nt-pts">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      {competition.matches.length > 0 && (
        <ul className="nt-games" aria-label={`Jogos ${nationalTeamWithPreposition(page.team.id)}, ${competition.name}`}>
          {competition.matches.map((match) => (
            <li key={match.id}>
              <span className="nt-gd">{formatDayMonth(match.date)}</span>
              <span className={match.homeId === page.team.id ? "own" : undefined}>{match.home}</span>
              <b>{scoreOf(match) ?? "×"}</b>
              <span className={match.awayId === page.team.id ? "own" : undefined}>{match.away}</span>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <button type="button" className="btn sm flat nt-more" aria-expanded={isAll} onClick={() => setAll(!isAll)}>
          {isAll ? "Só o grupo da seleção" : `Ver os outros ${others.length} grupos`}
        </button>
      )}
      {competition.knockout.length > 0 && (
        <div className="nt-ko">
          {competition.knockout.map((round) => (
            <div key={round.round} className="nt-round">
              <span className="lbl">{ROUND_NAMES[round.round] ?? round.round}</span>
              <ul>
                {round.matches.map((match) => (
                  <li key={match.id} className={match.homeId === page.team.id || match.awayId === page.team.id ? "own" : undefined}>
                    <OpenMatch row={match} onOpen={onOpen} className="nt-open" />
                    <span>{match.home}</span>
                    <b>{scoreOf(match) ?? formatDayMonth(match.date)}</b>
                    <span>{match.away}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function NationalTeam() {
  const { engine, game } = useServices();
  const matchFile = useMatchFile();
  const [teamId, setTeamId] = useState<string | undefined>(undefined);
  const [page, setPage] = useState<NationalTeamPage | null>(null);
  const [state, setState] = useState<NationalState | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "none" | "failed">("loading");
  const [tab, setTab] = useState<Tab>("callUp");
  /** The coach's call-up as he edits it, until he confirms it; null while he hasn't touched it. */
  const [draft, setDraft] = useState<string[] | null>(null);
  const [openSlot, setOpenSlot] = useState<Role | null>(null);
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    Promise.all([engine.nationalTeam(teamId), engine.read(KEYS)]).then(
      ([national, read]) => {
        if (!current) return;
        setPage(national);
        setState(read);
        setDraft(null);
        setPhase(national ? "ready" : "none");
      },
      () => current && setPhase("failed"),
    );
    return () => {
      current = false;
    };
  }, [engine, teamId, version]);

  async function run(command: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await command();
      setVersion((v) => v + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  const options = useMemo(() => (page?.teams ?? []).map((t) => ({ value: t.id, label: t.name })), [page?.teams]);

  if (phase === "failed") return <p className="status error">Nenhum jogo aberto.</p>;
  if (phase === "none") {
    return (
      <>
        <h1 className="screen-title">Seleção</h1>
        <p className="status">Este jogo foi criado sem as seleções.</p>
      </>
    );
  }
  if (!page || !state) return <p className="status">Abrindo a seleção…</p>;

  const club = state.coachClubId ? state.clubs[state.coachClubId] : undefined;
  // "o Flamengo", "da Chapecoense": the club with the article the press gives it.
  const theClub = club ? (preposition?: "de") => withArticle(club.shortName, clubArticle(club.id), preposition) : null;
  const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  const { team, window, callUp, leaving, coaching, offer } = page;
  // The coach picks his own list between windows; a call-up under way is his national coach's to keep.
  const isEditing = coaching !== null && callUp.isProvisional;
  const cards = new Map([...callUp.groups.flatMap((g) => g.players), ...(coaching?.pool ?? [])].map((card) => [card.ref, card]));
  const shown = draft ?? callUp.groups.flatMap((g) => g.players.map((p) => p.ref));
  const groups = callUp.groups.map((group) => ({ ...group, players: shown.flatMap((ref) => cards.get(ref) ?? []).filter((p) => p.role === group.role).sort((a, b) => b.strength - a.strength) }));
  const count = groups.reduce((sum, g) => sum + g.players.length, 0);
  // Open places by position, never more in all than the list has left: a position past its places takes from the others.
  let left = Math.max(0, callUp.size - count);
  const openPlaces = groups.map((g) => {
    const open = Math.min(left, Math.max(0, g.places - g.players.length));
    left -= open;
    return open;
  });
  const edit = (next: string[]) => {
    setDraft(next);
    setOpenSlot(null);
  };
  let number = 0;
  const windowTitle = window?.tournament ?? "Data Fifa";
  // The national coaches call up on the eve of a window (nationsDay).
  const deadline = window ? formatDayMonth(addDays(window.from, -1)) : null;
  const callUpNote = isEditing
    ? `Sua lista para ${window?.tournament ? `a ${window.tournament}` : `a data Fifa${window ? ` de ${spanLabel(window.from, window.until)}` : ""}`}`
    : callUp.isProvisional
    ? `Prévia: a lista sai em ${deadline ?? "breve"}, véspera da data Fifa`
    : (window?.tournament ?? (window ? `Data Fifa de ${spanLabel(window.from, window.until)}` : ""));

  return (
    <div className="nt">
      <aside className="nt-side" aria-label="Seleção">
        {offer && (
          <section className="stk nt-offer" aria-label={`Proposta: ${offer.team}`}>
            <span className="lbl">Proposta</span>
            <p>
              A federação quer você no comando: <b>{offer.team}</b>, junto com {theClub ? theClub() : "o seu trabalho"}. Responda até {formatDayMonth(offer.expiresOn)}.
            </p>
            <div className="nt-offer-go">
              <button type="button" className="btn go sm" disabled={isBusy} onClick={() => void run(() => engine.apply({ type: "acceptNationalJob" }).then(() => setTeamId(offer.teamId)))}>
                Aceitar
              </button>
              <button type="button" className="btn sm" disabled={isBusy} onClick={() => void run(() => engine.apply({ type: "declineNationalJob" }))}>
                Recusar
              </button>
            </div>
          </section>
        )}
        <div className="stk nt-card">
          <NationalCrest teamId={team.id} code={team.code} colours={team.colours} size={52} label={team.name} />
          <div>
            <h1>{team.name}</h1>
            <p>
              {page.coach ? (
                <>
                  Técnico <b>{game.current?.coachName ?? "você"}</b>
                  <br />
                  desde {formatMonthYear(page.coach.since)}
                  {theClub ? `, junto com ${theClub()}` : ""}
                </>
              ) : (
                <>
                  {team.points.toLocaleString("pt-BR")} pontos no ranking
                  <br />
                  convocação da comissão técnica
                </>
              )}
            </p>
          </div>
          <div className="nt-rk" aria-label={`${team.rank}º no ranking da Fifa`}>
            <b>{team.rank}º</b>
            <small>Fifa</small>
          </div>
        </div>

        <section className="stk nt-box" aria-label={windowTitle}>
          <h2>
            <span>{windowTitle}</span> <small>{window ? spanLabel(window.from, window.until) : "sem data marcada"}</small>
          </h2>
          {page.fixtures.length ? (
            <ul className="nt-fixtures">
              {page.fixtures.map((row) => (
                <FixtureLine key={row.id} row={row} page={page} onOpen={matchFile.open} />
              ))}
            </ul>
          ) : (
            <p className="nt-nb">Sem jogos marcados nesta data.</p>
          )}
        </section>

        {leaving && club && theClub && (
          <section className="stk nt-box" aria-label={`Saem ${theClub("de")}`}>
            <h2>
              Saem {theClub("de")} <small>{leaving.players.length === 1 ? "1 jogador" : `${leaving.players.length} jogadores`}</small>
            </h2>
            {leaving.players.length ? (
              <ul className="nt-out">
                {leaving.players.map((p) => (
                  <li key={p.id}>
                    <Crest club={club} size={24} />
                    <div>
                      <b>{p.name}</b>
                      <small>
                        {ROLE_ONE[p.role]} · {p.age} anos · {p.team}
                      </small>
                    </div>
                    <span className="nt-f">{p.strength}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="nt-nb">
              {leaving.isProvisional && leaving.players.length > 0 ? "Prévia pelas listas prováveis. " : ""}
              {leaving.players.length === 0
                ? leaving.isProvisional
                  ? `Ninguém ${theClub("de")} deve ser convocado na próxima data Fifa.`
                  : `Ninguém ${theClub("de")} está com uma seleção agora.`
                : leaving.clubMatches === 0
                  ? `${capitalized(theClub())} não joga enquanto eles estão fora.`
                  : `${capitalized(theClub())} joga ${leaving.clubMatches === 1 ? "1 vez" : `${leaving.clubMatches} vezes`} sem eles, até ${formatDayMonth(leaving.players.reduce((last, p) => (p.until > last ? p.until : last), ""))}.`}
            </p>
          </section>
        )}
        {isEditing && (
          <div className="nt-go">
            <button type="button" className="btn go nt-confirm" disabled={isBusy || draft === null} onClick={() => draft && void run(() => engine.apply({ type: "setCallUp", refs: draft }))}>
              <i className="ph-bold ph-check-fat" aria-hidden="true" />
              Confirmar convocação
            </button>
            <p>{error ?? (coaching?.isOwnPick && draft === null ? "Lista confirmada. " : "") + (deadline ? `Prazo: ${deadline}, véspera da data Fifa` : "")}</p>
          </div>
        )}
      </aside>

      <section className="page nt-alb" aria-labelledby="nt-title">
        <header className="nt-hd">
          <h2 id="nt-title" className="sr-only">
            {TABS.find((t) => t.id === tab)?.label}
          </h2>
          <div className="seg nt-tabs" role="tablist" aria-label="Seções da seleção">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : undefined} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <span className="nt-note">{tab === "callUp" ? callUpNote : tab === "ranking" ? `Começa no ranking da Fifa de ${formatDayMonth(page.ranking.date)} ${page.ranking.date.slice(0, 4)} e muda jogo a jogo` : page.competitions.length === 1 ? "1 competição" : `${page.competitions.length} competições`}</span>
          {tab === "callUp" && (
            <span className="nt-cnt">
              {count} <em>de {callUp.size}</em>
            </span>
          )}
          <Select label="Seleção" value={team.id} options={options} onChange={(id) => setTeamId(id)} className="nt-pick" />
        </header>

        {tab === "callUp" && (
          <div className="nt-callup" role="tabpanel" aria-label="Convocação" key={`${team.id}-${callUp.isProvisional}`}>
            {groups.map((group, groupIndex) => (
              <div className="nt-grp" key={group.role} role="group" aria-label={ROLE_GROUPS[group.role]}>
                <div className="nt-gl">
                  {ROLE_GROUPS[group.role]} <small>{group.players.length} de {group.places}</small>
                </div>
                <ul className="nt-row">
                  {group.players.map((player) => {
                    number++;
                    return <Sticker key={player.ref} player={player} number={number} colours={team.colours} index={number} {...(isEditing ? { onDrop: () => edit(shown.filter((ref) => ref !== player.ref)) } : {})} />;
                  })}
                  {Array.from({ length: openPlaces[groupIndex] ?? 0 }, (_, i) => {
                    number++;
                    const vacancy = `Vaga ${String(number).padStart(2, "0")}`;
                    return isEditing && count < callUp.size ? (
                      <li key={`slot-${i}`} className="nt-sl-li">
                        <button type="button" className="slot nt-sl" aria-expanded={openSlot === group.role && i === 0} onClick={() => setOpenSlot(openSlot === group.role ? null : group.role)}>
                          <i className="ph-bold ph-plus" aria-hidden="true" />
                          {vacancy}
                        </button>
                        {openSlot === group.role && i === 0 && (
                          <ul className={["stk nt-pool", groupIndex >= groups.length - 2 ? "up" : "", group.players.length + i >= ROW_HALF ? "end" : ""].filter(Boolean).join(" ")} aria-label={`Chamar para ${ROLE_GROUPS[group.role].toLowerCase()}`}>
                            {(coaching?.pool ?? []).filter((p) => p.role === group.role && !shown.includes(p.ref)).slice(0, 8).map((p) => (
                              <li key={p.ref}>
                                <button type="button" onClick={() => edit([...shown, p.ref])}>
                                  <b>{p.name}</b>
                                  <small>{p.club}</small>
                                  <span>{p.strength}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ) : (
                      <li key={`slot-${i}`} className="slot nt-sl" aria-label={`${vacancy} em aberto`}>
                        <i className="ph-bold ph-plus" aria-hidden="true" />
                        {vacancy}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        {tab === "tables" && (
          <div className="nt-tables" role="tabpanel" aria-label="Jogos e tabelas">
            {page.competitions.length ? page.competitions.map((c) => <CompetitionTables key={c.id} competition={c} page={page} onOpen={matchFile.open} />) : <p className="nt-empty">{team.name} não está em nenhuma competição agora: joga amistosos nas datas Fifa.</p>}
            {team.qualifiesByRanking && <p className="nt-empty">As eliminatórias da {team.confederation} não estão no jogo: as vagas dela na Copa do Mundo vão para as seleções mais bem colocadas no ranking da Fifa.</p>}
            {page.titles.length > 0 && (
              <section className="nt-comp" aria-label="Campeões">
                <h3>Campeões</h3>
                <ul className="nt-titles">
                  {page.titles.map((t) => (
                    <li key={`${t.name}-${t.season}`}>
                      <span>{t.name}</span>
                      <b>{t.winner}</b>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {tab === "ranking" && (
          <div className="nt-ranking" role="tabpanel" aria-label="Ranking Fifa">
            <ol>
              {page.ranking.rows.map((row, i) => {
                const looks = row.teamId ? page.teams.find((t) => t.id === row.teamId) : undefined;
                const gap = i > 0 && row.rank - (page.ranking.rows[i - 1]?.rank ?? row.rank) > 1;
                return (
                  <li key={`${row.rank}-${row.name}`} className={[row.teamId === team.id ? "own" : "", gap ? "gap" : ""].filter(Boolean).join(" ") || undefined}>
                    <span className="nt-rank">{row.rank}º</span>
                    {looks ? <NationalCrest teamId={looks.id} code={looks.code} colours={looks.colours} size={20} label={looks.name} /> : <span className="nt-nocrest" aria-hidden="true" />}
                    <span className="nt-rn">{row.name}</span>
                    <b>{row.points.toLocaleString("pt-BR")}</b>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>
      {matchFile.file}
    </div>
  );
}
