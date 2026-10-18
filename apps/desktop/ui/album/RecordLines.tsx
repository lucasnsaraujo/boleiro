import type { Club } from "@boleiro/data/clubs";
import type { ClubRecords, CrowdMark, GoalsMark, MatchMark, RunMark, ScorerMark, TransferMark } from "@boleiro/engine/sim/history/history";
import { competitionKeyName } from "@boleiro/game-client/format/competitionName";
import { formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";

type Clubs = Readonly<Record<string, Club>>;
export type RecordText = { main: string; detail: string } | null;

const nameOf = (clubs: Clubs, id: string) => clubs[id]?.shortName ?? id;

export function matchText(mark: MatchMark | null | undefined, clubs: Clubs): RecordText {
  if (!mark) return null;
  return { main: `${mark.goalsFor} x ${mark.goalsAgainst} ${nameOf(clubs, mark.opponentId)}`, detail: `${competitionKeyName(mark.competition)} ${mark.season}` };
}

function crowdText(mark: CrowdMark | null | undefined, clubs: Clubs): RecordText {
  if (!mark) return null;
  return { main: mark.crowd.toLocaleString("pt-BR"), detail: `x ${nameOf(clubs, mark.opponentId)}, ${competitionKeyName(mark.competition)} ${mark.season}` };
}

function transferText(mark: TransferMark | null | undefined, clubs: Clubs, preposition: "para" | "de"): RecordText {
  if (!mark) return null;
  const other = mark.otherClubId ? nameOf(clubs, mark.otherClubId) : preposition === "para" ? "o exterior" : "fora";
  return { main: formatMoney(mark.fee), detail: `${mark.name}, ${preposition} ${other}` };
}

function goalsText(mark: GoalsMark | null | undefined): RecordText {
  return mark ? { main: `${mark.name}, ${mark.goals} gols`, detail: `${mark.season}` } : null;
}

function runText(mark: RunMark | null | undefined): RecordText {
  return mark ? { main: `${mark.games} jogos`, detail: `de ${formatDayMonth(mark.from)} a ${formatDayMonth(mark.until)} ${mark.until.slice(0, 4)}` } : null;
}

function scorerText(mark: ScorerMark | null | undefined, clubs: Clubs): RecordText {
  return mark ? { main: `${mark.name}, ${mark.age} anos`, detail: `x ${nameOf(clubs, mark.opponentId)}, ${mark.season}` } : null;
}

/** A record's line; a record match still on this season's calendar opens its ficha. */
export function RecordLine({ term, mark, matchRef = null, onOpen }: { term: string; mark: RecordText; matchRef?: string | null; onOpen?: (matchRef: string) => void }) {
  const main = mark ? mark.main : "–";
  return (
    <div>
      <dt>{term}</dt>
      <dd>
        {matchRef && onOpen ? (
          <button type="button" className="history-record-open" aria-label={`${term}: ${main}, ficha do jogo`} onClick={() => onOpen(matchRef)}>
            {main}
          </button>
        ) : (
          main
        )}
        {mark && <small>{mark.detail}</small>}
      </dd>
    </div>
  );
}

/** A club's records past its biggest win and loss: the crowd, the transfers and the league marks. */
export function MoreRecords({ records, clubs }: { records: ClubRecords; clubs: Clubs }) {
  return (
    <>
      <RecordLine term="Maior público" mark={crowdText(records.biggestCrowd, clubs)} />
      <RecordLine term="Maior venda" mark={transferText(records.recordSale, clubs, "para")} />
      <RecordLine term="Maior contratação" mark={transferText(records.recordSigning, clubs, "de")} />
      {records.mostSeasonGoals && <RecordLine term="Mais gols numa temporada" mark={goalsText(records.mostSeasonGoals)} />}
      {records.longestUnbeaten && <RecordLine term="Maior invencibilidade" mark={runText(records.longestUnbeaten)} />}
      {records.youngestScorer && <RecordLine term="Artilheiro mais jovem" mark={scorerText(records.youngestScorer, clubs)} />}
    </>
  );
}
