import { useContext } from "react";
import { Link } from "react-router";
import credits from "../../../../assets/sounds/CREDITS.md?raw";
import { useRunCommand } from "../app/AppCommands.js";
import { platformOf } from "../app/platform.js";
import { NAV } from "../app/screens.js";
import { ServicesContext } from "../app/ServicesContext.js";
import { shortcutKeys, type CommandId } from "../app/shortcuts.js";
import { slotLabel } from "@boleiro/game-client/saves/slotMeta";
import { parseCredits } from "../sound/credits.js";
import { useSound } from "../sound/SoundProvider.js";
import type { SoundSettings } from "../sound/soundSettings.js";
import { useTheme } from "../theme/ThemeProvider.js";
import type { ThemeSetting } from "../theme/themeSetting.js";
import "./options.css";

const CREDITS = parseCredits(credits);
const PLATFORM = platformOf(navigator.userAgent);

type Volume = "music" | "sfx";
const VOLUMES: readonly { key: Volume; label: string }[] = [
  { key: "music", label: "Música" },
  { key: "sfx", label: "Efeitos" },
];

const THEMES: readonly { setting: ThemeSetting; label: string }[] = [
  { setting: "light", label: "Claro" },
  { setting: "dark", label: "Escuro" },
  { setting: "system", label: "Igual ao sistema" },
];

type Shortcut = { command: CommandId; label: string; isAvailable: boolean };
const SHORTCUTS: readonly Shortcut[] = [
  ...NAV.map(({ id, label, path }) => ({ command: id, label, isAvailable: path !== null })),
  { command: "jogarRodada", label: "Jogar rodada", isAvailable: true },
  { command: "mudo", label: "Sem som", isAvailable: true },
  { command: "salvar", label: "Salvar", isAvailable: true },
];

/** Paper, sound, saving and the keyboard; the credits of every sound file. */
export function Options() {
  const { settings, changeSettings } = useSound();
  const theme = useTheme();
  const runCommand = useRunCommand();
  const opened = useContext(ServicesContext)?.game.current ?? null;
  const change = (next: Partial<SoundSettings>) => changeSettings({ ...settings, ...next });

  return (
    <div className="options">
      <h1 className="screen-title">Opções</h1>
      <div className="options-body">
        <div className="options-main">
          <section className="options-look" aria-labelledby="options-look-title">
            <h2 id="options-look-title" className="options-heading">
              Aparência
            </h2>
            <div className="options-row">
              <div>
                <p className="options-row-label" id="options-theme">
                  Tema
                </p>
                <p className="options-row-note">O escuro troca o papel por verde-noite.</p>
              </div>
              <div className="seg options-seg" role="radiogroup" aria-labelledby="options-theme">
                {THEMES.map(({ setting, label }) => (
                  <label key={setting} className={theme.setting === setting ? "on" : undefined}>
                    <input type="radio" name="theme" checked={theme.setting === setting} onChange={() => theme.changeSetting(setting)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </section>
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
          {opened && (
            <section className="options-saving" aria-labelledby="options-saving-title">
              <h2 id="options-saving-title" className="options-heading">
                Jogo salvo
              </h2>
              <div className="options-row">
                <div>
                  <p className="options-row-label">{slotLabel(opened.slotId)}</p>
                  <p className="options-row-note">Também salva sozinho no Automático.</p>
                </div>
                <button className="btn" onClick={() => runCommand("salvar")}>
                  <i className="ph-bold ph-floppy-disk" aria-hidden="true" />
                  Salvar agora
                </button>
              </div>
            </section>
          )}
          <footer className="options-actions">
            <Link to="/" className="btn-main">
              Voltar ao início
            </Link>
          </footer>
        </div>

        <div className="options-side">
          <section className="shortcuts" aria-labelledby="shortcuts-title">
            <h2 id="shortcuts-title" className="options-heading">
              Atalhos
            </h2>
            <p className="options-row-note">Funcionam em qualquer tela do jogo.</p>
            <ul className="shortcuts-list" aria-label="Atalhos">
              {SHORTCUTS.map(({ command, label, isAvailable }) => (
                <li key={command} className="shortcut" aria-disabled={isAvailable ? undefined : "true"} title={isAvailable ? undefined : "Em breve"}>
                  <span className="shortcut-keys">
                    {shortcutKeys(command, PLATFORM).map((key) => (
                      <kbd key={key} className="kbd">
                        {key}
                      </kbd>
                    ))}
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </section>

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
    </div>
  );
}
