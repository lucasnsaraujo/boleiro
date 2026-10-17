import type { Stance, TalkMood } from "@boleiro/engine/sim/transfers/contractTerms";
import { formatContractLength } from "@boleiro/game-client/format/formatContractLength";

/** How each stance reads on its length's card. */
export const STANCE_LABELS: Record<Stance, string> = { wants: "Prefere", agrees: "Topa", hard: "Difícil", refuses: "Recusa" };

// The squad morale below which the player says the dressing room weighs on him, as the talks model's own line.
const SOUR_MORALE = 30;
// From this age he asks for security, as veterans do.
const VETERAN_AGE = 29;
const STAR_WISH = 12;

type SayOption = { months: number; stance: Stance; ageAtEnd: number };
type Say = { age: number; preferredMonths: number; mood: TalkMood; options: readonly SayOption[] };

const list = (items: readonly string[]) => (items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ou ${items.at(-1)}`);

/** "6 meses", "2 ou 4 anos", "6 meses, 1 ano ou 2 anos". */
export function lengthsText(months: readonly number[]): string {
  if (months.length > 1 && months.every((m) => m >= 12)) return `${list(months.map((m) => String(m / 12)))} anos`;
  return list(months.map(formatContractLength));
}

function moodText(mood: TalkMood, clubName: (clubId: string) => string): string | null {
  const offer = mood.offerFrom && (mood.offerFrom === "abroad" ? "tem proposta da Europa na mesa" : `tem proposta do ${clubName(mood.offerFrom)} na mesa`);
  const parts = [mood.hasAskedToLeave ? "pediu para sair há pouco" : null, offer, mood.morale < SOUR_MORALE ? "sente o elenco pra baixo" : null].filter((part): part is string => !!part);
  if (!parts.length) return null;
  const sentence = parts.length === 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

/** What the player says about renewing, as the renewal screen's speech bubble: what weighs on him, the length he wants, what he'd take and what he won't. */
export function renewalSay({ age, preferredMonths, mood, options }: Say, clubName: (clubId: string) => string): string {
  const wanted = options.find((o) => o.stance === "wants");
  const around = wanted ? [wanted] : [...options].sort((a, b) => Math.abs(a.months - preferredMonths) - Math.abs(b.months - preferredMonths)).slice(0, 2).sort((a, b) => a.months - b.months);
  const [low, high] = around;
  let wish = wanted ? `Quer ${formatContractLength(wanted.months)}` : low && high ? `Quer entre ${low.months / 12} e ${lengthsText([high.months])}` : "";
  if (wanted && preferredMonths === STAR_WISH && age < VETERAN_AGE) wish += ": acha que logo aparece clube maior";
  else if (wanted && age >= VETERAN_AGE) wish += ` e segurança até os ${wanted.ageAtEnd}`;
  const named = new Set(around.map((o) => o.months));
  const agreed = options.filter((o) => (o.stance === "agrees" || o.stance === "wants") && !named.has(o.months)).map((o) => o.months);
  const refused = options.filter((o) => o.stance === "refuses").map((o) => o.months);
  return [
    moodText(mood, clubName),
    wish ? `${wish}.` : null,
    agreed.length ? `Aceita ${lengthsText(agreed)} se o salário subir.` : null,
    refused.length ? `Por ${lengthsText(refused)}, nem conversa.` : null,
  ]
    .filter((sentence): sentence is string => !!sentence)
    .join(" ");
}
