import { useCallback, useEffect, useMemo, useState } from "react";
import type { Club } from "@boleiro/data/clubs";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { BETTING_FAN_COST } from "@boleiro/engine/sim/sponsors/sponsorDeals";
import { formatBarDate, formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import { SLOT_NAMES, type OfferRow, type SponsorRow, type SponsorsPage } from "@boleiro/game-client/sponsors/sponsorsPage";
import { useServices } from "../app/ServicesContext.js";
import { useCountUp } from "../finances/useCountUp.js";
import { BrandLogo } from "../sponsors/BrandLogo.js";
import { OddsSticker } from "../sponsors/OddsSticker.js";
import { Shirt, type Print, type ShirtPlace } from "../sponsors/Shirt.js";
import "./sponsors.css";

const KEYS = ["clubs", "coachClubId", "date"] as const;
type SponsorsState = Pick<GameState, (typeof KEYS)[number]>;

/** The places the shirt shows from the front; the rest are listed only. */
const SHIRT_PLACES: readonly ShirtPlace[] = ["master", "kit", "front", "sleeves"];
const isShirtPlace = (slot: string): slot is ShirtPlace => SHIRT_PLACES.some((place) => place === slot);
// The kit list shows this many deals; the smaller ones beyond fold into one line, as on the approved mock.
const LISTED = 6;
// Below this many offers the card says when more come.
const FEW_OFFERS = 3;

const BASIS_NOTE: Record<SponsorRow["basis"], string | null> = { press: null, estimate: "estimado", game: "fictício" };

const years = (count: number) => `${count} ${count === 1 ? "ano" : "anos"}`;

function offerNote(offer: OfferRow): string {
  const place = offer.replaces ? `${SLOT_NAMES[offer.slot]}, no lugar da ${offer.replaces}` : SLOT_NAMES[offer.slot];
  const bonus = offer.bonuses?.title ? " · bônus por título" : offer.bonuses?.continental ? " · bônus por vaga continental" : "";
  return `${place} · ${years(offer.years)}${bonus}`;
}

/** The prints the shirt carries: the first brand of each place it shows, with an offer previewed in its place. */
function printsOf(contracts: readonly SponsorRow[], preview: OfferRow | null): Partial<Record<ShirtPlace, Print>> {
  const prints: Partial<Record<ShirtPlace, Print>> = {};
  for (const contract of contracts) {
    if (isShirtPlace(contract.slot) && !prints[contract.slot]) prints[contract.slot] = { brandId: contract.brandId, name: contract.brandName };
  }
  if (preview && isShirtPlace(preview.slot)) prints[preview.slot] = { brandId: preview.brandId, name: preview.brandName };
  return prints;
}

export function Sponsors() {
  const { engine } = useServices();
  const [page, setPage] = useState<SponsorsPage | null>(null);
  const [state, setState] = useState<SponsorsState | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [tab, setTab] = useState<"kit" | "past">("kit");
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The deal just signed, lit up in the list for a moment. */
  const [freshSlot, setFreshSlot] = useState<string | null>(null);

  const reload = useCallback(() => Promise.all([engine.sponsors(), engine.read(KEYS)]).then(([sponsors, read]) => {
    setPage(sponsors);
    setState(read);
  }), [engine]);

  useEffect(() => {
    let current = true;
    Promise.all([engine.sponsors(), engine.read(KEYS)]).then(
      ([sponsors, read]) => {
        if (!current) return;
        setPage(sponsors);
        setState(read);
      },
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  const total = useCountUp(page?.total ?? 0, page ? `sponsors:${page.clubId}:${page.total}` : null);
  const chosen = useMemo(() => {
    if (!page) return null;
    return page.offers.find((o) => o.id === chosenId) ?? page.offers.reduce<OfferRow | null>((best, o) => (!best || o.yearly > best.yearly ? o : best), null);
  }, [page, chosenId]);

  async function run(command: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await command();
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!page || !state) {
    return state && !page ? (
      <>
        <h1 className="screen-title">Patrocínio</h1>
        <p className="status">Sem clube, sem patrocinadores.</p>
      </>
    ) : (
      <p className="status">Abrindo os patrocínios…</p>
    );
  }
  const club: Club | undefined = state.clubs[page.clubId];
  if (!club) return <p className="status">Sem clube, sem patrocinadores.</p>;

  const isPicking = !page.isBoardNegotiating;
  const decideBy = page.offers.reduce<string | null>((first, o) => (!first || o.decideBy < first ? o.decideBy : first), null);
  const listed = page.contracts.slice(0, page.contracts.length > LISTED + 1 ? LISTED : LISTED + 1);
  const folded = page.contracts.slice(listed.length);
  const betBrand = chosen?.isBetting ? { id: chosen.brandId, name: chosen.brandName } : page.bet ? { id: page.bet.brandId, name: page.bet.brandName } : null;
  const oddsMatch = page.bet ?? page.nextMatch;

  return (
    <div className="sponsors">
      <section className="page spo" aria-labelledby="spo-title">
        <header className="spo-hd">
          <div>
            <h1 id="spo-title">Patrocínio</h1>
            <p>
              Valores por ano: da <b>imprensa</b>, estimados ou fictícios · — fim não divulgado
            </p>
          </div>
          <button
            type="button"
            className="spo-board"
            role="switch"
            aria-checked={page.isBoardNegotiating}
            disabled={isBusy}
            onClick={() => void run(() => engine.apply({ type: "pickSponsors", isPicking: page.isBoardNegotiating }))}
          >
            <span className={page.isBoardNegotiating ? "sw on" : "sw"} aria-hidden="true" />
            <span>
              <b>A diretoria negocia</b>
              <small>{page.isBoardNegotiating ? "Ligado: fecha a melhor proposta no prazo" : "Desligado: você escolhe"}</small>
            </span>
          </button>
        </header>

        <div className="spo-body">
          <Shirt club={club} prints={printsOf(page.contracts, isPicking ? chosen : null)} previewing={isPicking && chosen && isShirtPlace(chosen.slot) ? chosen.slot : null} />

          <div className="spo-list">
            <div className="spo-tabs" role="tablist" aria-label="Patrocínios">
              <button role="tab" aria-selected={tab === "kit"} className={tab === "kit" ? "on" : undefined} onClick={() => setTab("kit")}>
                Na camisa hoje
              </button>
              <button role="tab" aria-selected={tab === "past"} className={tab === "past" ? "on" : undefined} onClick={() => setTab("past")}>
                Histórico
              </button>
              {tab === "kit" && <small>até</small>}
            </div>

            {tab === "kit" ? (
              <>
                <ul className="spo-rows" aria-label="Na camisa hoje">
                  {listed.map((row) => (
                    <li key={`${row.slot}:${row.brandId}`} className={freshSlot === row.slot ? "spo-row fresh" : "spo-row"}>
                      <span className="spo-mk">
                        <BrandLogo brandId={row.brandId} name={row.brandName} height={row.slot === "kit" ? 20 : 16} maxWidth={92} />
                      </span>
                      <b>{SLOT_NAMES[row.slot]}</b>
                      <small>
                        {row.brandName}
                        {BASIS_NOTE[row.basis] && <em> · {BASIS_NOTE[row.basis]}</em>}
                      </small>
                      <span className="v">
                        {formatMoney(row.yearly)}
                        <small>{row.untilSeason === null ? "—" : `dez ${row.untilSeason}`}</small>
                      </span>
                    </li>
                  ))}
                  {folded.length > 0 && (
                    <li className="spo-row">
                      <span className="spo-mk txt">mais {folded.length}</span>
                      <b>{[...new Set(folded.map((row) => SLOT_NAMES[row.slot]))].join(", ")}</b>
                      <small>{folded.map((row) => row.brandName).join(", ")}</small>
                      <span className="v">
                        {formatMoney(folded.reduce((sum, row) => sum + row.yearly, 0))}
                        <small />
                      </span>
                    </li>
                  )}
                </ul>
                <div className="spo-tot">
                  <span>
                    Total por ano
                    <small>de {formatMoney(page.sponsorship)} em patrocínio e licenciamento</small>
                  </span>
                  <b aria-label={`Total por ano ${formatMoney(page.total)}`}>{formatMoney(total)}</b>
                </div>
              </>
            ) : (
              <Past page={page} />
            )}
          </div>
        </div>
      </section>

      <aside className="spo-side">
        <section className="stk spo-off" aria-labelledby="spo-off-title">
          <h2 id="spo-off-title">
            Propostas
            <small>{decideBy ? `fictícias · ${page.isBoardNegotiating ? "a diretoria decide" : "valem até"} ${formatDayMonth(decideBy)}` : "fictícias"}</small>
          </h2>
          {page.offers.length === 0 ? (
            <p className="spo-none">Nenhuma marca na mesa. Elas aparecem quando sobra lugar na camisa, quando um contrato entra no último ano (em outubro) e depois de um título.</p>
          ) : (
            <ul className="spo-offers" aria-label="Propostas de patrocínio">
              {page.offers.map((offer) => (
                <li key={offer.id}>
                  <button
                    type="button"
                    className={offer.id === chosen?.id ? "spo-or sel" : "spo-or"}
                    aria-pressed={offer.id === chosen?.id}
                    aria-label={`${offer.brandName}: ${offerNote(offer)}, ${formatMoney(offer.yearly)} por ano`}
                    onClick={() => setChosenId(offer.id)}
                  >
                    <span className="spo-mk">
                      <BrandLogo brandId={offer.brandId} name={offer.brandName} height={offer.slot === "kit" ? 20 : 16} maxWidth={80} />
                    </span>
                    <b>{offer.brandName}</b>
                    <small>{offerNote(offer)}</small>
                    <span className="v">
                      {formatMoney(offer.yearly)}
                      <small>{offer.bonuses?.title ? `+${formatMoney(offer.bonuses.title)}` : offer.bonuses?.continental ? `+${formatMoney(offer.bonuses.continental)}` : "por ano"}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {page.offers.length > 0 && page.offers.length < FEW_OFFERS && <p className="spo-more">Mais marcas aparecem em outubro, quando um contrato entra no último ano, e depois de um título.</p>}
        </section>

        {betBrand && <BetCard page={page} brand={betBrand} chosen={chosen} oddsMatch={oddsMatch} />}

        {error && (
          <p className="spo-error" role="alert">
            {error}
          </p>
        )}
        {isPicking ? (
          <button
            type="button"
            className="btn go spo-go"
            disabled={isBusy || !chosen}
            onClick={() => {
              if (!chosen) return;
              const slot = chosen.slot;
              void run(async () => {
                await engine.apply({ type: "signSponsor", offerId: chosen.id });
                setChosenId(null);
                setFreshSlot(slot);
              });
            }}
          >
            <i className="ph-bold ph-handshake" aria-hidden="true" />
            {chosen ? `Fechar com ${chosen.brandName}` : "Nenhuma proposta para fechar"}
          </button>
        ) : (
          <p className="spo-board-note">
            <i className="ph-bold ph-briefcase" aria-hidden="true" />
            {chosen && decideBy ? (
              <span>
                A diretoria fecha com a melhor de cada lugar em <b>{formatDayMonth(decideBy)}</b>. Desligue para escolher você.
              </span>
            ) : (
              <span>A diretoria cuida dos patrocínios. Desligue para escolher você.</span>
            )}
          </p>
        )}
      </aside>
    </div>
  );
}

function BetCard({ page, brand, chosen, oddsMatch }: { page: SponsorsPage; brand: { id: string; name: string }; chosen: OfferRow | null; oddsMatch: SponsorsPage["nextMatch"] }) {
  const isOffer = chosen?.isBetting === true && chosen.brandId === brand.id;
  const cleanBest = isOffer ? page.offers.filter((o) => o.slot === chosen.slot && !o.isBetting).reduce((top, o) => Math.max(top, o.yearly), 0) : (page.bestOtherMaster ?? 0);
  // Only against a real offer outside betting for the same place; without one the card says the going premium.
  const betYearly = isOffer ? chosen.yearly : (page.contracts.find((c) => c.slot === "master" && c.isBetting)?.yearly ?? 0);
  const paysMore = cleanBest > 0 ? betYearly - cleanBest : 0;
  const hasBetOnKit = page.contracts.some((c) => c.isBetting);
  return (
    <section className="stk spo-bet" aria-label={`${brand.name} é casa de aposta`}>
      <h2>
        <BrandLogo brandId={brand.id} name={brand.name} height={17} maxWidth={110} />
        é casa de aposta
      </h2>
      <div className="spo-bet-row">
        <ul>
          <li>
            <i className="ph-bold ph-arrow-up up" aria-hidden="true" />
            <span>{paysMore > 0 ? <>Paga <b>{formatMoney(paysMore)} a mais</b> que a melhor proposta fora das apostas</> : <>Casas de aposta pagam <b>cerca de um terço a mais</b> que as outras marcas</>}</span>
          </li>
          <li>
            <i className="ph-bold ph-arrow-down dn" aria-hidden="true" />
            <span>
              {!isOffer ? (
                <>
                  Sem aposta na camisa, a torcida ganha <b>+{BETTING_FAN_COST}</b>
                </>
              ) : hasBetOnKit ? (
                <>A camisa já tem aposta: a torcida não muda</>
              ) : (
                <>
                  Torcida <b>−{BETTING_FAN_COST}</b> enquanto durar
                </>
              )}
            </span>
          </li>
          <li>
            <i className="ph-bold ph-ticket nt" aria-hidden="true" />
            <span>Antes de cada jogo, as odds aparecem no seu painel</span>
          </li>
        </ul>
        {oddsMatch && (
          <div className="spo-bet-odds">
            <OddsSticker match={oddsMatch} brand={brand} />
            <span className="cap">{formatBarDate(oddsMatch.date)}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function Past({ page }: { page: SponsorsPage }) {
  if (page.past.length === 0) return <p className="spo-none">Nenhuma marca saiu da camisa desde que você chegou.</p>;
  return (
    <ul className="spo-rows" aria-label="Histórico">
      {page.past.map((deal, index) => (
        <li key={`${deal.slot}:${deal.brandId}:${index}`} className="spo-row past">
          <span className="spo-mk">
            <BrandLogo brandId={deal.brandId} name={deal.brandName} height={16} maxWidth={92} />
          </span>
          <b>{deal.brandName}</b>
          <small>
            {SLOT_NAMES[deal.slot]} · {deal.reason === "replaced" ? "trocado" : "encerrado"} em {formatDayMonth(deal.endedOn)} de {deal.endedOn.slice(0, 4)}
          </small>
          <span className="v">
            {formatMoney(deal.yearly)}
            <small>por ano</small>
          </span>
        </li>
      ))}
    </ul>
  );
}
