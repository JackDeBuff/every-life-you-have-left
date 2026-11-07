/**
 * Currency checks (unit asserts), then an optional live profile extraction that also checks a
 * dated plan ("return to Bangkok in early 2027") is captured as a planned event.
 *   npx tsx scripts/eval/currency-check.ts          # pure: parsing, conversion, formatting, the guard
 *   npx tsx scripts/eval/currency-check.ts --live   # + Gemini profile extraction for a Thai and a US persona
 * Exits non-zero on any failure. Personas are fictional.
 */
import { currencyForCountry, currencyForPlace, detectCurrency, displayCurrency, fixUnconverted, formatMoney, statedAmounts, usdHint } from "../../shared/currency";
import type { Profile } from "../../shared/schema";
import type { StartInput } from "../../shared/sim";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}
const near = (v: number | null | undefined, want: number, tol = 0.06) => v != null && Math.abs(v - want) <= want * tol;

// --- parsing what people write ---------------------------------------------------------------
const thai = "I have about 3 million baht in assets and my target is 50 million baht by 40.";
const a = statedAmounts(thai);
check("3 million baht -> THB 3,000,000", a[0]?.code === "THB" && a[0]?.amount === 3_000_000, JSON.stringify(a[0]));
check("3 million baht ~= $85k, not $3M", near(a[0]?.usd, 85_000), String(a[0]?.usd));
check("target 50 million baht ~= $1.42M", near(a[1]?.usd, 1_416_000), String(a[1]?.usd));
check("฿3M", statedAmounts("savings around ฿3M")[0]?.usd === Math.round(3e6 / 35.3));
check("THB 3M (code first)", statedAmounts("roughly THB 3M saved")[0]?.code === "THB");
check("3M THB", near(statedAmounts("3M THB in assets")[0]?.usd, 85_000));
check("$28k stays USD", statedAmounts("I still have $28k in loans")[0]?.usd === 28_000);
check("€40,000", near(statedAmounts("I earn €40,000 a year")[0]?.usd, 43_478));
check("5 lakh rupees", near(statedAmounts("my salary is 5 lakh rupees")[0]?.usd, 5952));
check("'I won' is not a currency", detectCurrency("I won a hackathon and got a real job") === null);
check("detect baht", detectCurrency(thai) === "THB");
check("detect none for dollars", detectCurrency("I have $5k saved") === null);

// --- the guard against unconverted model output -----------------------------------------------
check("guard: 3,000,000 copied as USD -> fixed", near(fixUnconverted(3_000_000, a), 85_000));
check("guard: a real USD estimate is kept", fixUnconverted(90_000, a) === 90_000);
check("guard: null stays null", fixUnconverted(null, a) === null);

// --- display -----------------------------------------------------------------------------------
check("country TH -> THB", currencyForCountry("TH") === "THB");
check("country DE -> EUR", currencyForCountry("de") === "EUR");
check("country US -> USD", currencyForCountry("US") === "USD");
check("their pick wins over country", displayCurrency({ currency: "THB", country: "US" }) === "THB");
check("place: Bangkok, Thailand -> THB", currencyForPlace("Bangkok, Thailand") === "THB");
check("place: Durham, NC, US -> USD", currencyForPlace("Durham, NC, US") === "USD");
check("place: Los Angeles, CA is California, not Canada", currencyForPlace("Los Angeles, CA") === "USD");
check("place: Toronto, ON -> CAD", currencyForPlace("Toronto, ON") === "CAD");
check("place: Lisbon, Portugal -> EUR", currencyForPlace("Lisbon, Portugal") === "EUR");
check("place: unknown -> null", currencyForPlace("Lagos, Nigeria") === null);
check("format ฿3.00M", formatMoney(85_000, "THB") === "฿3.00M", formatMoney(85_000, "THB"));
check("format short ฿850k", formatMoney(24_079, "THB", true) === "฿850k", formatMoney(24_079, "THB", true));
check("format USD unchanged", formatMoney(-28_000, "USD") === "−$28,000");
check("hover hint", usdHint(85_000, "THB")?.startsWith("≈ $85,000") === true, usdHint(85_000, "THB") ?? "");
check("no hint in USD", usdHint(85_000, "USD") === null);

// --- live: profile extraction converts and keeps the plan ---------------------------------------
if (process.argv.includes("--live")) {
  const { createEngine } = await import("../../worker/engine");
  const { nodeLlm } = await import("./env");
  const engine = createEngine({ llm: nodeLlm() });
  const base = { via: "text" as const, speed: "auto" as const, hasSelfie: false };
  const nida: StartInput = {
    ...base,
    firstName: "Nida", age: 25, city: "Durham", region: "NC", country: "US", currency: "THB",
    appearance: { hairStyle: "long", hairColor: "black", skinTone: "tone2", glasses: true, facialHair: false, gender: "woman" },
    line: "I'm an ML engineer in Durham on a company scholarship, and I'll return to Bangkok in early 2027 for the company's Management Associate program. I have about 3 million baht in assets and I want 50 million baht by 40. My parents are the center of my life and I want to be close to them.",
  };
  const sam: StartInput = {
    ...base,
    firstName: "Sam", age: 31, city: "Columbus", region: "OH", country: "US", currency: null, appearance: null,
    line: "I'm a nurse, I have $40k saved and $18k in car and card debt. We're moving to Denver in June 2027 when my partner's residency starts.",
  };
  for (const [who, input, wantSavings] of [["Nida (THB)", nida, 85_000], ["Sam (USD)", sam, 40_000]] as const) {
    const p: Profile = await engine.startProfile(input, []);
    console.log(`\n${who}: currency ${p.currency} gender ${p.gender ?? "-"} money ${JSON.stringify(p.money)}`);
    check(`${who}: savings converted to ~$${wantSavings}`, near(p.money.savingsUsd, wantSavings, 0.25), String(p.money.savingsUsd));
    const plans = p.plans ?? [];
    check(`${who}: the dated 2027 plan is captured`, plans.some((x) => x.year === 2027), plans.map((x) => `${x.year} ${x.when ?? ""} ${x.text} [${x.certainty}]`).join("; "));
  }
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
