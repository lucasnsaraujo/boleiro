import type { CSSProperties, ReactNode } from "react";
import type { PlayerAwardView } from "@boleiro/game-client/moments/momentView";
import { MomentStage, useCanvasTick, useCueAt } from "../MomentStage.js";
import { Crest } from "../../clubs/Crest.js";
import { crestClub, MomentSticker } from "../MomentSticker.js";
import { clubPaper, confetti } from "../paperMotion.js";
import "./playerAward.css";

type Props = { view: PlayerAwardView; actions: ReactNode };

const ms = (value: number) => ({ "--d": Math.round(value) }) as CSSProperties;

function PlayerAwardBody({ view }: Pick<Props, "view">) {
  const paper = useCanvasTick((surface) => confetti(surface, { at: 2750, colours: [...clubPaper(view.club.colours), "#FFCC00"], count: 150, origin: [0.2, 0.86], spread: 0.5, speed: 1550, seed: 5, life: 4800 }));
  useCueAt("promotion", 2150);
  return (
    <>
      <div className="pa-reveal">
        <div className="pa-kick">
          <i className="ph-fill ph-star" />
          {view.when}
        </div>
        <div className="pa-pack">
          <div className="env">
            <span className="wm">
              <span className="b">BOLEIRO</span>
            </span>
            <small>FIGURINHA ESPECIAL</small>
          </div>
          <div className="lid" />
        </div>
        <div className="pa-cardw">
          <div className="pa-card">
            <div className="back">
              <span>BOLEIRO</span>
            </div>
            <MomentSticker sticker={view.player} crest={30} sheenAt={2950} />
          </div>
        </div>
        <div className="pa-plate">
          <div className="plaque">
            <b>{view.plate}</b>
            <span>
              {view.player.name} · {view.club.name}
            </span>
          </div>
        </div>
      </div>
      <canvas ref={paper} className="fill pa-conf" />
      <section className="pa-side">
        <h2>{view.headline}</h2>
        <p className="sub">{view.sub}</p>
        {view.season.length > 0 && (
          <div className="pa-seq">
            {view.season.map((award, index) => (
              <div key={`${award.title}-${award.date}`} className={`aw${award.isNow ? " now" : ""}`} style={ms(3500 + index * 150)}>
                {!award.isNow && (
                  <span className="ck">
                    <i className="ph-bold ph-check" />
                  </span>
                )}
                <span className="d">{award.isNow ? `Hoje, ${award.date}` : award.date}</span>
                <div className="ic">
                  <i className="ph-fill ph-medal" />
                </div>
                <b>{award.title}</b>
                <small>{award.detail}</small>
              </div>
            ))}
          </div>
        )}
        <div className="pa-stats">
          {view.stats.map((stat) => (
            <div key={stat.label} className={`nst${stat.isFoil ? " foil" : ""}`}>
              <b>{stat.value}</b>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
        {view.career.length > 0 && (
          <div className="pa-career mo-up" style={ms(4400)}>
            <span className="lbl">No jogo, por clube</span>
            {view.career.map((row) => (
              <div key={row.club.id} className="row">
                <Crest club={crestClub(row.club)} size={20} />
                <b>{row.club.name}</b>
                <span>
                  {row.apps} jogos · {row.goals} gols
                </span>
              </div>
            ))}
          </div>
        )}
        {view.others.length > 0 && (
          <div className="pa-others">
            <span className="lbl">Também na lista</span>
            <div className="row">
              {view.others.slice(0, 6).map((sticker, index) => (
                <MomentSticker key={sticker.id} sticker={sticker} className="mo-slap" style={ms(4500 + index * 90)} />
              ))}
            </div>
          </div>
        )}
        <div className="cause">
          <b>Por quê</b>
          <span>{view.cause}</span>
        </div>
      </section>
    </>
  );
}

/**
 * A player's achievement: the yellow sticker pack drops in and tears open, the sticker rises out back first and
 * turns face up as the paper flies in his club's colours, then the trophy plate and the season page with each
 * award in the order it was shown.
 */
export function PlayerAwardScene({ view, actions }: Props) {
  return (
    <MomentStage durationMs={5400} backdrop="#073A1E" tone="dark" label={`${view.award}: ${view.player.name}`} className="mo-award" actions={actions}>
      <PlayerAwardBody view={view} />
    </MomentStage>
  );
}
