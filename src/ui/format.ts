export const money = (n: number): string => {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  return `${sign}$${Math.round(a).toLocaleString("en-US")}`;
};

export const moneyShort = (n: number): string => {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1000) return `${sign}$${Math.round(a / 1000)}k`;
  return `${sign}$${Math.round(a)}`;
};

export const ROMAN = ["I", "II", "III", "IV", "V", "VI"];

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
