import { useMemo, useState } from "react";
import type { Club } from "@boleiro/data/clubs";
import {
  freeFriendlyDates,
  friendlyAnswer,
  friendlyOffers,
  type BookingState,
  type Friendly,
  type FriendlyAnswer,
  type FriendlyRefusal,
} from "@boleiro/engine/sim/friendlies/friendlies";
import type { GameState, IsoDate } from "@boleiro/engine/sim/gameState";
import { formatBarDate, formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import { Crest } from "../clubs/Crest.js";

export type FriendlyState = BookingState & Pick<GameState, "seed">;

const REFUSALS: Record<FriendlyRefusal, string> = {
  date: "o clube já joga perto dessa data",
  busy: "o adversário já joga perto dessa data",
  opponent: "esse clube não marca amistoso",
  cash: "o mandante não tem caixa para o cachê",
  refused: "um clube tão maior não viaja para esse estádio",
};

const DIVISIONS = ["A", "B", "C", "D"] as const;

type Props = {
  state: FriendlyState;
  isBusy: boolean;
  /** Books the friendly; null when the game refused the command, which the screen shows. */
  onBook: (opponentId: string, date: IsoDate, isHome: boolean) => Promise<FriendlyAnswer | null>;
};

/** The coach's friendlies: clubs' invitations, a friendly he books himself, and those booked and played. */
export function FriendliesCard({ state, isBusy, onBook }: Props) {
  const clubId = state.coachClubId ?? "";
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  const [isOpen, setOpen] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const offers = useMemo(() => friendlyOffers(state).filter((offer) => !dismissed.includes(`${offer.hostId}:${offer.date}`)), [state, dismissed]);
  const own = (state.friendlies ?? []).filter((f) => f.homeId === clubId || f.awayId === clubId);

  async function book(opponentId: string, date: IsoDate, isHome: boolean) {
    setRefusal(null);
    const answer = await onBook(opponentId, date, isHome);
    if (!answer) return;
    if (answer.booked) setOpen(false);
    else setRefusal(`Amistoso recusado: ${REFUSALS[answer.reason]}.`);
  }

  return (
    <section className="fin-friendlies" aria-label="Amistosos">
      {offers.map((offer) => {
        const host = state.clubs[offer.hostId];
        if (!host) return null;
        return (
          <div key={`${offer.hostId}:${offer.date}`} className="of hi">
            <div className="t">
              <Crest club={host} size={34} />
              <div>
                <b>Amistoso no {host.shortName}</b>
                <small>
                  {host.stadium} · {formatBarDate(offer.date)}
                </small>
              </div>
              <span className="v">
                {formatMoney(offer.fee)}
                <small>cachê</small>
              </span>
            </div>
            <div className="bs">
              <button className="btn go" disabled={isBusy} onClick={() => void book(offer.hostId, offer.date, false)}>
                <i className="ph-bold ph-airplane-takeoff" aria-hidden="true" />
                Aceitar amistoso
              </button>
              <button className="btn flat" onClick={() => setDismissed([...dismissed, `${offer.hostId}:${offer.date}`])}>
                Recusar
              </button>
            </div>
          </div>
        );
      })}

      {isOpen ? (
        <BookingForm state={state} isBusy={isBusy} onBook={book} onClose={() => setOpen(false)} />
      ) : (
        <button className="btn sm fin-book" onClick={() => setOpen(true)}>
          <i className="ph-bold ph-soccer-ball" aria-hidden="true" />
          Marcar amistoso
        </button>
      )}
      {refusal && (
        <p className="fin-refusal" role="status">
          {refusal}
        </p>
      )}

      {own.length > 0 && <BookedList friendlies={own} clubId={clubId} clubs={state.clubs} />}
    </section>
  );
}

function BookingForm({ state, isBusy, onBook, onClose }: { state: FriendlyState; isBusy: boolean; onBook: (opponentId: string, date: IsoDate, isHome: boolean) => Promise<void>; onClose: () => void }) {
  const clubId = state.coachClubId ?? "";
  const rivals = useMemo(
    () => DIVISIONS.map((division) => ({ division, clubs: Object.values(state.clubs).filter((c) => c.division === division && c.id !== clubId).sort((a, b) => a.shortName.localeCompare(b.shortName, "pt-BR")) })),
    [state.clubs, clubId],
  );
  const [opponentId, setOpponentId] = useState(() => rivals[0]?.clubs[0]?.id ?? "");
  const [isHome, setHome] = useState(true);
  const dates = useMemo(() => freeFriendlyDates(state).filter((date) => friendlyAnswer(state, opponentId, date, isHome).booked), [state, opponentId, isHome]);
  const [chosen, setChosen] = useState<IsoDate | null>(null);
  const date = chosen && dates.includes(chosen) ? chosen : (dates[0] ?? null);
  const answer = date ? friendlyAnswer(state, opponentId, date, isHome) : null;
  const opponent = state.clubs[opponentId];

  return (
    <div className="fin-book-form">
      <label className="fin-field">
        <span className="lbl">Adversário</span>
        <select value={opponentId} onChange={(event) => setOpponentId(event.target.value)} aria-label="Adversário">
          {rivals.map(({ division, clubs }) => (
            <optgroup key={division} label={`Série ${division}`}>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.shortName}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="fin-book-row">
        <div className="seg" role="radiogroup" aria-label="Mando">
          {[true, false].map((home) => (
            <span key={String(home)} role="radio" aria-checked={isHome === home} tabIndex={0} className={isHome === home ? "on" : undefined} onClick={() => setHome(home)} onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && setHome(home)}>
              {home ? "Em casa" : "Fora"}
            </span>
          ))}
        </div>
        <label className="fin-field">
          <span className="lbl">Data</span>
          <select value={date ?? ""} onChange={(event) => setChosen(event.target.value)} aria-label="Data" disabled={!dates.length}>
            {dates.map((d) => (
              <option key={d} value={d}>
                {formatBarDate(d)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>
        {!answer?.booked || !opponent
          ? "Nenhuma data livre para os dois nos próximos dois meses."
          : isHome
            ? `Você paga ${formatMoney(answer.friendly.fee)} de cachê ao ${opponent.shortName} e fica com a bilheteria.`
            : `O ${opponent.shortName} paga ${formatMoney(answer.friendly.fee)} de cachê e fica com a bilheteria.`}
      </p>
      <div className="bs">
        <button className="btn go" disabled={isBusy || !answer?.booked || !date} onClick={() => date && void onBook(opponentId, date, isHome)}>
          Marcar
        </button>
        <button className="btn flat" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}

function BookedList({ friendlies, clubId, clubs }: { friendlies: readonly Friendly[]; clubId: string; clubs: Record<string, Club> }) {
  return (
    <ul className="fin-booked" aria-label="Amistosos marcados">
      {friendlies.toSorted((a, b) => a.date.localeCompare(b.date)).map((friendly) => {
        const isHome = friendly.homeId === clubId;
        const other = clubs[isHome ? friendly.awayId : friendly.homeId];
        const { result } = friendly;
        return (
          <li key={friendly.id} className={result ? "played" : undefined}>
            <span className="fin-booked-date">{formatDayMonth(friendly.date)}</span>
            <span className="fin-booked-who">
              {result ? `${clubs[friendly.homeId]?.shortName ?? ""} ${result.homeGoals} x ${result.awayGoals} ${clubs[friendly.awayId]?.shortName ?? ""}` : `${other?.shortName ?? ""} · ${isHome ? "em casa" : "fora"}`}
            </span>
            <span className={isHome ? "fin-booked-fee out" : "fin-booked-fee in"}>
              {isHome ? "−" : "+"}
              {formatMoney(friendly.fee)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
