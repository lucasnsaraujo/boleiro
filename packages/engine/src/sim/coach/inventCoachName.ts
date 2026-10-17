import { COACH_ROSTER } from "@boleiro/data/coachRoster";
import { inventName } from "../players/inventName.js";

// Common given names and surnames by language, combined at random, so the coaches the game invents
// for clubs without a real one read as local. Invented: no real coach is meant.
const NAMES = {
  es: {
    given: ["Juan", "Carlos", "José", "Luis", "Miguel", "Diego", "Javier", "Sergio", "Pablo", "Andrés", "Fernando", "Ricardo", "Gustavo", "Martín", "Alejandro", "Raúl"],
    surnames: ["García", "Fernández", "González", "Rodríguez", "López", "Martínez", "Sánchez", "Pérez", "Gómez", "Díaz", "Romero", "Álvarez", "Torres", "Ruiz", "Medina", "Herrera"],
  },
  pt: {
    given: ["João", "Rui", "Nuno", "Paulo", "Pedro", "Jorge", "Luís", "Ricardo", "Bruno", "Vítor", "Hugo", "Sérgio", "Tiago", "Filipe", "Miguel", "Carlos"],
    surnames: ["Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa", "Rodrigues", "Martins", "Sousa", "Fernandes", "Gonçalves", "Lopes", "Marques", "Almeida", "Ribeiro", "Pinto"],
  },
  en: {
    given: ["James", "John", "Paul", "Mark", "Steve", "Gary", "Neil", "Chris", "Michael", "David", "Andy", "Ian", "Scott", "Graham", "Kevin", "Darren"],
    surnames: ["Smith", "Jones", "Taylor", "Brown", "Wilson", "Evans", "Thomas", "Johnson", "Roberts", "Walker", "Wright", "Robinson", "Thompson", "Hughes", "Clarke", "McAllister"],
  },
  it: {
    given: ["Marco", "Luca", "Giuseppe", "Antonio", "Roberto", "Stefano", "Alessandro", "Paolo", "Andrea", "Francesco", "Massimo", "Claudio", "Davide", "Fabio", "Simone", "Gianluca"],
    surnames: ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Mancini", "Lombardi"],
  },
  de: {
    given: ["Thomas", "Michael", "Andreas", "Stefan", "Markus", "Christian", "Frank", "Jürgen", "Peter", "Uwe", "Matthias", "Oliver", "Sven", "Florian", "Tobias", "Dirk"],
    surnames: ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Schulz", "Hoffmann", "Koch", "Richter", "Klein", "Wolf", "Neumann", "Krüger"],
  },
  fr: {
    given: ["Jean", "Pierre", "Michel", "Philippe", "Alain", "Laurent", "Christophe", "Olivier", "Frédéric", "Stéphane", "Thierry", "Didier", "Patrick", "Nicolas", "Julien", "Franck"],
    surnames: ["Martin", "Bernard", "Dubois", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Michel", "Garcia", "Roux", "Fournier", "Girard", "Bonnet", "Mercier"],
  },
  nl: {
    given: ["Jan", "Peter", "Erik", "Frank", "Ronald", "Marco", "Dick", "Henk", "Kees", "Ruud", "Arno", "Joost", "Bart", "Wim", "Pieter", "Dennis"],
    surnames: ["de Jong", "Jansen", "de Vries", "van den Berg", "Bakker", "Visser", "Smit", "Meijer", "de Boer", "Mulder", "Bos", "Vos", "Peters", "Hendriks", "Dekker", "Willems"],
  },
  tr: {
    given: ["Mehmet", "Mustafa", "Ahmet", "Ali", "Hüseyin", "Hasan", "Ömer", "Murat", "Emre", "Serkan", "Hakan", "Burak", "Tolga", "Volkan", "Okan", "Ersun"],
    surnames: ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Yıldırım", "Öztürk", "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Kurt"],
  },
  el: {
    given: ["Giorgos", "Dimitris", "Nikos", "Kostas", "Giannis", "Christos", "Vasilis", "Panagiotis", "Michalis", "Thanasis", "Stelios", "Sotiris", "Takis", "Andreas", "Marinos", "Savvas"],
    surnames: ["Papadopoulos", "Georgiou", "Nikolaou", "Ioannou", "Konstantinou", "Christodoulou", "Pappas", "Vlachos", "Angelopoulos", "Makris", "Dimitriou", "Karagiannis", "Oikonomou", "Antoniou", "Theodorou", "Michail"],
  },
  slav: {
    given: ["Marek", "Tomasz", "Piotr", "Jan", "Pavel", "Martin", "Petr", "Ivan", "Dragan", "Zoran", "Goran", "Andriy", "Oleksandr", "Mykola", "Robert", "Dejan"],
    surnames: ["Nowak", "Kowalski", "Wiśniewski", "Novák", "Svoboda", "Dvořák", "Horvat", "Kovačević", "Babić", "Marić", "Petrović", "Shevchenko", "Kovalenko", "Bondarenko", "Krajnc", "Hrubý"],
  },
  hu: {
    given: ["László", "István", "József", "Zoltán", "Gábor", "Péter", "Tamás", "Attila", "Sándor", "Ferenc", "Csaba", "Balázs", "Zsolt", "Imre", "Gyula", "Krisztián"],
    surnames: ["Nagy", "Kovács", "Tóth", "Szabó", "Horváth", "Varga", "Kiss", "Molnár", "Németh", "Farkas", "Balogh", "Papp", "Takács", "Juhász", "Lakatos", "Mészáros"],
  },
  bg: {
    given: ["Georgi", "Ivan", "Dimitar", "Nikolay", "Stoyan", "Petar", "Hristo", "Krasimir", "Lyubomir", "Plamen", "Todor", "Stanimir", "Angel", "Emil", "Valentin", "Yordan"],
    surnames: ["Ivanov", "Georgiev", "Dimitrov", "Petrov", "Nikolov", "Hristov", "Stoyanov", "Todorov", "Iliev", "Angelov", "Kolev", "Marinov", "Yordanov", "Popov", "Stefanov", "Vasilev"],
  },
  no: {
    given: ["Ole", "Lars", "Erik", "Kjetil", "Bjørn", "Per", "Morten", "Rune", "Knut", "Tor", "Håkon", "Eirik", "Ronny", "Kåre", "Ståle", "Jan Erik"],
    surnames: ["Hansen", "Johansen", "Olsen", "Larsen", "Andersen", "Pedersen", "Nilsen", "Kristiansen", "Jensen", "Karlsen", "Johnsen", "Pettersen", "Eriksen", "Berg", "Haugen", "Hagen"],
  },
  ar: {
    given: ["Mohammed", "Ahmed", "Khalid", "Abdullah", "Omar", "Youssef", "Hassan", "Ali", "Saad", "Faisal", "Tarek", "Karim", "Nabil", "Hossam", "Walid", "Hamad"],
    surnames: ["Al-Harbi", "Al-Otaibi", "Al-Qahtani", "Al-Shehri", "El-Sayed", "Hassan", "Mansour", "Ibrahim", "Khalil", "Saleh", "Abdelrahman", "Farouk", "Haddad", "Nasser", "Ben Ali", "Trabelsi"],
  },
  he: {
    given: ["Yossi", "Avi", "Moshe", "Eli", "Ronen", "Guy", "Itzik", "Barak", "Nir", "Dror", "Amir", "Shlomi", "Eyal", "Oren", "Yaniv", "Tal"],
    surnames: ["Cohen", "Levi", "Mizrahi", "Peretz", "Biton", "Dahan", "Avraham", "Friedman", "Azoulay", "Malka", "Katz", "Ben-David", "Shapira", "Golan", "Haim", "Amar"],
  },
  hy: {
    given: ["Armen", "Aram", "Tigran", "Hayk", "Gor", "Vardan", "Karen", "Artur", "Sargis", "Levon", "Ashot", "Davit", "Gevorg", "Rafael", "Edgar", "Arsen"],
    surnames: ["Petrosyan", "Hovhannisyan", "Sargsyan", "Grigoryan", "Harutyunyan", "Khachatryan", "Hakobyan", "Vardanyan", "Karapetyan", "Mkrtchyan", "Gasparyan", "Avetisyan", "Poghosyan", "Ghazaryan", "Manukyan", "Arakelyan"],
  },
  az: {
    given: ["Elvin", "Rashad", "Tural", "Kamran", "Vugar", "Ramil", "Anar", "Farid", "Orkhan", "Elnur", "Samir", "Ilgar", "Javid", "Rauf", "Nijat", "Emin"],
    surnames: ["Mammadov", "Aliyev", "Huseynov", "Hasanov", "Guliyev", "Ismayilov", "Abdullayev", "Rzayev", "Karimov", "Babayev", "Jafarov", "Ahmadov", "Valiyev", "Mustafayev", "Sadigov", "Nasirov"],
  },
  ja: {
    given: ["Takeshi", "Hiroshi", "Kenji", "Masaki", "Daisuke", "Yuji", "Kazuki", "Shinji", "Tatsuya", "Naoki", "Ryota", "Akira", "Kenta", "Satoshi", "Yoshinori", "Toru"],
    surnames: ["Sato", "Suzuki", "Takahashi", "Tanaka", "Watanabe", "Ito", "Yamamoto", "Nakamura", "Kobayashi", "Kato", "Yoshida", "Yamada", "Sasaki", "Matsumoto", "Inoue", "Kimura"],
  },
  ko: {
    given: ["Min-jun", "Seo-jun", "Ji-ho", "Hyun-woo", "Dong-hyun", "Sung-min", "Jae-hyun", "Young-ho", "Sang-woo", "Jin-soo", "Kyung-ho", "Tae-yong", "Byung-ho", "Jong-hoon", "Hong-chul", "Seung-woo"],
    surnames: ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon", "Jang", "Lim", "Han", "Oh", "Seo", "Shin", "Kwon", "Hwang"],
  },
} as const satisfies Record<string, { given: readonly string[]; surnames: readonly string[] }>;

type Language = keyof typeof NAMES | "br";

/** Each country of the game: the language its invented coaches' names come in and the nationality they get, as Transfermarkt writes it. */
const COUNTRIES: Record<string, { language: Language; nationality: string }> = {
  br: { language: "br", nationality: "Brazil" },
  ar: { language: "es", nationality: "Argentina" },
  bo: { language: "es", nationality: "Bolivia" },
  cl: { language: "es", nationality: "Chile" },
  co: { language: "es", nationality: "Colombia" },
  ec: { language: "es", nationality: "Ecuador" },
  py: { language: "es", nationality: "Paraguay" },
  pe: { language: "es", nationality: "Peru" },
  uy: { language: "es", nationality: "Uruguay" },
  ve: { language: "es", nationality: "Venezuela" },
  mx: { language: "es", nationality: "Mexico" },
  es: { language: "es", nationality: "Spain" },
  pt: { language: "pt", nationality: "Portugal" },
  "gb-eng": { language: "en", nationality: "England" },
  "gb-sct": { language: "en", nationality: "Scotland" },
  us: { language: "en", nationality: "United States" },
  nz: { language: "en", nationality: "New Zealand" },
  za: { language: "en", nationality: "South Africa" },
  it: { language: "it", nationality: "Italy" },
  de: { language: "de", nationality: "Germany" },
  at: { language: "de", nationality: "Austria" },
  fr: { language: "fr", nationality: "France" },
  be: { language: "nl", nationality: "Belgium" },
  nl: { language: "nl", nationality: "Netherlands" },
  tr: { language: "tr", nationality: "Türkiye" },
  gr: { language: "el", nationality: "Greece" },
  cy: { language: "el", nationality: "Cyprus" },
  cz: { language: "slav", nationality: "Czech Republic" },
  sk: { language: "slav", nationality: "Slovakia" },
  pl: { language: "slav", nationality: "Poland" },
  hr: { language: "slav", nationality: "Croatia" },
  si: { language: "slav", nationality: "Slovenia" },
  ua: { language: "slav", nationality: "Ukraine" },
  hu: { language: "hu", nationality: "Hungary" },
  bg: { language: "bg", nationality: "Bulgaria" },
  no: { language: "no", nationality: "Norway" },
  sa: { language: "ar", nationality: "Saudi Arabia" },
  ae: { language: "ar", nationality: "United Arab Emirates" },
  eg: { language: "ar", nationality: "Egypt" },
  ma: { language: "fr", nationality: "Morocco" },
  tn: { language: "ar", nationality: "Tunisia" },
  il: { language: "he", nationality: "Israel" },
  am: { language: "hy", nationality: "Armenia" },
  az: { language: "az", nationality: "Azerbaijan" },
  jp: { language: "ja", nationality: "Japan" },
  kr: { language: "ko", nationality: "Korea, South" },
};

function pick(list: readonly string[], random: () => number): string {
  return list[Math.floor(random() * list.length)] ?? "";
}

const REAL_NAMES = new Set(Object.values(COACH_ROSTER).map((coach) => coach.name));
// A draw that keeps landing on real coaches' names gives up after this many and keeps the last.
const REDRAWS = 20;

/** An invented coach for a club of `country` (a country id of the game, "br" for Brazil): a local name no real coach in Transfermarkt's lists has, and a nationality. */
export function inventCoachName(country: string, random: () => number): { name: string; nationality: string } {
  const { language, nationality } = COUNTRIES[country] ?? { language: "en", nationality: "England" };
  const draw = () => {
    if (language === "br") return inventName(random);
    const names = NAMES[language];
    return `${pick(names.given, random)} ${pick(names.surnames, random)}`;
  };
  let name = draw();
  for (let tries = 1; tries < REDRAWS && REAL_NAMES.has(name); tries++) name = draw();
  return { name, nationality };
}
