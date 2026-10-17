import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { GameState } from "@boleiro/engine/sim/gameState";
import type { MatchMark } from "@boleiro/engine/sim/history/history";
import type { Album, AlbumSeason, TitlePage as Title } from "@boleiro/game-client/album/albumOf";
import { useServices } from "../app/ServicesContext.js";
import { CareerRecords } from "../album/CareerRecords.js";
import { matchText, MoreRecords, RecordLine } from "../album/RecordLines.js";
import { SeasonBook } from "../album/SeasonBook.js";
import { TitlePage } from "../album/TitlePage.js";
import { TitlePlate } from "../album/TitlePlate.js";
import { TrophyRoom } from "../album/TrophyRoom.js";
import { plateColours } from "../clubs/clubCatalog.js";
import { Crest } from "../clubs/Crest.js";
import { competitionKeyName } from "@boleiro/game-client/format/competitionName";
import { formatMonthYear } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import { championRoll, clubPast, coachCareer, rollKeys, scorerRoll, type CareerStint, type ClubPast } from "../history/historySelectors.js";
import { playRoundLabel, usePlayRound } from "../hub/usePlayRound.js";
import { useMatchFile } from "../matchPage/MatchFile.js";
import { EggAlbumPanel } from "../eggs/EggAlbumPanel.js";
import { EggStickerCard } from "../eggs/EggStickerCard.js";
import "../album/album.css";
import "./history.css";

const HISTORY_KEYS = ["season", "coachClubId", "clubs", "history", "coach", "fixtures"] as const;
type HistoryState = Pick<GameState, (typeof HISTORY_KEYS)[number]>;

const TABS = [
  { id: "clube", title: "Clube" },
  { id: "titulos", title: "Títulos" },
  { id: "recordes", title: "Recordes" },
  { id: "campeoes", title: "Campeões" },
  { id: "artilheiros", title: "Artilheiros" },
  { id: "carreira", title: "Carreira" },
  { id: "raridades", title: "Raridades" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const IDOLS_SHOWN = 4;

const isTabId = (value: string | null): value is TabId => TABS.some((tab) => tab.id === value);
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The career's history as its album: each club's seasons as sticker pages, the title pages, the
 * records, then the champions and top scorers of every year, the coach's career and the rare stickers.
 * In a hot-seat game each coach opens his own album.
 */
export function History() {
  const { engine, game } = useServices();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState<HistoryState | null>(null);
  const [album, setAlbum] = useState<Album | null>(null);
  const [seat, setSeat] = useState(0);
  const [failed, setFailed] = useState(false);
  const [pickedTab, setPickedTab] = useState<TabId | null>(null);
  const [pickedClubId, setPickedClubId] = useState<string | null>(null);
  const [openTitle, setOpenTitle] = useState<Title | null>(null);
  const matchFile = useMatchFile();
  const round = usePlayRound(() => navigate("/hub"));

  useEffect(() => {
    let current = true;
    Promise.all([engine.read(HISTORY_KEYS), engine.album(seat)]).then(
      ([read, pages]) => {
        if (!current) return;
        setState(read);
        setAlbum(pages);
      },
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine, seat]);

  const keys = useMemo(() => (state ? rollKeys(state.clubs, state.coachClubId) : []), [state]);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state || !album) return <p className="status">Abrindo a história…</p>;

  const isSeated = album.shown === 0;
  const coachName = album.coachName || game.current?.coachName || "Técnico";
  const clubId = pickedClubId ?? (isSeated ? state.coachClubId : null) ?? album.seasons[0]?.clubId ?? state.history.coach.stints.at(-1)?.clubId ?? null;
  // The rarities stay out of sight until the career finds its first one; another coach's album has no career page here.
  const tabs = TABS.filter((tab) => (tab.id !== "clube" || clubId) && (tab.id !== "raridades" || album.eggs.found.length) && (tab.id !== "carreira" || isSeated));
  const asked = params.get("aba");
  const wanted = pickedTab ?? (isTabId(asked) ? asked : "clube");
  const shown = tabs.find((tab) => tab.id === wanted) ?? tabs[0];

  function openClub(id: string) {
    setPickedClubId(id);
    setPickedTab("clube");
  }

  function openSeat(index: number) {
    setSeat(index);
    setPickedClubId(null);
  }

  return (
    <div className="history">
      <header className="history-head">
        <h1 className="screen-title">História</h1>
        <div className="history-tabs" role="tablist" aria-label="Seções">
          {tabs.map((tab) => (
            <button key={tab.id} role="tab" aria-selected={tab.id === shown?.id} onClick={() => setPickedTab(tab.id)}>
              {tab.title}
            </button>
          ))}
        </div>
        {album.coaches.length > 1 && (
          <div className="seg history-seats" role="group" aria-label="Álbum de">
            {album.coaches.map((name, index) => (
              <button key={name} className={index === album.shown ? "on" : undefined} aria-pressed={index === album.shown} onClick={() => openSeat(index)}>
                {name}
              </button>
            ))}
          </div>
        )}
        <Link className="btn-quiet history-awards" to="/awards">
          <i className="ph-bold ph-trophy" aria-hidden="true" />
          Prêmios e recordes
        </Link>
        <button className="btn-main" onClick={() => void round.play()} disabled={round.isPlaying}>
          {playRoundLabel(round.isPlaying, state.coachClubId !== null)}
        </button>
      </header>
      {round.hasFailed && <p className="status error">A rodada não andou. Tente de novo.</p>}
      <div className="history-body" role="tabpanel" aria-label={shown?.title}>
        {shown?.id === "clube" && clubId && <ClubAlbum state={state} album={album} clubId={clubId} coachName={coachName} onPickClub={openClub} onOpenTitle={setOpenTitle} onOpenMatch={matchFile.open} />}
        {shown?.id === "titulos" && <TrophyRoom titles={album.titles} clubs={state.clubs} onOpen={setOpenTitle} />}
        {shown?.id === "recordes" && <CareerRecords records={album.records} clubs={state.clubs} coachName={coachName} />}
        {shown?.id === "campeoes" && <ChampionsPanel state={state} keys={keys} onOpenClub={openClub} />}
        {shown?.id === "artilheiros" && <ScorersPanel state={state} keys={keys} />}
        {shown?.id === "carreira" && <CareerPanel state={state} coachName={game.current?.coachName ?? "Técnico"} />}
        {shown?.id === "raridades" && <EggAlbumPanel album={album.eggs} />}
      </div>
      {openTitle && (
        <TitlePage
          title={openTitle}
          clubs={state.clubs}
          onClose={() => setOpenTitle(null)}
          onOpenMatch={(ref) => {
            setOpenTitle(null);
            matchFile.open(ref);
          }}
        />
      )}
      {matchFile.file}
    </div>
  );
}

/** The fixture of a record match, while its season's games are still kept: this season's only. */
function recordFixtureId(state: HistoryState, clubId: string, mark: MatchMark | null): string | null {
  if (!mark || mark.season !== state.season) return null;
  const [homeId, awayId] = mark.home ? [clubId, mark.opponentId] : [mark.opponentId, clubId];
  return state.fixtures.find((f) => f.result && f.date === mark.date && f.homeId === homeId && f.awayId === awayId)?.id ?? null;
}

type ClubAlbumProps = {
  state: HistoryState;
  album: Album;
  clubId: string;
  coachName: string;
  onPickClub: (clubId: string) => void;
  onOpenTitle: (title: Title) => void;
  onOpenMatch: (ref: string) => void;
};

/** The club in the album: the coach's seasons there, one spread each, or for a club he never ran its titles, campaigns, idols and records. */
function ClubAlbum({ state, album, clubId, coachName, onPickClub, onOpenTitle, onOpenMatch }: ClubAlbumProps) {
  const club = state.clubs[clubId];
  const past = clubPast(state, clubId);
  const seasons = album.seasons.filter((season) => season.clubId === clubId);
  const ranClubs = [...new Set(album.seasons.map((season) => season.clubId))];
  if (!club) return null;
  const right = (season: AlbumSeason | null) => (
    <ClubPage
      state={state}
      clubId={clubId}
      past={past}
      titles={album.titles.filter((t) => season?.titleIds.includes(t.id))}
      eggs={season ? album.eggs.found.filter((egg) => egg.date.startsWith(String(season.season))) : []}
      season={season?.season ?? null}
      onOpenTitle={onOpenTitle}
      onOpenMatch={onOpenMatch}
    />
  );
  const switcher = ranClubs.length > 1 && (
    <nav className="ab-clubs" aria-label="Seus clubes">
      {ranClubs.map((id) => {
        const ran = state.clubs[id];
        return (
          ran && (
            <button key={id} aria-current={id === clubId ? "page" : undefined} onClick={() => onPickClub(id)}>
              <Crest club={ran} size={22} />
              {ran.shortName}
            </button>
          )
        );
      })}
    </nav>
  );
  if (seasons.length) {
    return (
      <>
        {switcher}
        <SeasonBook key={`${album.shown}-${clubId}`} clubId={clubId} seasons={seasons} clubs={state.clubs} coachName={coachName}>
          {right}
        </SeasonBook>
      </>
    );
  }
  const titleCount = past.titles.reduce((sum, t) => sum + t.seasons.length, 0);
  const colours = plateColours(club.colours);
  return (
    <div className="ab-book" style={{ "--c": colours.background, "--ic": colours.text } as CSSProperties}>
      <div className="ab-spread">
        <section className="ab-page is-left" aria-labelledby="ab-club-name">
          <header className="ab-ph">
            <Crest club={club} size={56} />
            <div className="ab-ph-text">
              <h2 id="ab-club-name">{club.shortName}</h2>
              <p>{titleCount === 1 ? "1 título no jogo" : `${titleCount} títulos no jogo`}</p>
            </div>
          </header>
          <ClubTitles state={state} past={past} />
          <section aria-labelledby="history-finishes-title">
            <h3 id="history-finishes-title" className="ab-sec">
              Campanhas
            </h3>
            {past.finishes.length === 0 ? (
              <p className="history-empty">A primeira temporada ainda não terminou.</p>
            ) : (
              <ul className="history-list" aria-labelledby="history-finishes-title">
                {past.finishes.map((finish) => (
                  <li key={finish.season} className="history-line">
                    <span className="history-line-main">{finish.season}</span>
                    <span className="history-line-side">
                      Série {finish.division} · <b>{finish.position}º</b>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
        <section className="ab-page is-right" aria-label={`Ídolos e recordes: ${club.shortName}`}>
          {right(null)}
        </section>
      </div>
    </div>
  );
}

function ClubTitles({ state, past }: { state: HistoryState; past: ClubPast }) {
  return (
    <section aria-labelledby="history-titles-title">
      <h3 id="history-titles-title" className="ab-sec">
        Títulos do clube
      </h3>
      {past.titles.length === 0 ? (
        <p className="history-empty">Nenhum título desde {state.history.seasons[0]?.season ?? state.season}.</p>
      ) : (
        <ul className="history-list" aria-labelledby="history-titles-title">
          {past.titles.map((title) => (
            <li key={title.key} className="history-line">
              <span className="history-line-main">
                <b className="history-times">{title.seasons.length}x</b> {competitionKeyName(title.key)}
              </span>
              <span className="history-line-side">{title.seasons.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type ClubPageProps = {
  state: HistoryState;
  clubId: string;
  past: ClubPast;
  titles: readonly Title[];
  eggs: Album["eggs"]["found"];
  season: number | null;
  onOpenTitle: (title: Title) => void;
  onOpenMatch: (ref: string) => void;
};

/** The right page: the season's titles and rare stickers, then the club's idols, records and titles. */
function ClubPage({ state, clubId, past, titles, eggs, season, onOpenTitle, onOpenMatch }: ClubPageProps) {
  const club = state.clubs[clubId];
  const records = past.records;
  return (
    <>
      {season !== null && titles.length > 0 && (
        <section aria-labelledby="ab-season-titles">
          <h3 id="ab-season-titles" className="ab-sec">
            Títulos de {season} <span>páginas especiais</span>
          </h3>
          <ul className="ab-plates">
            {titles.map((title, i) => (
              <li key={title.id}>
                <TitlePlate title={title} clubs={state.clubs} order={i} onOpen={onOpenTitle} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {season !== null && eggs.length > 0 && (
        <section aria-labelledby="ab-season-eggs">
          <h3 id="ab-season-eggs" className="ab-sec">
            Raras de {season} <span>achadas nesta temporada</span>
          </h3>
          <ul className="ab-eggs">
            {eggs.map((egg) => (
              <li key={egg.eggId} title={egg.headline}>
                <EggStickerCard sticker={egg} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="history-idols-title">
        <h3 id="history-idols-title" className="ab-sec">
          Ídolos <span>brilham para sempre no álbum</span>
        </h3>
        {past.idols.length === 0 ? (
          <p className="history-empty">Nenhum ídolo ainda.</p>
        ) : (
          <ol className="ab-idols" aria-labelledby="history-idols-title">
            {past.idols.slice(0, IDOLS_SHOWN).map((idol, i) => (
              <li key={idol.playerId} className="ab-idol" style={{ "--i": i } as CSSProperties}>
                <span className="ab-idol-art" aria-hidden="true">
                  <b>{idol.name.trim().charAt(0).toUpperCase()}</b>
                </span>
                <span className="ab-idol-name">{idol.name}</span>
                <span className="ab-idol-sub">
                  {plural(idol.apps, "jogo", "jogos")} · {plural(idol.goals, "gol", "gols")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section aria-labelledby="history-records-title">
        <h3 id="history-records-title" className="ab-sec">
          Recordes
        </h3>
        <dl className="history-records">
          <RecordLine term="Maior vitória" mark={matchText(records.biggestWin, state.clubs)} matchRef={recordFixtureId(state, clubId, records.biggestWin)} onOpen={onOpenMatch} />
          <RecordLine term="Maior derrota" mark={matchText(records.biggestLoss, state.clubs)} matchRef={recordFixtureId(state, clubId, records.biggestLoss)} onOpen={onOpenMatch} />
          <MoreRecords records={records} clubs={state.clubs} />
        </dl>
      </section>
      {season !== null && club && <ClubTitles state={state} past={past} />}
    </>
  );
}

function ChampionsPanel({ state, keys, onOpenClub }: { state: HistoryState; keys: readonly string[]; onOpenClub: (id: string) => void }) {
  const rows = championRoll(state.history, keys);
  if (rows.length === 0) return <p className="history-empty">Nenhum título decidido ainda.</p>;
  return (
    <table className="history-roll" aria-label="Campeões">
      <RollHead keys={keys} />
      <tbody>
        {rows.map((row) => (
          <tr key={row.season}>
            <th scope="row">
              {row.season}
              {row.isCurrent && <small>em andamento</small>}
            </th>
            {row.champions.map((championId, i) => {
              const champion = championId ? state.clubs[championId] : undefined;
              return (
                <td key={keys[i]}>
                  {champion ? (
                    <button className={championId === state.coachClubId ? "history-cell is-mine" : "history-cell"} onClick={() => onOpenClub(champion.id)}>
                      <Crest club={champion} size={20} />
                      <span>{champion.shortName}</span>
                    </button>
                  ) : (
                    <span className="history-none">–</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ScorersPanel({ state, keys }: { state: HistoryState; keys: readonly string[] }) {
  const rows = scorerRoll(state.history, keys);
  if (rows.length === 0) return <p className="history-empty">A primeira temporada ainda não terminou.</p>;
  return (
    <table className="history-roll" aria-label="Artilheiros">
      <RollHead keys={keys} />
      <tbody>
        {rows.map((row) => (
          <tr key={row.season}>
            <th scope="row">{row.season}</th>
            {row.scorers.map((scorer, i) => {
              const club = scorer ? state.clubs[scorer.clubId] : undefined;
              return (
                <td key={keys[i]}>
                  {scorer ? (
                    <span className={scorer.clubId === state.coachClubId ? "history-cell is-mine" : "history-cell"}>
                      {club && <Crest club={club} size={20} />}
                      <span>{scorer.name}</span>
                      <b className="history-goals">{scorer.goals}</b>
                    </span>
                  ) : (
                    <span className="history-none">–</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RollHead({ keys }: { keys: readonly string[] }) {
  return (
    <thead>
      <tr>
        <th scope="col">Ano</th>
        {keys.map((key) => (
          <th key={key} scope="col">
            {competitionKeyName(key)}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function exitText(stint: CareerStint): string {
  switch (stint.left) {
    case null:
      return "no cargo";
    case "fired":
      return stint.firedAt ? `demitido em ${stint.firedAt.position}º (meta ${stint.firedAt.targetPosition}º)` : "demitido";
    case "contractEnded":
      return "fim de contrato";
    case "moved":
      return "trocou de clube";
    case "resigned":
      return "pediu demissão";
  }
}

function CareerPanel({ state, coachName }: { state: HistoryState; coachName: string }) {
  const stints = coachCareer(state.history.coach);
  const { coach } = state;
  const club = state.coachClubId ? state.clubs[state.coachClubId] : undefined;
  const offers = coach.offers.length;
  return (
    <>
      <section className="history-band">
        {club && <Crest club={club} size={64} />}
        <div className="history-coach">
          <h2 className="history-band-name">{coachName}</h2>
          <p className="screen-sub">
            {club && coach.contract ? `${club.shortName} · ${formatMoney(coach.contract.salary)} por mês até ${coach.contract.untilSeason}` : "Sem clube"}
          </p>
        </div>
        <dl className="history-stats">
          <div>
            <dt>Reputação</dt>
            <dd>{coach.reputation}</dd>
          </div>
          <div>
            <dt>Títulos</dt>
            <dd>{state.history.coach.trophies.length}</dd>
          </div>
          <div>
            <dt>Demissões</dt>
            <dd>{state.history.coach.firings.length}</dd>
          </div>
        </dl>
      </section>
      {offers > 0 && (
        <p className="history-offers">
          <span>{plural(offers, "proposta", "propostas")} na mesa</span>
          <Link to="/offers" className="history-offers-link">
            Ver propostas
          </Link>
        </p>
      )}
      <section aria-labelledby="history-stints-title">
        <h3 id="history-stints-title" className="history-section-title">
          Clubes
        </h3>
        {stints.length === 0 ? (
          <p className="history-empty">Nenhum clube ainda.</p>
        ) : (
          <ul className="history-list" aria-labelledby="history-stints-title">
            {stints.map((stint) => {
              const at = state.clubs[stint.clubId];
              return (
                <li key={`${stint.clubId}-${stint.from}`} className="history-stint">
                  <span className="history-stint-club">
                    {at && <Crest club={at} size={22} />}
                    {at?.shortName ?? stint.clubId}
                  </span>
                  <span className="history-line-side">
                    {formatMonthYear(stint.from)} – {stint.until ? formatMonthYear(stint.until) : "hoje"}
                  </span>
                  <span className="history-line-side">{plural(stint.seasons, "temporada", "temporadas")}</span>
                  <span className="history-stint-titles">{stint.titles.length === 0 ? "–" : stint.titles.map(competitionKeyName).join(", ")}</span>
                  <span className={stint.left === "fired" ? "history-stint-exit is-fired" : "history-stint-exit"}>{exitText(stint)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
