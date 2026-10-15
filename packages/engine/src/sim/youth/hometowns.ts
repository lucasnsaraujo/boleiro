import { STATES, type State } from "@boleiro/data/clubs";

// A few of each state's biggest cities (IBGE 2022 census populations), where its clubs' academies find most kids.
const CITIES: Record<State, readonly string[]> = {
  AC: ["Rio Branco", "Cruzeiro do Sul"],
  AL: ["Maceió", "Arapiraca", "Rio Largo"],
  AP: ["Macapá", "Santana"],
  AM: ["Manaus", "Parintins", "Itacoatiara"],
  BA: ["Salvador", "Feira de Santana", "Vitória da Conquista", "Camaçari", "Juazeiro"],
  CE: ["Fortaleza", "Caucaia", "Juazeiro do Norte", "Maracanaú", "Sobral"],
  DF: ["Brasília", "Ceilândia", "Taguatinga"],
  ES: ["Serra", "Vila Velha", "Cariacica", "Vitória"],
  GO: ["Goiânia", "Aparecida de Goiânia", "Anápolis", "Rio Verde"],
  MA: ["São Luís", "Imperatriz", "São José de Ribamar"],
  MT: ["Cuiabá", "Várzea Grande", "Rondonópolis", "Sinop"],
  MS: ["Campo Grande", "Dourados", "Três Lagoas"],
  MG: ["Belo Horizonte", "Uberlândia", "Contagem", "Juiz de Fora", "Betim", "Montes Claros"],
  PA: ["Belém", "Ananindeua", "Santarém", "Marabá"],
  PB: ["João Pessoa", "Campina Grande", "Santa Rita"],
  PR: ["Curitiba", "Londrina", "Maringá", "Ponta Grossa", "Cascavel"],
  PE: ["Recife", "Jaboatão dos Guararapes", "Olinda", "Caruaru", "Petrolina"],
  PI: ["Teresina", "Parnaíba", "Picos"],
  RJ: ["Rio de Janeiro", "São Gonçalo", "Duque de Caxias", "Nova Iguaçu", "Niterói", "Belford Roxo"],
  RN: ["Natal", "Mossoró", "Parnamirim"],
  RS: ["Porto Alegre", "Caxias do Sul", "Canoas", "Pelotas", "Santa Maria"],
  RO: ["Porto Velho", "Ji-Paraná", "Ariquemes"],
  RR: ["Boa Vista", "Rorainópolis"],
  SC: ["Joinville", "Florianópolis", "Blumenau", "Chapecó", "Criciúma"],
  SP: ["São Paulo", "Guarulhos", "Campinas", "São Bernardo do Campo", "Santo André", "Osasco", "Ribeirão Preto", "Sorocaba"],
  SE: ["Aracaju", "Nossa Senhora do Socorro", "Lagarto"],
  TO: ["Palmas", "Araguaína", "Gurupi"],
};
// guess: about four kids in five come from the club's own state; the rest from anywhere in Brazil.
const HOME_STATE_SHARE = 0.8;

function pick<T>(list: readonly T[], random: () => number): T {
  const item = list[Math.floor(random() * list.length)];
  if (item === undefined) throw new Error("nothing to pick from");
  return item;
}

/** A Brazilian city a kid at a club of `state` comes from, mostly in that state. */
export function inventHometown(state: State, random: () => number): string {
  const from = random() < HOME_STATE_SHARE ? state : pick(STATES, random);
  return pick(CITIES[from], random);
}

/** The cities the game's kids from `state` come from. */
export const citiesOf = (state: State): readonly string[] => CITIES[state];
