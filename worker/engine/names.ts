/**
 * Names for people the engine invents (a partner met later, a baby, a new friend or colleague).
 *
 * Owner playtest (Sat Nov 7): the model reached for the same few names in session after session (a
 * girlfriend "Lin" twice in a row, "May" for another tester). Code now offers candidates instead:
 * a seeded pool per culture (seed = session id + life id + role), drawn from where the life is NOW
 * and where the person is from, never a name already in the ledger. The NOW block lists them
 * (ledger.ts nowBlock) and asks the model to pick one when someone new arrives.
 *
 * Cultures are by place (country / city), never by the user's race or ethnicity (content rule).
 */
import { hash32, rng, shuffled } from "./util";

export type Culture = "us" | "th" | "zh" | "in" | "ng" | "latam" | "de" | "ph" | "jp" | "kr" | "mixed";
export type NameRole = "partner" | "child" | "friend";

interface Pool {
  f: string[];
  m: string[];
}

// Common, everyday given names (or everyday nicknames where that is what people go by, as in
// Thailand). Deliberately left out: names the model already overuses (Lin, May, Maya, Sam, Alex,
// Elena, Mei, Leo) so a candidate list never nudges back toward them.
const POOLS: Record<Culture, Pool> = {
  us: {
    f: ["Hannah", "Megan", "Brooke", "Claire", "Jasmine", "Kayla", "Natalie", "Tessa", "Rachel", "Abby", "Lauren", "Danielle", "Paige", "Whitney", "Erin", "Jenna"],
    m: ["Tyler", "Ryan", "Marcus", "Caleb", "Evan", "Logan", "Derek", "Owen", "Nate", "Brandon", "Kyle", "Trevor", "Jordan", "Cody", "Wes", "Grant"],
  },
  th: {
    f: ["Ploy", "Fah", "Nok", "Kwan", "Mint", "Praew", "Fon", "Pim", "Aom", "Bow", "Nan", "Jum", "Gift", "Noon", "Ice", "Prang"],
    m: ["Ton", "Beam", "Golf", "Book", "Bank", "Tee", "Pond", "Arm", "Mek", "Nat", "Krit", "Win", "Oat", "Boss", "Pete", "Tor"],
  },
  zh: {
    f: ["Xinyi", "Yuting", "Jing", "Shuang", "Wenwen", "Jiayi", "Ruoxi", "Xiaoyu", "Yifan", "Peiling", "Huimin", "Qian", "Yawen", "Siqi", "Tingting", "Hsin-yi"],
    m: ["Wei", "Hao", "Jun", "Zhiwei", "Yichen", "Haoran", "Tao", "Jianguo", "Kai-wen", "Bo", "Chen", "Zixuan", "Yang", "Liang", "Ming-hsuan", "Rui"],
  },
  in: {
    f: ["Ananya", "Kavya", "Ishita", "Meera", "Diya", "Nisha", "Riya", "Shruti", "Pooja", "Aditi", "Tanvi", "Sneha", "Lakshmi", "Neha", "Anjali", "Divya"],
    m: ["Arjun", "Rohan", "Vikram", "Karan", "Aditya", "Siddharth", "Rahul", "Nikhil", "Varun", "Pranav", "Kiran", "Suresh", "Anand", "Manish", "Harsh", "Dev"],
  },
  ng: {
    f: ["Chiamaka", "Adaeze", "Funke", "Amaka", "Temitope", "Zainab", "Ifeoma", "Yetunde", "Kemi", "Ebere", "Bisola", "Halima", "Nneka", "Tolu", "Aisha", "Folake"],
    m: ["Chidi", "Emeka", "Tunde", "Femi", "Obinna", "Seun", "Ifeanyi", "Kunle", "Musa", "Dayo", "Nnamdi", "Bayo", "Uche", "Yusuf", "Gbenga", "Ikenna"],
  },
  latam: {
    f: ["Valeria", "Camila", "Daniela", "Lucía", "Mariana", "Ximena", "Sofía", "Paola", "Fernanda", "Renata", "Gabriela", "Andrea", "Carolina", "Natalia", "Alejandra", "Jimena"],
    m: ["Diego", "Mateo", "Santiago", "Andrés", "Javier", "Emiliano", "Rodrigo", "Joaquín", "Sebastián", "Tomás", "Alejandro", "Felipe", "Ricardo", "Manuel", "Iván", "Gael"],
  },
  de: {
    f: ["Lena", "Jana", "Katharina", "Miriam", "Leonie", "Franziska", "Svenja", "Johanna", "Carla", "Annika", "Theresa", "Laura", "Nele", "Sophie", "Greta", "Anja"],
    m: ["Jonas", "Lukas", "Felix", "Tobias", "Niklas", "Moritz", "Florian", "Jannik", "Sebastian", "Matthias", "Philipp", "Stefan", "Jan", "Malte", "Henrik", "Fabian"],
  },
  ph: {
    f: ["Andrea", "Bea", "Camille", "Patricia", "Kristine", "Angelica", "Joy", "Rica", "Jasmine", "Nicole", "Trisha", "Pia", "Lovely", "Czarina", "Mae", "Hazel"],
    m: ["Paolo", "Miguel", "Carlo", "Jericho", "Rafael", "Mark", "Joshua", "Enzo", "Bong", "Nico", "Andrei", "Jomar", "Dindo", "Kiko", "Ramon", "Elmer"],
  },
  jp: {
    f: ["Haruka", "Yui", "Aoi", "Misaki", "Nanami", "Saki", "Ayaka", "Mio", "Rina", "Emi", "Natsuki", "Kana", "Megumi", "Yuka", "Asuka", "Chihiro"],
    m: ["Haruto", "Ren", "Sota", "Kaito", "Yuto", "Daiki", "Riku", "Takumi", "Kenta", "Shota", "Hiroshi", "Ryota", "Kazuki", "Naoki", "Yusuke", "Tatsuya"],
  },
  kr: {
    f: ["Seoyeon", "Jiwoo", "Minji", "Hayoon", "Yuna", "Soojin", "Eunji", "Dahye", "Jisoo", "Hyejin", "Sora", "Nayeon", "Yerin", "Subin", "Hana", "Jieun"],
    m: ["Minjun", "Jihoon", "Seojun", "Hyunwoo", "Dohyun", "Taeyang", "Joon", "Sungmin", "Jaehyun", "Woojin", "Donghyun", "Kyungsoo", "Sanghoon", "Youngho", "Jinwoo", "Hoseok"],
  },
  mixed: {
    f: ["Nadia", "Ines", "Zoe", "Amara", "Lea", "Noor", "Ivy", "Rosa", "Freya", "Leila", "Mira", "Talia", "Anouk", "Selin", "Yasmin", "Eva"],
    m: ["Omar", "Luca", "Theo", "Kofi", "Rafael", "Arjun", "Felix", "Kenji", "Elias", "Nikolai", "Tariq", "Hugo", "Idris", "Mateus", "Anders", "Samir"],
  },
};

const BY_COUNTRY: Record<string, Culture> = {
  US: "us",
  TH: "th",
  CN: "zh", TW: "zh", HK: "zh", MO: "zh",
  IN: "in",
  NG: "ng",
  MX: "latam", CO: "latam", AR: "latam", PE: "latam", CL: "latam", VE: "latam", EC: "latam", GT: "latam", CU: "latam", DO: "latam", BO: "latam", UY: "latam", PY: "latam", CR: "latam", PA: "latam", SV: "latam", HN: "latam", NI: "latam", PR: "latam", ES: "latam",
  DE: "de", AT: "de", CH: "de",
  PH: "ph",
  JP: "jp",
  KR: "kr",
};

/** Countries and big cities as written in a place line ("Berlin, Germany", "Quezon City"). */
const PLACE_WORDS: [RegExp, Culture][] = [
  [/\b(united states|usa|u\.s\.|new york|los angeles|chicago|houston|seattle|boston|atlanta|denver|austin|san francisco|miami|durham|raleigh|portland|philadelphia)\b/i, "us"],
  [/\b(thailand|bangkok|chiang mai|phuket|khon kaen|pattaya)\b/i, "th"],
  [/\b(china|taiwan|hong kong|beijing|shanghai|shenzhen|guangzhou|chengdu|hangzhou|taipei|kaohsiung|taichung)\b/i, "zh"],
  [/\b(india|mumbai|delhi|bangalore|bengaluru|chennai|hyderabad|pune|kolkata|ahmedabad|jaipur|kochi)\b/i, "in"],
  [/\b(nigeria|lagos|abuja|ibadan|port harcourt|kano|enugu)\b/i, "ng"],
  [/\b(mexico|méxico|guadalajara|monterrey|colombia|bogot[aá]|medell[ií]n|argentina|buenos aires|peru|per[uú]|lima|chile|santiago|spain|madrid|barcelona|valencia|ecuador|quito|uruguay|montevideo)\b/i, "latam"],
  [/\b(germany|deutschland|berlin|munich|münchen|hamburg|frankfurt|cologne|köln|stuttgart|leipzig|austria|vienna|wien|switzerland|zurich|zürich)\b/i, "de"],
  [/\b(philippines|manila|quezon city|cebu|davao|makati|taguig|pasig)\b/i, "ph"],
  [/\b(japan|tokyo|osaka|kyoto|yokohama|fukuoka|sapporo|nagoya)\b/i, "jp"],
  [/\b(korea|seoul|busan|incheon|daegu)\b/i, "kr"],
];

export function cultureOfCountry(country: string | null | undefined): Culture {
  return BY_COUNTRY[(country ?? "").toUpperCase()] ?? "mixed";
}

/** The culture of a place line, or null when the place says nothing we know. */
export function cultureOfPlace(place: string | null | undefined): Culture | null {
  if (!place) return null;
  for (const [re, c] of PLACE_WORDS) if (re.test(place)) return c;
  return null;
}

const key = (s: string) => s.toLowerCase().replace(/[^\p{L}]+/gu, "");

/** util.rng with the FNV seed run through murmur3's finalizer first: session ids that differ by one character still spread evenly. */
function mixedRng(seed: string): () => number {
  let h = hash32(seed);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return rng(`${h >>> 0}:${seed.length}`);
}

export interface NameAsk {
  sessionId: string;
  /** Which life: the chosen one ("you" + forks taken) or a branch (its id/title). */
  lifeId: string;
  role: NameRole;
  /** ISO alpha-2 where they are from (the profile's country). */
  country: string;
  /** Where the life is now ("Berlin, Germany"). */
  place: string;
  /** Names already in the ledger (and their own first name): never offered. */
  used: Iterable<string>;
}

/**
 * Candidate names for one new person, deterministic per (session, life, role). Genders alternate
 * (f, m, f, m) so the model can pick one that fits; with a life abroad, the first pair is from
 * where they live now and the second from where they're from.
 */
export function nameCandidates(ask: NameAsk, n = 4): string[] {
  const home = cultureOfCountry(ask.country);
  const here = cultureOfPlace(ask.place) ?? home;
  const used = new Set([...ask.used].map((u) => key(u.split(/\s+/)[0] ?? u)).filter(Boolean));
  // one stream per deck, so the pairs don't move together across sessions
  const draw = (c: Culture, g: "f" | "m") => shuffled(POOLS[c][g], mixedRng(`names:${ask.sessionId}:${ask.lifeId}:${ask.role}:${c}:${g}`)).filter((x) => !used.has(key(x)));
  const order: Culture[] = here === home ? [here, here] : [here, home];
  const out: string[] = [];
  const decks = new Map<string, string[]>();
  for (let i = 0; out.length < n && i < n * 4; i++) {
    const c = order[Math.floor(out.length / 2) % order.length]!;
    const g = out.length % 2 === 0 ? "f" : "m";
    const k = `${c}:${g}`;
    if (!decks.has(k)) decks.set(k, draw(c, g));
    const deck = decks.get(k)!;
    let pick = deck.shift();
    while (pick && out.includes(pick)) pick = deck.shift();
    if (!pick) {
      // pool exhausted for that culture: the mixed pool fills in
      const alt = draw("mixed", g).filter((x) => !out.includes(x));
      pick = alt[0];
    }
    if (pick) {
      out.push(pick);
      used.add(key(pick));
    }
  }
  return out;
}
