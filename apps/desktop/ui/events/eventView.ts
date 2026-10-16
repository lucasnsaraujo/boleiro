import type { Effects, PendingEvent } from "@boleiro/engine/sim/events/eventMemory";
import type { IsoDate } from "@boleiro/engine/sim/gameState";
import { formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { formatMoney } from "@boleiro/game-client/format/formatMoney";

export type EffectCell = { key: keyof Effects; label: string; icon: string | null; text: string; tone: "up" | "dn" | "eq" | "hot" };

// The event card's columns (mock design/mocks/event.html), and the press conference's (press.html).
const CARD_COLUMNS = [
  { key: "morale", label: "Moral", icon: "smiley" },
  { key: "fans", label: "Torcida", icon: "megaphone" },
  { key: "board", label: "Diretoria", icon: "briefcase" },
  { key: "money", label: "Caixa", icon: "coins" },
] as const;
const PRESS_COLUMNS = [
  { key: "morale", label: "Moral", icon: null },
  { key: "board", label: "Diretoria", icon: null },
  { key: "fans", label: "Torcida", icon: null },
  { key: "rivalry", label: "Rivalidade", icon: null },
] as const;
// A rivalry answer this hot shows in red: it will be in the papers.
const HOT_RIVALRY = 4;

const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0");

/** What an answer moves, one cell per column of the window, signed and coloured. */
export function effectCells(effects: Effects, isPress: boolean): EffectCell[] {
  return (isPress ? PRESS_COLUMNS : CARD_COLUMNS).map(({ key, label, icon }) => {
    const value = effects[key] ?? 0;
    const text = key === "money" && value !== 0 ? `${value > 0 ? "+" : "−"}${formatMoney(Math.abs(value))}` : signed(value);
    const tone = key === "rivalry" && value >= HOT_RIVALRY ? "hot" : value > 0 ? "up" : value < 0 ? "dn" : "eq";
    return { key, label, icon, text, tone };
  });
}

const WEEKDAY = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" });

/** When the assistant takes over: "Sem resposta até quarta (21 out), o auxiliar decide.", or "até o jogo de hoje" on `today`. */
export function expiryText(event: Pick<PendingEvent, "expiresOn">, today: IsoDate): string {
  if (event.expiresOn <= today) return "Sem resposta até o jogo de hoje, o auxiliar decide.";
  const day = WEEKDAY.format(new Date(`${event.expiresOn}T00:00:00Z`)).replace("-feira", "");
  return `Sem resposta até ${day} (${formatDayMonth(event.expiresOn)}), o auxiliar decide.`;
}

// Generated reporters of the game's own paper; invented names, as SPEC §14 asks of generated people.
const REPORTERS = ["Renata Moura", "Caio Bastos", "Lívia Prado", "Otávio Reis", "Júlia Tavares"] as const;

/** The reporter who asks at the press conference of `date`, the same one for the same day. */
export function reporterOn(date: IsoDate): string {
  const day = Number(date.slice(8, 10)) + Number(date.slice(5, 7));
  return REPORTERS[day % REPORTERS.length] ?? REPORTERS[0];
}
