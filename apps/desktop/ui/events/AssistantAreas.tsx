import { useEffect, useState } from "react";
import type { EventArea } from "@boleiro/engine/sim/events/eventMemory";
import { useServices } from "../app/ServicesContext.js";

const AREAS: readonly { area: EventArea; label: string; note: string }[] = [
  { area: "players", label: "Jogadores", note: "Casamentos, atrasos, pedidos de saída e de aumento" },
  { area: "squad", label: "Elenco", note: "Brigas no vestiário, reuniões e premiações" },
  { area: "board", label: "Diretoria", note: "Vendas pedidas, ultimatos e palpites na escalação" },
  { area: "fans", label: "Torcida", note: "Protestos, preço do ingresso e provocações do rival" },
  { area: "press", label: "Imprensa", note: "Coletivas e convites de TV" },
];

/** The areas whose events the assistant answers for the coach in the seat, each one a switch. */
export function AssistantAreas() {
  const { engine } = useServices();
  const [handed, setHanded] = useState<ReadonlySet<EventArea> | null>(null);
  const [hasFailed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    engine.read(["coach"]).then(
      ({ coach }) => current && setHanded(new Set(coach.assistantAreas ?? [])),
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

  if (!handed) return null;
  return (
    <section className="options-group" aria-labelledby="options-assistant-title">
      <h2 id="options-assistant-title" className="options-heading">
        Auxiliar
      </h2>
      <p className="options-row-note">Ligado, o auxiliar responde sozinho os assuntos da área e você lê no jornal.</p>
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
