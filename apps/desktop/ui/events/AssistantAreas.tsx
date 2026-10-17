import { useEffect, useState } from "react";
import { doesAssistantHandle, type AssistantDuty } from "@boleiro/engine/sim/coach/assistantDuties";
import type { EventArea } from "@boleiro/engine/sim/events/eventMemory";
import { useServices } from "../app/ServicesContext.js";

const AREAS: readonly { area: EventArea; label: string; note: string }[] = [
  { area: "players", label: "Jogadores", note: "Casamentos, atrasos, pedidos de saída e de aumento" },
  { area: "squad", label: "Elenco", note: "Brigas no vestiário, reuniões e premiações" },
  { area: "board", label: "Diretoria", note: "Vendas pedidas, ultimatos e palpites na escalação" },
  { area: "fans", label: "Torcida", note: "Protestos, preço do ingresso e provocações do rival" },
  { area: "press", label: "Imprensa", note: "Coletivas e convites de TV" },
];

const DUTIES: readonly { duty: AssistantDuty; label: string; note: string }[] = [
  { duty: "contracts", label: "Contratos", note: "Renova quem vale a pena manter no fim de cada janela e da temporada, dentro do teto da folha" },
];

/** The duties the assistant runs and the areas whose events he answers for the coach in the seat, each one a switch. */
export function AssistantAreas() {
  const { engine } = useServices();
  const [handed, setHanded] = useState<ReadonlySet<EventArea> | null>(null);
  const [duties, setDuties] = useState<ReadonlySet<AssistantDuty>>(new Set());
  const [hasFailed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    engine.read(["coach"]).then(
      ({ coach }) => {
        if (!current) return;
        setHanded(new Set(coach.assistantAreas ?? []));
        setDuties(new Set(DUTIES.filter(({ duty }) => doesAssistantHandle(coach, duty)).map(({ duty }) => duty)));
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
    } catch {
      setFailed(true);
    }
  }

  if (!handed) return null;
  return (
    <section className="options-group" aria-labelledby="options-assistant-title">
      <h2 id="options-assistant-title" className="options-heading">
        Auxiliar
      </h2>
      {DUTIES.map(({ duty, label, note }) => (
        <div key={duty} className="options-row">
          <div className="options-row-text">
            <label className="options-row-label" htmlFor={`assistant-duty-${duty}`}>
              {label}
            </label>
            <p className="options-row-note">{note}</p>
          </div>
          <input id={`assistant-duty-${duty}`} type="checkbox" className="options-sw" checked={duties.has(duty)} onChange={(event) => void runDuty(duty, event.target.checked)} />
        </div>
      ))}
      <p className="options-row-note">Nos assuntos abaixo, ligado, o auxiliar responde sozinho e você lê no jornal.</p>
      {AREAS.map(({ area, label, note }) => (
        <div key={area} className="options-row">
          <div className="options-row-text">
            <label className="options-row-label" htmlFor={`assistant-${area}`}>
              {label}
            </label>
            <p className="options-row-note">{note}</p>
          </div>
          <input id={`assistant-${area}`} type="checkbox" className="options-sw" checked={handed.has(area)} onChange={(event) => void hand(area, event.target.checked)} />
        </div>
      ))}
      {hasFailed && <p className="status error">Não deu para mudar agora. Tente fora da rodada.</p>}
    </section>
  );
}
