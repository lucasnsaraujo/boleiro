import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProspectAnswer } from "@boleiro/game-client/engine/createEngineSession";
import { formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";
import { useServices } from "../app/ServicesContext.js";
import { Crest } from "../clubs/Crest.js";
import { POSITION_BADGES, POSITION_NAMES } from "../format/playerLabels.js";
import { AGE_FILTERS, isInAgeGroup, youthView, YOUTH_KEYS, type AgeFilter, type CopinhaNote, type KidDetail, type KidRow, type YouthState, type YouthView } from "../youth/youthView.js";
import "./youth.css";

const FILTER_LABELS: Record<AgeFilter, string> = { all: "Todos", u17: "Sub-17", u20: "Sub-20" };
const REFUSALS: Record<NonNullable<ProspectAnswer["refusal"]>, string> = {
  notYours: "ele não é mais da sua base",
  squadFull: "o elenco já está no limite de inscritos",
  noBuyer: "nenhum clube quis pagar o que ele vale",
};
const UNDER_17 = 17;

type Move = "promote" | "sell" | "release";
const COMMANDS = { promote: "promoteProspect", sell: "sellProspect", release: "releaseProspect" } as const;

function Stars({ low, high, size }: { low: number; high: number; size?: "big" }) {
  const label = low === high ? `Potencial de ${low} ${low === 1 ? "estrela" : "estrelas"}` : `Potencial de ${low} a ${high} estrelas`;
  return (
    <span className={size === "big" ? "yth-stars big" : "yth-stars"} role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= low ? "ph-fill ph-star s" : i <= high ? "ph-bold ph-star m" : "ph-fill ph-star o"} aria-hidden="true" />
      ))}
    </span>
  );
}

function copinhaText(note: CopinhaNote): { title: string; rest: string } {
  switch (note.kind) {
    case "upcoming":
      return { title: "Copinha", rest: ` em janeiro, final em ${formatDayMonth(note.date)}. A base joga com os garotos.` };
    case "champion":
      return { title: `Campeão da Copinha ${note.season}`, rest: ". A base levantou a taça em São Paulo." };
    case "out":
      return { title: `Copinha ${note.season}`, rest: `: a base caiu na ${note.round}.` };
    case "absent":
      return { title: `Copinha ${note.season}`, rest: ": a base não tinha time para disputar." };
  }
}

/** The kids of the academy, best first; a click picks one for the card. */
function KidsTable({ kids, selectedId, onSelect }: { kids: readonly KidRow[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <table className="tb yth-tb" aria-label="Garotos da base">
      <thead>
        <tr>
          <th scope="col" className="l yth-p"><abbr title="Posição">P</abbr></th>
          <th scope="col" className="l">Nome</th>
          <th scope="col">Idade</th>
          <th scope="col"><abbr title="Força">F</abbr></th>
          <th scope="col" className="l yth-pot">Potencial</th>
          <th scope="col" className="l">Observação</th>
        </tr>
      </thead>
      <tbody>
        {kids.map((kid) => {
          const badge = POSITION_BADGES[kid.group];
          const isSelected = kid.id === selectedId;
          return (
            <tr
              key={kid.id}
              className={[isSelected ? "sel" : "", kid.isLeaving ? "leaving" : ""].join(" ").trim() || undefined}
              aria-current={isSelected ? "true" : undefined}
              tabIndex={0}
              onClick={() => onSelect(kid.id)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onSelect(kid.id);
              }}
            >
              <td className="l">
                <span className={`pos ${badge.colour}`}>{badge.letter}</span>
              </td>
              <td className="l nm">{kid.name}</td>
              <td className={kid.age <= UNDER_17 ? "young" : undefined}>{kid.age}</td>
              <td className="yth-f">{kid.strength}</td>
              <td className="l yth-pot">
                <Stars {...kid.stars} />
              </td>
              <td className="l">
                {kid.isLeaving ? (
                  <span className="yth-t21">
                    <i className="ph-bold ph-cake" aria-hidden="true" />
                    Faz 21 na virada
                  </span>
                ) : kid.isNew ? (
                  <span className="yth-tg">Veio da peneira de {kid.joinedSeason - 1}</span>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type CardProps = { view: YouthView; kid: KidDetail; isBusy: boolean; onMove: (move: Move, kid: KidDetail) => void };

/** The picked kid as a sticker: who he is, what the scouts see and where he would fit. */
function KidCard({ view, kid, isBusy, onMove }: CardProps) {
  const [isConfirmingRelease, setConfirmingRelease] = useState(false);
  const { club } = view;
  const tag = kid.age <= UNDER_17 ? "Sub-17" : "Sub-20";
  const span = kid.stars.high - kid.stars.low;
  const isSquadFull = view.squadSize >= view.squadCap;
  return (
    <aside className="stk yth-kid" aria-label={`Garoto: ${kid.name}`}>
      <div className="yth-face" key={kid.id}>
        <div className="yth-ph" style={{ "--k1": club.colours.primary, "--k2": club.colours.secondary } as React.CSSProperties}>
          <span className="yth-cr">
            <Crest club={club} size={22} />
          </span>
          <span className="yth-sub">{tag}</span>
          <b aria-hidden="true">{kid.name.charAt(0)}</b>
        </div>
        <div className="yth-nm">{kid.name}</div>
        <div className="yth-sb">
          {POSITION_NAMES[kid.group]} · {kid.age} anos · {kid.hometown}
        </div>
      </div>
      <div className="yth-bd">
        <div className="yth-potbox">
          <div className="yth-big">
            {kid.strength}
            <small>força hoje</small>
          </div>
          <div>
            <Stars {...kid.stars} size="big" />
            <p>
              Potencial de <b>{span === 0 ? `${kid.stars.low} ${kid.stars.low === 1 ? "estrela" : "estrelas"}` : `${kid.stars.low} a ${kid.stars.high} estrelas`}</b>
              <br />
              {span === 0 ? "Os olheiros já conhecem bem o garoto" : `Olheiros: podem errar por até ${span}`}
            </p>
          </div>
        </div>
        <dl className="yth-kv">
          <dt>Na base desde</dt>
          <dd>{kid.joinedSeason}</dd>
          <dt>Salário no profissional</dt>
          <dd>{formatMoney(kid.wage)}</dd>
          <dt>Elenco</dt>
          <dd>
            {view.squadSize} → {view.squadSize + 1} de {view.squadCap}
          </dd>
        </dl>
        {kid.rivals.length > 0 && (
          <div className="yth-vs">
            <span className="lbl">Briga por vaga com</span>
            <ul>
              {kid.rivals.map((rival) => (
                <li key={rival.id}>
                  <span className={`pos ${POSITION_BADGES[kid.group].colour}`}>{POSITION_BADGES[kid.group].letter}</span>
                  <b>{rival.name}</b>
                  <span>{rival.age} anos</span>
                  <em>{rival.strength}</em>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="yth-acts">
          <button type="button" className="btn go" disabled={isBusy || isSquadFull} title={isSquadFull ? "O elenco está no limite de inscritos" : undefined} onClick={() => onMove("promote", kid)}>
            <i className="ph-bold ph-arrow-fat-up" aria-hidden="true" />
            Promover ao profissional
          </button>
          <div className="yth-row">
            <button type="button" className="btn sm" disabled={isBusy} onClick={() => onMove("sell", kid)}>
              Vender
            </button>
            {isConfirmingRelease ? (
              <button type="button" className="btn sm no" disabled={isBusy} onClick={() => onMove("release", kid)}>
                Confirmar dispensa
              </button>
            ) : (
              <button type="button" className="btn sm flat" disabled={isBusy} onClick={() => setConfirmingRelease(true)}>
                Dispensar
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function Youth() {
  const { engine } = useServices();
  const [state, setState] = useState<YouthState | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<AgeFilter>("all");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const view = useMemo(() => state && youthView(state), [state]);

  const reload = useCallback(() => engine.read(YOUTH_KEYS).then(setState), [engine]);

  useEffect(() => {
    let current = true;
    engine.read(YOUTH_KEYS).then(
      (read) => current && setState(read),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!state) return <p className="status">Abrindo a base…</p>;
  if (!view) {
    return (
      <>
        <h1 className="screen-title">Base</h1>
        <p className="status">Sem clube, sem base.</p>
      </>
    );
  }

  const shown = view.kids.filter((kid) => isInAgeGroup(kid, filter));
  const selectedId = pickedId !== null && view.kids.some((kid) => kid.id === pickedId) ? pickedId : (shown[0]?.id ?? null);
  const selected = selectedId === null ? null : view.detailOf(selectedId);
  const leaving = view.kids.filter((kid) => kid.isLeaving);
  const decision = leaving[0] ? view.detailOf(leaving[0].id) : null;
  const copinha = copinhaText(view.copinha);

  async function move(kind: Move, kid: KidDetail) {
    setBusy(true);
    setMessage(null);
    try {
      const answer = await engine.apply({ type: COMMANDS[kind], prospectId: kid.id });
      if (answer.refusal) setMessage(`Não deu: ${REFUSALS[answer.refusal]}.`);
      else if (kind === "promote") setMessage(`${kid.name} subiu ao profissional.`);
      else if (kind === "release") setMessage(`${kid.name} foi dispensado da base.`);
      else if (answer.sale) setMessage(`${kid.name} vendido ao ${state?.clubs[answer.sale.buyerId]?.shortName ?? answer.sale.buyerId} por ${formatMoney(answer.sale.fee)}.`);
      await reload();
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="youth fills-screen">
      <div className="yth-top">
        {decision ? (
          <section className="yth-dec" aria-label="Decisão da base">
            <span className="yth-ic">
              <i className="ph-bold ph-cake" aria-hidden="true" />
            </span>
            <div>
              <b>{decision.name} faz 21 anos na virada do ano</b>
              <span>
                Sai da base: promover, vender ou dispensar. Sem decisão, o auxiliar escolhe.
                {leaving.length > 1 && ` Mais ${leaving.length - 1} na mesma situação.`}
              </span>
            </div>
            <div className="yth-bs">
              <button type="button" className="btn sm" disabled={isBusy || view.squadSize >= view.squadCap} onClick={() => void move("promote", decision)}>
                Promover
              </button>
              <button type="button" className="btn sm" disabled={isBusy} onClick={() => void move("sell", decision)}>
                Vender
              </button>
              <button type="button" className="btn sm flat" disabled={isBusy} onClick={() => setPickedId(decision.id)}>
                Ver garoto
              </button>
            </div>
          </section>
        ) : (
          <section className="yth-dec calm" aria-label="Decisão da base">
            <span className="yth-ic">
              <i className="ph-bold ph-plant" aria-hidden="true" />
            </span>
            <div>
              <b>Ninguém faz 21 anos na virada</b>
              <span>Os garotos seguem na base. Promova quem já estiver pronto.</span>
            </div>
          </section>
        )}
        <p className="note yth-note">
          <i className="ph-bold ph-users-four" aria-hidden="true" />
          <span>
            <b>Peneira</b> no fim da temporada. De 2 a 4 vagas.
          </span>
        </p>
        <p className="note yth-note r">
          <i className="ph-bold ph-trophy" aria-hidden="true" />
          <span>
            <b>{copinha.title}</b>
            {copinha.rest}
          </span>
        </p>
      </div>

      <section className="page yth-list" aria-labelledby="yth-title">
        <div className="yth-hd">
          <h1 id="yth-title">Base</h1>
          <span>
            16 a 20 anos · {view.kids.length} {view.kids.length === 1 ? "garoto" : "garotos"}
          </span>
          <div className="seg" role="tablist" aria-label="Categoria">
            {AGE_FILTERS.map((id) => (
              <button key={id} type="button" role="tab" aria-selected={id === filter} className={id === filter ? "on" : undefined} onClick={() => setFilter(id)}>
                {FILTER_LABELS[id]}
              </button>
            ))}
          </div>
        </div>
        {message && (
          <p className="yth-msg" role="status">
            {message}
          </p>
        )}
        {view.kids.length === 0 ? (
          <p className="status">A base abre na peneira do fim da temporada.</p>
        ) : (
          <div className="yth-scroll">
            <KidsTable kids={shown} selectedId={selectedId} onSelect={setPickedId} />
          </div>
        )}
      </section>

      {selected ? (
        <KidCard key={selected.id} view={view} kid={selected} isBusy={isBusy} onMove={(kind, kid) => void move(kind, kid)} />
      ) : (
        <aside className="stk yth-kid yth-empty">
          <p className="status">Nenhum garoto nesta categoria.</p>
        </aside>
      )}
    </div>
  );
}
