/**
 * Display currencies. The engine computes every number in USD (the base rates are US, D-008); the
 * UI shows money in the user's own currency, converted at a small fixed table, with "≈ $X" on
 * hover. Profile extraction converts what users say in their currency to USD with the same table.
 * Pure, no dependencies: used by shared/sim.ts, shared/schema.ts, worker/ and src/.
 */

/** Rates are approximate and fixed: good enough for a projection, never for a transaction. */
export const RATES_AS_OF = "approx., Nov 2026";

export const CURRENCY_CODES = ["USD", "THB", "EUR", "GBP", "JPY", "CNY", "INR", "KRW", "SGD", "VND", "IDR", "PHP", "MXN", "BRL", "CAD", "AUD", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "TRY", "ILS", "AED", "SAR", "EGP", "NGN", "KES", "ZAR", "GHS", "PKR", "BDT", "LKR", "MYR", "TWD", "HKD", "NZD", "ARS", "CLP", "COP", "PEN", "UAH"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  /** Units of this currency per 1 USD. */
  perUsd: number;
  /** "Thai baht" */
  name: string;
  /** For "today's ___": "baht", "dollars". */
  noun: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  USD: { code: "USD", symbol: "$", perUsd: 1, name: "US dollar", noun: "dollars" },
  THB: { code: "THB", symbol: "฿", perUsd: 35.3, name: "Thai baht", noun: "baht" },
  EUR: { code: "EUR", symbol: "€", perUsd: 0.92, name: "Euro", noun: "euros" },
  GBP: { code: "GBP", symbol: "£", perUsd: 0.78, name: "British pound", noun: "pounds" },
  JPY: { code: "JPY", symbol: "¥", perUsd: 150, name: "Japanese yen", noun: "yen" },
  CNY: { code: "CNY", symbol: "CN¥", perUsd: 7.2, name: "Chinese yuan", noun: "yuan" },
  INR: { code: "INR", symbol: "₹", perUsd: 84, name: "Indian rupee", noun: "rupees" },
  KRW: { code: "KRW", symbol: "₩", perUsd: 1380, name: "Korean won", noun: "won" },
  SGD: { code: "SGD", symbol: "S$", perUsd: 1.34, name: "Singapore dollar", noun: "Singapore dollars" },
  VND: { code: "VND", symbol: "₫", perUsd: 25400, name: "Vietnamese dong", noun: "dong" },
  IDR: { code: "IDR", symbol: "Rp", perUsd: 16000, name: "Indonesian rupiah", noun: "rupiah" },
  PHP: { code: "PHP", symbol: "₱", perUsd: 57, name: "Philippine peso", noun: "pesos" },
  MXN: { code: "MXN", symbol: "MX$", perUsd: 19, name: "Mexican peso", noun: "pesos" },
  BRL: { code: "BRL", symbol: "R$", perUsd: 5.6, name: "Brazilian real", noun: "reais" },
  CAD: { code: "CAD", symbol: "CA$", perUsd: 1.38, name: "Canadian dollar", noun: "Canadian dollars" },
  AUD: { code: "AUD", symbol: "A$", perUsd: 1.52, name: "Australian dollar", noun: "Australian dollars" },
  CHF: { code: "CHF", symbol: "CHF ", perUsd: 0.88, name: "Swiss franc", noun: "francs" },
  SEK: { code: "SEK", symbol: "SEK ", perUsd: 10.5, name: "Swedish krona", noun: "kronor" },
  NOK: { code: "NOK", symbol: "NOK ", perUsd: 10.8, name: "Norwegian krone", noun: "kroner" },
  DKK: { code: "DKK", symbol: "DKK ", perUsd: 6.9, name: "Danish krone", noun: "kroner" },
  PLN: { code: "PLN", symbol: "zł", perUsd: 3.9, name: "Polish złoty", noun: "złoty" },
  CZK: { code: "CZK", symbol: "Kč", perUsd: 23, name: "Czech koruna", noun: "koruna" },
  HUF: { code: "HUF", symbol: "Ft", perUsd: 365, name: "Hungarian forint", noun: "forint" },
  TRY: { code: "TRY", symbol: "₺", perUsd: 42, name: "Turkish lira", noun: "lira" },
  ILS: { code: "ILS", symbol: "₪", perUsd: 3.7, name: "Israeli shekel", noun: "shekels" },
  AED: { code: "AED", symbol: "AED ", perUsd: 3.67, name: "UAE dirham", noun: "dirhams" },
  SAR: { code: "SAR", symbol: "SAR ", perUsd: 3.75, name: "Saudi riyal", noun: "riyals" },
  EGP: { code: "EGP", symbol: "E£", perUsd: 49, name: "Egyptian pound", noun: "pounds" },
  NGN: { code: "NGN", symbol: "₦", perUsd: 1550, name: "Nigerian naira", noun: "naira" },
  KES: { code: "KES", symbol: "KSh", perUsd: 129, name: "Kenyan shilling", noun: "shillings" },
  ZAR: { code: "ZAR", symbol: "ZAR ", perUsd: 18, name: "South African rand", noun: "rand" },
  GHS: { code: "GHS", symbol: "GH₵", perUsd: 15, name: "Ghanaian cedi", noun: "cedis" },
  PKR: { code: "PKR", symbol: "PKR ", perUsd: 280, name: "Pakistani rupee", noun: "rupees" },
  BDT: { code: "BDT", symbol: "৳", perUsd: 120, name: "Bangladeshi taka", noun: "taka" },
  LKR: { code: "LKR", symbol: "LKR ", perUsd: 300, name: "Sri Lankan rupee", noun: "rupees" },
  MYR: { code: "MYR", symbol: "RM", perUsd: 4.4, name: "Malaysian ringgit", noun: "ringgit" },
  TWD: { code: "TWD", symbol: "NT$", perUsd: 32, name: "New Taiwan dollar", noun: "NT dollars" },
  HKD: { code: "HKD", symbol: "HK$", perUsd: 7.8, name: "Hong Kong dollar", noun: "HK dollars" },
  NZD: { code: "NZD", symbol: "NZ$", perUsd: 1.7, name: "New Zealand dollar", noun: "NZ dollars" },
  ARS: { code: "ARS", symbol: "AR$", perUsd: 1300, name: "Argentine peso", noun: "pesos" },
  CLP: { code: "CLP", symbol: "CLP$", perUsd: 940, name: "Chilean peso", noun: "pesos" },
  COP: { code: "COP", symbol: "COL$", perUsd: 4100, name: "Colombian peso", noun: "pesos" },
  PEN: { code: "PEN", symbol: "S/", perUsd: 3.75, name: "Peruvian sol", noun: "soles" },
  UAH: { code: "UAH", symbol: "₴", perUsd: 41, name: "Ukrainian hryvnia", noun: "hryvnias" },
};

const EURO = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"];
const BY_COUNTRY: Record<string, CurrencyCode> = {
  TH: "THB", GB: "GBP", JP: "JPY", CN: "CNY", IN: "INR", KR: "KRW", SG: "SGD", VN: "VND", ID: "IDR", PH: "PHP", MX: "MXN", BR: "BRL", CA: "CAD", AU: "AUD",
  CH: "CHF", LI: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", TR: "TRY", IL: "ILS", AE: "AED", SA: "SAR", EG: "EGP", NG: "NGN", KE: "KES", ZA: "ZAR", GH: "GHS", PK: "PKR", BD: "BDT", LK: "LKR", MY: "MYR", TW: "TWD", HK: "HKD", NZ: "NZD", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN", UA: "UAH",
  ...Object.fromEntries(EURO.map((c) => [c, "EUR" as const])),
};

export const isCurrency = (c: unknown): c is CurrencyCode => typeof c === "string" && (CURRENCY_CODES as readonly string[]).includes(c);

/** The currency of the country they live in (ISO alpha-2); USD when we don't have it. */
export const currencyForCountry = (country: string | null | undefined): CurrencyCode => BY_COUNTRY[(country ?? "").toUpperCase()] ?? "USD";

const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "),
);
const COUNTRY_WORDS: Record<string, CurrencyCode> = {
  thailand: "THB", japan: "JPY", "united kingdom": "GBP", uk: "GBP", england: "GBP", scotland: "GBP", wales: "GBP", china: "CNY", india: "INR",
  korea: "KRW", "south korea": "KRW", singapore: "SGD", vietnam: "VND", "viet nam": "VND", indonesia: "IDR", philippines: "PHP", mexico: "MXN",
  brazil: "BRL", canada: "CAD", australia: "AUD", germany: "EUR", france: "EUR", spain: "EUR", portugal: "EUR", italy: "EUR", netherlands: "EUR",
  ireland: "EUR", belgium: "EUR", austria: "EUR", finland: "EUR", greece: "EUR", usa: "USD", us: "USD", "united states": "USD", america: "USD",
  "switzerland": "CHF", "sweden": "SEK", "norway": "NOK", "denmark": "DKK", "poland": "PLN", "czechia": "CZK", "czech republic": "CZK", "hungary": "HUF", "turkey": "TRY", "türkiye": "TRY", "turkiye": "TRY", "israel": "ILS", "uae": "AED", "united arab emirates": "AED", "saudi arabia": "SAR", "egypt": "EGP", "nigeria": "NGN", "kenya": "KES", "south africa": "ZAR", "ghana": "GHS", "pakistan": "PKR", "bangladesh": "BDT", "sri lanka": "LKR", "malaysia": "MYR", "taiwan": "TWD", "hong kong": "HKD", "new zealand": "NZD", "argentina": "ARS", "chile": "CLP", "colombia": "COP", "peru": "PEN", "ukraine": "UAH",
};
const CITY_WORDS: Record<string, CurrencyCode> = {
  bangkok: "THB", "chiang mai": "THB", phuket: "THB", tokyo: "JPY", osaka: "JPY", kyoto: "JPY", london: "GBP", manchester: "GBP", edinburgh: "GBP",
  singapore: "SGD", seoul: "KRW", busan: "KRW", shanghai: "CNY", beijing: "CNY", shenzhen: "CNY", mumbai: "INR", delhi: "INR", "new delhi": "INR",
  bangalore: "INR", bengaluru: "INR", hanoi: "VND", "ho chi minh city": "VND", jakarta: "IDR", bali: "IDR", manila: "PHP", "mexico city": "MXN",
  "são paulo": "BRL", "sao paulo": "BRL", "rio de janeiro": "BRL", toronto: "CAD", vancouver: "CAD", montreal: "CAD", sydney: "AUD", melbourne: "AUD",
  berlin: "EUR", paris: "EUR", madrid: "EUR", barcelona: "EUR", lisbon: "EUR", rome: "EUR", milan: "EUR", amsterdam: "EUR", dublin: "EUR",
  "zurich": "CHF", "geneva": "CHF", "basel": "CHF", "lausanne": "CHF", "stockholm": "SEK", "gothenburg": "SEK", "malmö": "SEK", "malmo": "SEK", "oslo": "NOK", "bergen": "NOK", "copenhagen": "DKK", "aarhus": "DKK", "warsaw": "PLN", "krakow": "PLN", "kraków": "PLN", "wroclaw": "PLN", "prague": "CZK", "brno": "CZK", "budapest": "HUF", "istanbul": "TRY", "ankara": "TRY", "izmir": "TRY", "tel aviv": "ILS", "jerusalem": "ILS", "haifa": "ILS", "dubai": "AED", "abu dhabi": "AED", "sharjah": "AED", "riyadh": "SAR", "jeddah": "SAR", "cairo": "EGP", "alexandria": "EGP", "lagos": "NGN", "abuja": "NGN", "ibadan": "NGN", "nairobi": "KES", "mombasa": "KES", "johannesburg": "ZAR", "cape town": "ZAR", "durban": "ZAR", "pretoria": "ZAR", "accra": "GHS", "kumasi": "GHS", "karachi": "PKR", "lahore": "PKR", "islamabad": "PKR", "dhaka": "BDT", "chittagong": "BDT", "colombo": "LKR", "kandy": "LKR", "kuala lumpur": "MYR", "penang": "MYR", "johor bahru": "MYR", "taipei": "TWD", "kaohsiung": "TWD", "taichung": "TWD", "hong kong": "HKD", "auckland": "NZD", "wellington": "NZD", "christchurch": "NZD", "buenos aires": "ARS", "córdoba": "ARS", "cordoba": "ARS", "rosario": "ARS", "santiago": "CLP", "valparaíso": "CLP", "valparaiso": "CLP", "bogotá": "COP", "bogota": "COP", "medellín": "COP", "medellin": "COP", "cali": "COP", "lima": "PEN", "cusco": "PEN", "arequipa": "PEN", "kyiv": "UAH", "kiev": "UAH", "lviv": "UAH", "odesa": "UAH", "kharkiv": "UAH",
};

/** The currency of a simulated place ("Bangkok, Thailand", "Durham, NC, US"); null when we can't tell. */
export function currencyForPlace(place: string | null | undefined): CurrencyCode | null {
  const parts = (place ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const raw of [...parts].reverse()) {
    const p = raw.toLowerCase();
    if (COUNTRY_WORDS[p]) return COUNTRY_WORDS[p]!;
    if (/^[A-Za-z]{2}$/.test(raw)) {
      const up = raw.toUpperCase();
      if (US_STATES.has(up)) return "USD"; // "Austin, TX" is Texas, not a country code
      if (BY_COUNTRY[up]) return BY_COUNTRY[up]!;
    }
  }
  return CITY_WORDS[(parts[0] ?? "").toLowerCase()] ?? null;
}

/** What the UI shows money in: their pick, else the country's currency. */
export const displayCurrency = (p: { currency?: string | null; country?: string | null } | null | undefined): CurrencyCode =>
  isCurrency(p?.currency) ? p.currency : currencyForCountry(p?.country);

export const toLocal = (usd: number, code: CurrencyCode) => usd * CURRENCIES[code].perUsd;
export const toUsd = (amount: number, code: CurrencyCode) => amount / CURRENCIES[code].perUsd;

/** "฿3.00M", "€41,400", "$85,000"; short: "฿3.0M", "$85k". */
export function formatMoney(usd: number, code: CurrencyCode = "USD", short = false): string {
  const c = CURRENCIES[code];
  const v = toLocal(usd, code);
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}${c.symbol}${(a / 1e9).toFixed(a >= 1e10 || short ? 1 : 2)}B`;
  if (a >= 1e6) return `${sign}${c.symbol}${(a / 1e6).toFixed(a >= 1e7 || short ? 1 : 2)}M`;
  if (short && a >= 1e3) return `${sign}${c.symbol}${Math.round(a / 1e3)}k`;
  return `${sign}${c.symbol}${Math.round(a).toLocaleString("en-US")}`;
}

/** The hover hint for a local amount: "≈ $85,000" (null when it's already USD). */
export const usdHint = (usd: number, code: CurrencyCode): string | null => (code === "USD" ? null : `≈ ${formatMoney(usd, "USD")} (${RATES_AS_OF})`);

// ---------------------------------------------------------------------------------------------
// Reading amounts people write: "3 million baht", "฿3M", "THB 50m", "$28k", "€40,000"
// ---------------------------------------------------------------------------------------------

const WORDS: [RegExp, CurrencyCode | "DOLLAR" | "PESO" | "YEN"][] = [
  [/^(baht|thb)$/i, "THB"],
  [/^(euros?|eur)$/i, "EUR"],
  [/^(pounds?|quid|gbp)$/i, "GBP"],
  [/^(yen|jpy)$/i, "JPY"],
  [/^(yuan|rmb|renminbi|cny)$/i, "CNY"],
  [/^(rupees?|rs\.?|inr)$/i, "INR"],
  [/^(won|krw)$/i, "KRW"],
  [/^(sgd|singapore dollars?)$/i, "SGD"],
  [/^(dong|vnd)$/i, "VND"],
  [/^(rupiah|idr)$/i, "IDR"],
  [/^(php)$/i, "PHP"],
  [/^(mxn)$/i, "MXN"],
  [/^(reais|real|brl)$/i, "BRL"],
  [/^(cad|canadian dollars?)$/i, "CAD"],
  [/^(aud|australian dollars?)$/i, "AUD"],
  [/^(francs?|chf)$/i, "CHF"],
  [/^(kronor|krona|sek)$/i, "SEK"],
  [/^(nok|norwegian kroner?)$/i, "NOK"],
  [/^(dkk|danish kroner?)$/i, "DKK"],
  [/^(zloty|złoty|zlotys|pln)$/i, "PLN"],
  [/^(koruna|korun|czk)$/i, "CZK"],
  [/^(forints?|huf)$/i, "HUF"],
  [/^(lira|try)$/i, "TRY"],
  [/^(shekels?|nis|ils)$/i, "ILS"],
  [/^(dirhams?|aed)$/i, "AED"],
  [/^(riyals?|sar)$/i, "SAR"],
  [/^(egp|egyptian pounds?)$/i, "EGP"],
  [/^(naira|ngn)$/i, "NGN"],
  [/^(kes|ksh|kenyan shillings?)$/i, "KES"],
  [/^(rand|zar)$/i, "ZAR"],
  [/^(cedis?|ghs)$/i, "GHS"],
  [/^(pkr|pakistani rupees?)$/i, "PKR"],
  [/^(taka|bdt)$/i, "BDT"],
  [/^(lkr|sri lankan rupees?)$/i, "LKR"],
  [/^(ringgit|myr)$/i, "MYR"],
  [/^(twd|nt dollars?|ntd)$/i, "TWD"],
  [/^(hkd|hk dollars?)$/i, "HKD"],
  [/^(nzd|nz dollars?)$/i, "NZD"],
  [/^(ars|argentine pesos?)$/i, "ARS"],
  [/^(clp|chilean pesos?)$/i, "CLP"],
  [/^(cop|colombian pesos?)$/i, "COP"],
  [/^(soles|sol|pen)$/i, "PEN"],
  [/^(hryvnias?|uah)$/i, "UAH"],
  [/^(usd|us dollars?|bucks)$/i, "USD"],
  [/^dollars?$/i, "DOLLAR"],
  [/^pesos?$/i, "PESO"],
];
const SYMBOLS: [string, CurrencyCode | "DOLLAR" | "YEN"][] = [
  ["NT$", "TWD"], ["HK$", "HKD"], ["NZ$", "NZD"], ["AR$", "ARS"], ["CLP$", "CLP"], ["COL$", "COP"], ["GH₵", "GHS"], ["KSh", "KES"], ["E£", "EGP"], ["zł", "PLN"], ["Kč", "CZK"], ["₺", "TRY"], ["₪", "ILS"], ["₦", "NGN"], ["৳", "BDT"], ["₴", "UAH"], ["RM", "MYR"], ["CA$", "CAD"], ["C$", "CAD"], ["A$", "AUD"], ["S$", "SGD"], ["MX$", "MXN"], ["R$", "BRL"], ["CN¥", "CNY"], ["US$", "USD"],
  ["฿", "THB"], ["€", "EUR"], ["£", "GBP"], ["₹", "INR"], ["₩", "KRW"], ["₫", "VND"], ["₱", "PHP"], ["Rp", "IDR"], ["¥", "YEN"], ["$", "DOLLAR"],
];
const SCALE: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, mil: 1e6, million: 1e6, millions: 1e6, b: 1e9, bn: 1e9, billion: 1e9, lakh: 1e5, lakhs: 1e5, crore: 1e7, crores: 1e7 };

const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const SC = String.raw`(?:\s?(k|m|mn|mil|millions?|b|bn|billion|thousand|lakhs?|crores?)\b)?`;
const CUR_WORD = String.raw`(baht|thb|euros?|eur|pounds?|quid|gbp|yen|jpy|yuan|rmb|renminbi|cny|rupees?|inr|won|krw|sgd|singapore dollars?|dong|vnd|rupiah|idr|pesos?|php|mxn|reais|real|brl|cad|canadian dollars?|aud|australian dollars?|usd|us dollars?|dollars?|bucks)\b`;
const SYM = String.raw`(CA\$|C\$|A\$|S\$|MX\$|R\$|CN¥|US\$|฿|€|£|₹|₩|₫|₱|Rp|¥|\$)`;
const CODE_FIRST = String.raw`\b(THB|EUR|GBP|JPY|CNY|INR|KRW|SGD|VND|IDR|PHP|MXN|BRL|CAD|AUD|USD)\s?`;

export interface StatedAmount {
  /** The words as written: "3 million baht" */
  text: string;
  /** In the stated currency. */
  amount: number;
  code: CurrencyCode;
  usd: number;
}

/** Ambiguous "$", "dollars", "pesos", "¥": read in the light of their own currency. */
function resolve(c: CurrencyCode | "DOLLAR" | "PESO" | "YEN", prefer: CurrencyCode): CurrencyCode {
  if (c === "DOLLAR") return prefer === "SGD" || prefer === "CAD" || prefer === "AUD" || prefer === "MXN" ? prefer : "USD";
  if (c === "PESO") return prefer === "MXN" ? "MXN" : "PHP";
  if (c === "YEN") return prefer === "CNY" ? "CNY" : "JPY";
  return c;
}

const num = (s: string) => Number(s.replace(/,/g, ""));
const scale = (s: string | undefined) => (s ? SCALE[s.toLowerCase()] ?? 1 : 1);

/** Every money amount in a text, with its currency and the USD it equals at the fixed table. */
export function statedAmounts(text: string, prefer: CurrencyCode = "USD"): StatedAmount[] {
  const out: StatedAmount[] = [];
  const taken: [number, number][] = [];
  const add = (m: RegExpExecArray, amount: number, code: CurrencyCode) => {
    const at: [number, number] = [m.index, m.index + m[0].length];
    if (taken.some(([a, b]) => at[0] < b && a < at[1]) || !Number.isFinite(amount) || amount <= 0) return;
    taken.push(at);
    out.push({ text: m[0].trim(), amount, code, usd: Math.round(toUsd(amount, code)) });
  };
  // "฿3M", "$28k", "€40,000", "R$ 5 mil"
  for (const m of text.matchAll(new RegExp(`${SYM}\\s?${NUM}${SC}`, "gi"))) {
    const sym = SYMBOLS.find(([s]) => s.toLowerCase() === m[1]!.toLowerCase())?.[1];
    if (sym) add(m as RegExpExecArray, num(m[2]!) * scale(m[3]), resolve(sym, prefer));
  }
  // "THB 3M", "USD 50k"
  for (const m of text.matchAll(new RegExp(`${CODE_FIRST}${NUM}${SC}`, "gi"))) add(m as RegExpExecArray, num(m[2]!) * scale(m[3]), m[1]!.toUpperCase() as CurrencyCode);
  // "3 million baht", "3M THB", "50,000 euros"
  for (const m of text.matchAll(new RegExp(`${NUM}${SC}\\s?${CUR_WORD}`, "gi"))) {
    const word = WORDS.find(([re]) => re.test(m[3]!))?.[1];
    if (word) add(m as RegExpExecArray, num(m[1]!) * scale(m[2]), resolve(word, prefer));
  }
  return out;
}

/** The non-USD currency someone writes in, if any ("3 million baht" -> THB). */
export function detectCurrency(text: string): CurrencyCode | null {
  const hit = statedAmounts(text).find((a) => a.code !== "USD");
  if (hit) return hit.code;
  // Only words that can't be ordinary English ("I won", "a real job" are not currencies).
  const m = text.match(/\b(baht|thb|euros?|eur|gbp|yen|jpy|yuan|rmb|cny|rupees?|inr|krw|sgd|vnd|rupiah|idr|php|mxn|reais|brl|cad|aud)\b/i) ?? text.match(/[฿€£₹₩₫₱]/);
  if (!m) return null;
  const w = WORDS.find(([re]) => re.test(m[1] ?? ""))?.[1] ?? SYMBOLS.find(([s]) => s === m[0])?.[1];
  if (!w || w === "DOLLAR" || w === "USD") return null;
  return resolve(w, "USD");
}

/**
 * Guard for model output: a money field that equals an amount they stated in another currency
 * was copied without converting ("3 million baht" -> savingsUsd 3,000,000). Replace it with the
 * USD conversion. Returns the fixed value (or the input when nothing matches).
 */
export function fixUnconverted(value: number | null, stated: StatedAmount[]): number | null {
  if (value == null) return value;
  const hit = stated.find((s) => s.code !== "USD" && Math.abs(value - s.amount) <= Math.max(1, s.amount * 0.02));
  return hit ? hit.usd : value;
}
