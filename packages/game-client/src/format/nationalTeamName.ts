// The national teams' names in Portuguese, by the national-teams pack's ids.
const NAMES: Record<string, string> = {
  england: "Inglaterra", france: "França", germany: "Alemanha", spain: "Espanha", argentina: "Argentina", portugal: "Portugal",
  brazil: "Brasil", netherlands: "Holanda", norway: "Noruega", belgium: "Bélgica", morocco: "Marrocos", senegal: "Senegal",
  "ivory-coast": "Costa do Marfim", croatia: "Croácia", sweden: "Suécia", turkiye: "Turquia", switzerland: "Suíça", japan: "Japão",
  uruguay: "Uruguai", "united-states": "Estados Unidos", austria: "Áustria", colombia: "Colômbia", algeria: "Argélia", mexico: "México",
  czechia: "Tchéquia", "bosnia-herzegovina": "Bósnia", ecuador: "Equador", scotland: "Escócia", "democratic-republic-of-the-congo": "RD Congo",
  paraguay: "Paraguai", ghana: "Gana", canada: "Canadá", "south-korea": "Coreia do Sul", egypt: "Egito", uzbekistan: "Uzbequistão",
  australia: "Austrália", "cape-verde": "Cabo Verde", haiti: "Haiti", "south-africa": "África do Sul", tunisia: "Tunísia", panama: "Panamá",
  "new-zealand": "Nova Zelândia", iran: "Irã", curacao: "Curaçao", jordan: "Jordânia", "saudi-arabia": "Arábia Saudita", qatar: "Catar",
  iraq: "Iraque", venezuela: "Venezuela", chile: "Chile", peru: "Peru", bolivia: "Bolívia", italy: "Itália", denmark: "Dinamarca",
  greece: "Grécia", serbia: "Sérvia", georgia: "Geórgia", ukraine: "Ucrânia", poland: "Polônia", "republic-of-ireland": "Irlanda",
  hungary: "Hungria", slovenia: "Eslovênia", wales: "País de Gales", kosovo: "Kosovo", slovakia: "Eslováquia", "northern-ireland": "Irlanda do Norte",
  romania: "Romênia", albania: "Albânia", montenegro: "Montenegro", iceland: "Islândia", israel: "Israel", finland: "Finlândia",
  armenia: "Armênia", bulgaria: "Bulgária", "north-macedonia": "Macedônia do Norte", luxembourg: "Luxemburgo", cyprus: "Chipre",
  lithuania: "Lituânia", belarus: "Belarus", kazakhstan: "Cazaquistão", azerbaijan: "Azerbaijão", malta: "Malta", latvia: "Letônia",
  estonia: "Estônia", moldova: "Moldávia", "faroe-islands": "Ilhas Faroé", andorra: "Andorra", gibraltar: "Gibraltar",
  "san-marino": "San Marino", liechtenstein: "Liechtenstein",
};

/** A national team's name as the game shows it; one the list lacks keeps the pack's. */
export function nationalTeamName(id: string, fallback = id): string {
  return NAMES[id] ?? fallback;
}

// The article Portuguese puts before each name ("o Brasil", "os Estados Unidos", "Portugal"); left out, "a".
const ARTICLES: Record<string, "o" | "os" | "as" | ""> = {
  brazil: "o", uruguay: "o", paraguay: "o", ecuador: "o", chile: "o", peru: "o", mexico: "o", canada: "o", japan: "o", morocco: "os",
  senegal: "o", qatar: "o", iran: "o", iraq: "o", egypt: "o", haiti: "o", panama: "o", kosovo: "o", azerbaijan: "o", kazakhstan: "o",
  uzbekistan: "o", luxembourg: "o", wales: "o", "united-states": "os", "faroe-islands": "as", portugal: "", israel: "", ghana: "",
  "cape-verde": "", malta: "", andorra: "", "san-marino": "", liechtenstein: "", gibraltar: "", cyprus: "", curacao: "", montenegro: "", belarus: "",
};

/** A national team's name with its article: "o Brasil", "a Argentina", "Portugal". */
export function withArticle(id: string): string {
  const article = ARTICLES[id] ?? "a";
  return article ? `${article} ${nationalTeamName(id)}` : nationalTeamName(id);
}
