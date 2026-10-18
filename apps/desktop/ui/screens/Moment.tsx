import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import type { MomentView } from "@boleiro/game-client/moments/momentView";
import { useServices } from "../app/ServicesContext.js";
import { MomentScene } from "../moments/MomentScene.js";

type Loaded = { view: MomentView } | "none";

/**
 * A career moment, one at a time: the next one waiting for the coach, or with `?replay=<id>` one he already
 * saw, played again from the trajectory. Seeing one through closes it; a replay only goes back.
 */
export function Moment() {
  const { engine } = useServices();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const replay = params.get("replay");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [isLeaving, setLeaving] = useState(false);

  useEffect(() => {
    let current = true;
    (replay ? engine.momentView(replay) : engine.moment()).then(
      (view) => current && setLoaded(view ? { view } : "none"),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [engine, replay]);

  if (failed) return <p className="status error">Nenhum jogo aberto.</p>;
  if (!loaded) return <p className="status">Abrindo…</p>;
  if (loaded === "none") return <Navigate to={replay ? "/trajectory" : "/hub"} replace />;
  const { view } = loaded;

  async function leave(to: string, before?: () => Promise<unknown>) {
    setLeaving(true);
    try {
      await before?.();
      if (!replay) await engine.apply({ type: "closeMoment", id: view.id });
      navigate(to);
    } catch {
      setFailed(true);
    }
  }

  const go = (label: string, to: string, icon = "arrow-right", before?: () => Promise<unknown>): ReactNode => (
    <button key={label} className="btn go" autoFocus disabled={isLeaving} onClick={() => void leave(to, before)}>
      {label}
      <i className={`ph-bold ph-${icon}`} aria-hidden="true" />
    </button>
  );
  const side = (label: string, to: string, icon = "arrow-right", before?: () => Promise<unknown>): ReactNode => (
    <button key={label} className="btn" disabled={isLeaving} onClick={() => void leave(to, before)}>
      <i className={`ph-bold ph-${icon}`} aria-hidden="true" />
      {label}
    </button>
  );

  const actions = replay ? [go("Voltar à trajetória", "/trajectory", "arrow-left")] : actionsOf(view, go, side, () => engine.apply({ type: "declineOffer", clubId: view.club.id }));
  return <MomentScene view={view} actions={<>{actions}</>} />;
}

type Button = (label: string, to: string, icon?: string, before?: () => Promise<unknown>) => ReactNode;

/** What the coach can do once a moment has played: go on, open the album, look at the offers. */
function actionsOf(view: MomentView, go: Button, side: Button, declineComeBack: () => Promise<unknown>): ReactNode[] {
  switch (view.kind) {
    case "sacking":
      return [side("Jornal", "/newspaper", "newspaper"), go("Ver propostas", "/offers")];
    case "comeBack":
      return view.offer ? [side("Agradecer e recusar", "/hub", "x", declineComeBack), go("Ver a proposta", "/offers", "handshake")] : [go("Continuar", "/hub")];
    case "retirement":
      return [side("Ver a trajetória", "/trajectory", "path"), go("Fechar o álbum", "/hub")];
    case "quietExit":
      return [go("Continuar", "/hub")];
    case "title":
    case "sendOff":
    case "idol":
    case "playerAward":
    case "testimonial":
      return [side("Ver no álbum", "/history", "book-open-text"), go("Continuar", "/hub")];
    case "milestone":
    case "homecoming":
    case "idolRetired":
      return [side("Ver a trajetória", "/trajectory", "path"), go("Continuar", "/hub")];
  }
}
