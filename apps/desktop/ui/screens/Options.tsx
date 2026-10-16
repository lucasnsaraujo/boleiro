import { useContext, useEffect, useState } from "react";
import { Link } from "react-router";
import credits from "../../../../assets/sounds/CREDITS.md?raw";
import { useRunCommand } from "../app/AppCommands.js";
import { platformOf } from "../app/platform.js";
import { NAV } from "../app/screens.js";
import { AssistantAreas } from "../events/AssistantAreas.js";
import { ServicesContext } from "../app/ServicesContext.js";
import { shortcutKeys, type CommandId } from "../app/shortcuts.js";
import { GAME_SLOT_IDS, slotLabel } from "@boleiro/game-client/saves/slotMeta";
import type { SlotStore } from "@boleiro/game-client/saves/slotStore";
import icon from "../../../../design/logo/boleiro-icon-small.svg";
import { parseCredits } from "../sound/credits.js";
import { useSound } from "../sound/SoundProvider.js";
import type { SoundSettings } from "../sound/soundSettings.js";
import { useTheme } from "../theme/ThemeProvider.js";
import type { ThemeSetting } from "../theme/themeSetting.js";
import "./options.css";

const CREDITS = parseCredits(credits);
const PLATFORM = platformOf(navigator.userAgent);

type Volume = "music" | "sfx";
const VOLUMES: readonly { key: Volume; label: string; title: string; note: string | null }[] = [
  { key: "sfx", label: "Efeitos", title: "Efeitos", note: "Gol, torcida e apito" },
  { key: "music", label: "Música", title: "Música de fundo", note: null },
];

// The game slots plus the autosave.
const SLOT_COUNT = GAME_SLOT_IDS.length + 1;

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

const MATCH_KEYS: readonly { commands: readonly CommandId[]; label: string }[] = [
  { commands: ["pausar"], label: "Pausa" },
  { commands: ["velocidade1", "velocidade2", "velocidade3"], label: "Velocidade" },
  { commands: ["tabelaAoVivo"], label: "Tabela ao vivo" },
];

/** Paper, sound, saving and the keyboard; the credits of every sound file. */
export function Options() {
  const { settings, changeSettings } = useSound();
  const theme = useTheme();
  const runCommand = useRunCommand();
  const services = useContext(ServicesContext);
  const opened = services?.game.current ?? null;
  const usedSlots = useUsedSlots(services?.slots ?? null);
  const change = (next: Partial<SoundSettings>) => changeSettings({ ...settings, ...next });

  return (
    <div className="options fills-screen">
      <div className="page options-page">
        <h1 className="options-title">Opções</h1>
        <section className="options-group" aria-labelledby="options-look-title">
          <h2 id="options-look-title" className="options-heading">
            Aparência
          </h2>
          <div className="options-row">
            <div className="options-row-text">
              <p className="options-row-label" id="options-theme">
                Tema
              </p>
              <p className="options-row-note">O escuro troca o papel por verde-noite.</p>
            </div>
            <div className="seg seg-radio" role="radiogroup" aria-labelledby="options-theme">
              {THEMES.map(({ setting, label }) => (
                <label key={setting} className={theme.setting === setting ? "on" : undefined}>
                  <input type="radio" name="theme" checked={theme.setting === setting} onChange={() => theme.changeSetting(setting)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="options-group" aria-labelledby="options-sound-title">
          <h2 id="options-sound-title" className="options-heading">
            Som
          </h2>
          {VOLUMES.map(({ key, label, title, note }) => {
            const percent = Math.round(settings[key] * 100);
            return (
              <div key={key} className="options-row">
                <div className="options-row-text">
                  <p className="options-row-label">{title}</p>
                  {note && <p className="options-row-note">{note}</p>}
                </div>
                <div className="options-volume">
                  <i className="ph-bold ph-speaker-low" aria-hidden="true" />
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
                  <i className="ph-bold ph-speaker-high" aria-hidden="true" />
                  <span className="options-volume-value">{percent}%</span>
                </div>
              </div>
            );
          })}
          <div className="options-row">
            <div className="options-row-text">
              <label className="options-row-label" htmlFor="options-mute">
                Sem som
              </label>
              <p className="options-row-note" id="options-mute-note">
                Tecla M em qualquer tela
              </p>
            </div>
            <input
              id="options-mute"
              type="checkbox"
              className="options-sw"
              aria-describedby="options-mute-note"
              checked={settings.isMuted}
              onChange={(event) => change({ isMuted: event.target.checked })}
            />
          </div>
        </section>

        {opened && <AssistantAreas />}

        {opened && (
          <section className="options-group" aria-labelledby="options-saving-title">
            <h2 id="options-saving-title" className="options-heading">
              Jogo salvo
            </h2>
            <div className="options-row">
              <div className="options-row-text">
                <p className="options-row-label">{slotLabel(opened.slotId)}</p>
                <p className="options-row-note">Também salva sozinho no Automático a cada rodada.</p>
              </div>
              <button className="btn sm" onClick={() => runCommand("salvar")}>
                <i className="ph-bold ph-floppy-disk" aria-hidden="true" />
                Salvar agora
              </button>
            </div>
            <div className="options-row">
              <div className="options-row-text">
                <p className="options-row-label">Jogos salvos</p>
                {usedSlots !== null && (
                  <p className="options-row-note">
                    {usedSlots} de {SLOT_COUNT} vagas usadas
                  </p>
                )}
              </div>
              <Link className="btn sm" to="/saves">
                <i className="ph-bold ph-folder-open" aria-hidden="true" />
                Abrir
              </Link>
            </div>
          </section>
        )}

        <section className="options-group" aria-labelledby="credits-title">
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

        <footer className="options-actions">
          <Link to="/" className="btn">
            <i className="ph-bold ph-house" aria-hidden="true" />
            Voltar ao início
          </Link>
        </footer>
      </div>

      <aside className="stk options-keys" aria-labelledby="shortcuts-title">
        <h2 id="shortcuts-title">Atalhos</h2>
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
        <h3 className="options-keys-sub" id="match-keys-title">
          Na partida
        </h3>
        <ul className="shortcuts-list" aria-labelledby="match-keys-title">
          {MATCH_KEYS.map(({ commands, label }) => (
            <li key={label} className="shortcut">
              <span className="shortcut-keys">
                {commands
                  .flatMap((command) => shortcutKeys(command, PLATFORM))
                  .map((key) => (
                    <kbd key={key} className="kbd">
                      {key}
                    </kbd>
                  ))}
              </span>
              {label}
            </li>
          ))}
        </ul>
        <p className="options-about">
          <img src={icon} width={38} height={38} alt="" />
          <span>
            <b>Boleiro</b> · Brasil 2026
            <br />
            Archivo (OFL) · Phosphor Icons (MIT)
          </span>
        </p>
      </aside>
    </div>
  );
}

/** How many slots hold a save, or null until the list is read (and outside a game's services). */
function useUsedSlots(slots: SlotStore | null): number | null {
  const [used, setUsed] = useState<number | null>(null);
  useEffect(() => {
    if (!slots) return;
    let current = true;
    slots.list().then(
      (list) => current && setUsed(list.length),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [slots]);
  return used;
}
