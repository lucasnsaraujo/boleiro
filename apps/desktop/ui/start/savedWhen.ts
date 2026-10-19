const TIME = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const WEEKDAY = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
const DAY_MONTH = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });

const DAY_MS = 86_400_000;
// A save from up to six days ago is still "this week": its weekday can't be mistaken for next week's.
const WEEK_DAYS = 6;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** When a game was saved, in the coach's own clock: "hoje, 21:42", "sexta, 18:05", "3 out". */
export function savedWhen(savedAt: string, now: Date): string {
  const saved = new Date(savedAt);
  const daysAgo = Math.round((startOfDay(now) - startOfDay(saved)) / DAY_MS);
  if (daysAgo === 0) return `hoje, ${TIME.format(saved)}`;
  if (daysAgo === 1) return `ontem, ${TIME.format(saved)}`;
  if (daysAgo > 1 && daysAgo <= WEEK_DAYS) return `${WEEKDAY.format(saved).replace("-feira", "")}, ${TIME.format(saved)}`;
  const day = DAY_MONTH.format(saved).replace(" de ", " ").replace(".", "");
  return saved.getFullYear() === now.getFullYear() ? day : `${day} ${saved.getFullYear()}`;
}
