import type { ReactNode } from "react";
import type { MomentView } from "@boleiro/game-client/moments/momentView";
import { ComeBackScene } from "./scenes/ComeBackScene.js";
import { IdolScene } from "./scenes/IdolScene.js";
import { PlayerAwardScene } from "./scenes/PlayerAwardScene.js";
import { QuietExitScene } from "./scenes/QuietExitScene.js";
import { RetirementScene } from "./scenes/RetirementScene.js";
import { SackingScene } from "./scenes/SackingScene.js";
import { SendOffScene } from "./scenes/SendOffScene.js";
import { TestimonialScene } from "./scenes/TestimonialScene.js";
import { TitleScene } from "./scenes/TitleScene.js";
import { TributeScene } from "./scenes/TributeScene.js";

/** The scene of a career moment, by its kind, with what the coach can do once it has played. */
export function MomentScene({ view, actions }: { view: MomentView; actions: ReactNode }) {
  switch (view.kind) {
    case "idol":
      return <IdolScene view={view} actions={actions} />;
    case "sacking":
      return <SackingScene view={view} actions={actions} />;
    case "sendOff":
      return <SendOffScene view={view} actions={actions} />;
    case "quietExit":
      return <QuietExitScene view={view} actions={actions} />;
    case "title":
      return <TitleScene view={view} actions={actions} />;
    case "milestone":
    case "homecoming":
    case "idolRetired":
      return <TributeScene view={view} actions={actions} />;
    case "testimonial":
      return <TestimonialScene view={view} actions={actions} />;
    case "comeBack":
      return <ComeBackScene view={view} actions={actions} />;
    case "playerAward":
      return <PlayerAwardScene view={view} actions={actions} />;
    case "retirement":
      return <RetirementScene view={view} actions={actions} />;
  }
}
