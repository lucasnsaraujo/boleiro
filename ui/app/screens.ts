/** The 12 screens of v1. `inHub` screens are reached from the hub between rounds. */
export const SCREENS = [
  { path: "/", title: "Início", inHub: false },
  { path: "/new-game", title: "Novo jogo", inHub: false },
  { path: "/hub", title: "Clube", inHub: false },
  { path: "/round", title: "Rodada", inHub: true },
  { path: "/lineup", title: "Escalação", inHub: true },
  { path: "/tables", title: "Tabelas", inHub: true },
  { path: "/squad", title: "Elenco", inHub: true },
  { path: "/market", title: "Mercado", inHub: true },
  { path: "/finances", title: "Finanças", inHub: true },
  { path: "/calendar", title: "Calendário", inHub: true },
  { path: "/history", title: "História", inHub: true },
  { path: "/season-end", title: "Fim de temporada", inHub: true },
] as const;

export type ScreenPath = (typeof SCREENS)[number]["path"];
