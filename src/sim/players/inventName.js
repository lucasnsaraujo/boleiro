// Common Brazilian given names and surnames, combined at random, so generated youth players get
// invented names that read as Brazilian. Some go by a single nickname, as many Brazilian players do.
const GIVEN = [
    "Gabriel", "Lucas", "Matheus", "Pedro", "Guilherme", "Rafael", "Gustavo", "Felipe", "João", "Vinícius",
    "Leonardo", "Arthur", "Bruno", "Thiago", "Eduardo", "Caio", "Daniel", "Diego", "Rodrigo", "Marcelo",
    "André", "Henrique", "Samuel", "Igor", "Davi", "Enzo", "Murilo", "Kauã", "Ryan", "Breno",
    "Luan", "Wesley", "Willian", "Everton", "Alisson", "Douglas", "Renan", "Vitor", "Yuri", "Otávio",
    "Fabrício", "Juliano", "Cauã", "Heitor", "Nicolas", "Emerson", "Anderson", "Patrick", "Kaique", "Talles",
];
const SURNAMES = [
    "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes",
    "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida", "Lopes", "Soares", "Fernandes", "Vieira", "Barbosa",
    "Rocha", "Dias", "Nascimento", "Andrade", "Moreira", "Nunes", "Marques", "Machado", "Mendes", "Freitas",
    "Cardoso", "Ramos", "Gonçalves", "Santana", "Teixeira", "Moura", "Cavalcanti", "Batista", "Pinheiro", "Campos",
    "Araújo", "Monteiro", "Correia", "Rezende", "Brito", "Farias", "Sales", "Bezerra", "Queiroz", "Tavares",
];
const NICKNAMES = [
    "Juninho", "Dudu", "Pepê", "Tchê", "Biel", "Netinho", "Kaká", "Léo", "Zé Vitor", "Gui",
    "Nenê", "Bruninho", "Tiquinho", "Matheuzinho", "Danilinho", "Pedrinho", "Luizão", "Didi", "Paulinho", "Rafinha",
];
// guess: share of generated players who go by a nickname.
const NICKNAME_SHARE = 0.15;
function pick(list, random) {
    return list[Math.floor(random() * list.length)] ?? "";
}
export function inventName(random) {
    if (random() < NICKNAME_SHARE)
        return pick(NICKNAMES, random);
    return `${pick(GIVEN, random)} ${pick(SURNAMES, random)}`;
}
