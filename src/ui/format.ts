import { create } from "zustand";
import { CURRENCIES, RATES_AS_OF, displayCurrency, formatMoney, isCurrency, usdHint, type CurrencyCode } from "../../shared/currency";
import { useSim } from "./session";

/** Money in the user's display currency (the engine's numbers are USD). */
export const money = (usd: number, code: CurrencyCode = "USD"): string => formatMoney(usd, code);
export const moneyShort = (usd: number, code: CurrencyCode = "USD"): string => formatMoney(usd, code, true);
/** "≈ $85,000" for a title attribute; undefined in USD. */
export const moneyHint = (usd: number, code: CurrencyCode): string | undefined => usdHint(usd, code) ?? undefined;

// ---------------------------------------------------------------------------------------------
// Display currency: the session's (their start-screen pick, else their country's), unless they
// switch it in the bio. The switch is display only, kept per session in this browser.
// ---------------------------------------------------------------------------------------------
export interface CurrencyPref {
  override: CurrencyCode | null;
  /** Currencies they said "no" to when the life moved there. */
  dismissed: CurrencyCode[];
}
const EMPTY: CurrencyPref = { override: null, dismissed: [] };
const keyOf = (sid: string) => `elyl.currency.${sid}`;

function load(sid: string): CurrencyPref {
  try {
    const v = JSON.parse(localStorage.getItem(keyOf(sid)) ?? "null") as Partial<CurrencyPref> | null;
    if (v) return { override: isCurrency(v.override) ? v.override : null, dismissed: (v.dismissed ?? []).filter(isCurrency) };
  } catch {
    /* private mode or blocked storage: defaults */
  }
  return EMPTY;
}

const usePrefs = create<{ bySid: Record<string, CurrencyPref> }>(() => ({ bySid: {} }));

export function useCurrencyPref(): CurrencyPref {
  const sid = useSim((s) => s.sessionId);
  return usePrefs((s) => s.bySid[sid]) ?? load(sid);
}

export function setCurrencyPref(sid: string, patch: Partial<CurrencyPref>) {
  const next = { ...(usePrefs.getState().bySid[sid] ?? load(sid)), ...patch };
  usePrefs.setState((s) => ({ bySid: { ...s.bySid, [sid]: next } }));
  try {
    localStorage.setItem(keyOf(sid), JSON.stringify(next));
  } catch {
    /* display-only preference; fine to lose */
  }
}

/** The currency money is shown in right now. */
export const useCurrency = (): CurrencyCode => {
  const base = useSim((s) => displayCurrency(s.profile));
  return useCurrencyPref().override ?? base;
};

/** The note that always sits beside money (D-008): a projection, in today's money, at a fixed rate. */
export const moneyNote = (code: CurrencyCode): string =>
  code === "USD"
    ? "A projection, not a prediction. Today's dollars."
    : `A projection, not a prediction. Today's ${CURRENCIES[code].noun}, at $1 = ${CURRENCIES[code].symbol}${CURRENCIES[code].perUsd} (${RATES_AS_OF}).`;

export const ROMAN = ["I", "II", "III", "IV", "V", "VI"];

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
