import { CURRENCIES, RATES_AS_OF, displayCurrency, formatMoney, usdHint, type CurrencyCode } from "../../shared/currency";
import { useSim } from "./session";

/** Money in the user's display currency (the engine's numbers are USD). */
export const money = (usd: number, code: CurrencyCode = "USD"): string => formatMoney(usd, code);
export const moneyShort = (usd: number, code: CurrencyCode = "USD"): string => formatMoney(usd, code, true);
/** "≈ $85,000" for a title attribute; undefined in USD. */
export const moneyHint = (usd: number, code: CurrencyCode): string | undefined => usdHint(usd, code) ?? undefined;

/** The session's display currency: their pick on the start screen, else their country's. */
export const useCurrency = (): CurrencyCode => useSim((s) => displayCurrency(s.profile));

/** The note that always sits beside money (D-008): a projection, in today's money, at a fixed rate. */
export const moneyNote = (code: CurrencyCode): string =>
  code === "USD"
    ? "A projection, not a prediction. Today's dollars."
    : `A projection, not a prediction. Today's ${CURRENCIES[code].noun}, at $1 = ${CURRENCIES[code].symbol}${CURRENCIES[code].perUsd} (${RATES_AS_OF}).`;

export const ROMAN = ["I", "II", "III", "IV", "V", "VI"];

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
