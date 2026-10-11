/** The 11 screens of v1; the coach sets his eleven on the round screen before kick-off. `inBar` screens are in the navigation bar, which shows on those screens only. */
export const SCREENS = [
  { path: "/", title: "Início", inBar: false },
  { path: "/new-game", title: "Novo jogo", inBar: false },
  { path: "/hub", title: "Clube", inBar: true },
  { path: "/round", title: "Rodada", inBar: false },
  { path: "/tables", title: "Tabelas", inBar: true },
  { path: "/squad", title: "Elenco", inBar: true },
  { path: "/market", title: "Mercado", inBar: true },
  { path: "/finances", title: "Finanças", inBar: true },
  { path: "/calendar", title: "Calendário", inBar: true },
  { path: "/history", title: "História", inBar: true },
  { path: "/season-end", title: "Fim de temporada", inBar: false },
] as const;

export type ScreenPath = (typeof SCREENS)[number]["path"];

export const BAR_SCREENS = SCREENS.filter((screen) => screen.inBar);
