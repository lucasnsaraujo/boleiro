import { Link } from "react-router";
import credits from "../../assets/sounds/CREDITS.md?raw";
import { parseCredits } from "../sound/credits.js";
import { useSound } from "../sound/SoundProvider.js";
import type { SoundSettings } from "../sound/soundSettings.js";
import "./options.css";

const CREDITS = parseCredits(credits);

type Volume = "music" | "sfx";
const VOLUMES: readonly { key: Volume; label: string }[] = [
  { key: "music", label: "Música" },
  { key: "sfx", label: "Efeitos" },
];

/** Sound settings and the credits of every sound file. */
export function Options() {
  const { settings, changeSettings } = useSound();
  const change = (next: Partial<SoundSettings>) => changeSettings({ ...settings, ...next });

  return (
    <div className="options">
      <h1 className="screen-title">Opções</h1>
      <div className="options-body">
        <div className="options-main">
          <section className="options-sound" aria-labelledby="options-sound-title">
            <h2 id="options-sound-title" className="options-heading">
              Som
            </h2>
            {VOLUMES.map(({ key, label }) => {
              const percent = Math.round(settings[key] * 100);
              return (
                <label key={key} className="options-volume">
                  <span className="options-volume-label">{label}</span>
                  <input
                    type="range"
                    className="options-slider"
                    min={0}
                    max={100}
                    step={5}
                    value={percent}
                    disabled={settings.isMuted}
                    aria-label={label}
                    style={{ ["--fill" as string]: `${percent}%` }}
                    onChange={(event) => change({ [key]: Number(event.target.value) / 100 })}
                  />
                  <span className="options-volume-value">{percent}%</span>
                </label>
              );
            })}
            <label className="options-mute">
              <input type="checkbox" checked={settings.isMuted} onChange={(event) => change({ isMuted: event.target.checked })} />
              <span>Sem som</span>
            </label>
          </section>
          <footer className="options-actions">
            <Link to="/" className="btn-main">
              Voltar ao início
            </Link>
          </footer>
        </div>

        <section className="credits" aria-labelledby="credits-title">
          <h2 id="credits-title" className="options-heading">
            Créditos
          </h2>
          <ul className="credits-list" aria-label="Créditos">
            {CREDITS.map((row) => (
              <li key={row.file} className="credits-row">
                <a className="credits-sound" href={row.source} title={row.sound} target="_blank" rel="noreferrer">
                  {row.sound}
                </a>
                <span className="credits-who">
                  {row.author} · {row.licence}
                </span>
              </li>
            ))}
          </ul>
          <p className="credits-note">Cliques e vinhetas de título, acesso, rebaixamento e demissão são sintetizados no próprio jogo.</p>
        </section>
      </div>
    </div>
  );
}
