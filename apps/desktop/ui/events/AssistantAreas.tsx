import { useEffect, useState } from "react";
import { ASSISTANT_DUTIES, doesAssistantHandle, type AssistantDuty } from "@boleiro/engine/sim/coach/assistantDuties";
import type { EventArea } from "@boleiro/engine/sim/events/eventMemory";
import { doesAssistantPriceTickets } from "@boleiro/engine/sim/finances/setTicketPrice";
import { useServices } from "../app/ServicesContext.js";
import "./assistantAreas.css";

const AREAS: readonly { area: EventArea; label: string; note: string }[] = [
  { area: "players", label: "Jogadores", note: "Casamentos, atrasos, pedidos de saída e de aumento" },
  { area: "squad", label: "Elenco", note: "Brigas no vestiário, reuniões e premiações" },
  { area: "board", label: "Diretoria", note: "Vendas pedidas, ultimatos e palpites na escalação" },
  { area: "fans", label: "Torcida", note: "Protestos, preço do ingresso e provocações do rival" },
  { area: "press", label: "Imprensa", note: "Coletivas e convites de TV" },
];

const DUTIES: Record<AssistantDuty, { label: string; note: string; icon: string }> = {
  lineup: { label: "Escalação", note: "Escala o melhor time; desligado, fica o seu último", icon: "strategy" },
  contracts: { label: "Contratos", note: "Renova quem vale a pena, dentro do teto da folha", icon: "signature" },
  youth: { label: "Base", note: "Promove os garotos prontos a cada janela", icon: "plant" },
  ticketPrice: { label: "Preço do ingresso", note: "Cobra a média da divisão em cada jogo em casa", icon: "ticket" },
  selling: { label: "Vender quem sobra", note: "Aceita propostas por quem está fora dos planos", icon: "hand-coins" },
};

type Props = {
  /** After a switch reached the game, so the screen around it can read what changed. */
  onChange?: () => void;
};

/** The duties the assistant runs and the areas whose events he answers for the coach in the seat, each one a switch. */
export function AssistantAreas({ onChange }: Props) {
  const { engine } = useServices();
  const [handed, setHanded] = useState<ReadonlySet<EventArea> | null>(null);
  const [duties, setDuties] = useState<ReadonlySet<AssistantDuty>>(new Set());
  const [hasFailed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    engine.read(["coach", "coachClubId", "clubs", "economy", "finances"]).then(
      (state) => {
        if (!current) return;
        setHanded(new Set(state.coach.assistantAreas ?? []));
        const isOn = (duty: AssistantDuty) => (duty === "ticketPrice" ? doesAssistantPriceTickets(state) : doesAssistantHandle(state.coach, duty));
        setDuties(new Set(ASSISTANT_DUTIES.filter(isOn)));
      },
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine]);

  async function hand(area: EventArea, isHanded: boolean) {
    setFailed(false);
    try {
      await engine.apply({ type: "handToAssistant", area, isHanded });
      setHanded((areas) => {
        const next = new Set(areas);
        if (isHanded) next.add(area);
        else next.delete(area);
        return next;
      });
      onChange?.();
    } catch {
      setFailed(true);
    }
  }

  async function runDuty(duty: AssistantDuty, isOn: boolean) {
    setFailed(false);
    try {
      await engine.apply({ type: "setAssistantDuty", duty, isOn });
      setDuties((current) => {
        const next = new Set(current);
        if (isOn) next.add(duty);
        else next.delete(duty);
        return next;
      });
      onChange?.();
    } catch {
      setFailed(true);
    }
  }

  if (!handed) return null;
  return (
    <section className="stk asst-areas" aria-labelledby="asst-areas-title">
      <h2 id="asst-areas-title">Ele cuida de</h2>
      {ASSISTANT_DUTIES.map((duty) => {
        const { label, note, icon } = DUTIES[duty];
        const isOn = duties.has(duty);
        return (
          <div key={duty} className={isOn ? "asst-duty" : "asst-duty off"}>
            <i className={`ph-bold ph-${icon}`} aria-hidden="true" />
            <div>
              <label htmlFor={`assistant-duty-${duty}`}>{label}</label>
              <small id={`assistant-duty-${duty}-note`}>{note}</small>
            </div>
            <input
              id={`assistant-duty-${duty}`}
              type="checkbox"
              className="asst-sw"
              aria-describedby={`assistant-duty-${duty}-note`}
              checked={isOn}
              onChange={(event) => void runDuty(duty, event.target.checked)}
            />
          </div>
        );
      })}
      <h3 className="asst-areas-sub">Responde por você</h3>
      <p className="asst-areas-lede">Ligado, ele responde sozinho e você lê no jornal.</p>
      <div className="asst-pills">
        {AREAS.map(({ area, label, note }) => (
          <label key={area} className={handed.has(area) ? "asst-pill on" : "asst-pill"} title={note}>
            <input id={`assistant-${area}`} type="checkbox" checked={handed.has(area)} onChange={(event) => void hand(area, event.target.checked)} />
            <i className={handed.has(area) ? "ph-bold ph-check" : "ph-bold ph-plus"} aria-hidden="true" />
            {label}
          </label>
        ))}
      </div>
      {hasFailed && <p className="status error">Não deu para mudar agora. Tente fora da rodada.</p>}
    </section>
  );
}
