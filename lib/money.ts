export const CURRENCIES: Record<string, { symbol: string; name: string }> = {
  INR: { symbol: "₹", name: "Indian Rupee" },
  USD: { symbol: "$", name: "US Dollar" },
  EUR: { symbol: "€", name: "Euro" },
  GBP: { symbol: "£", name: "British Pound" },
  AED: { symbol: "د.إ", name: "UAE Dirham" },
  SGD: { symbol: "S$", name: "Singapore Dollar" },
  AUD: { symbol: "A$", name: "Australian Dollar" },
  CAD: { symbol: "C$", name: "Canadian Dollar" },
};

// Static approximations, USD-based. Production swaps this for a daily
// rates fetch; the rate is snapshotted onto each expense at capture time
// (fx_to_home) so historical totals never drift when rates change.
const PER_USD: Record<string, number> = {
  USD: 1,
  INR: 88.2,
  EUR: 0.92,
  GBP: 0.78,
  AED: 3.67,
  SGD: 1.34,
  AUD: 1.52,
  CAD: 1.37,
};

/** How many units of `to` one unit of `from` buys. */
export function fxRate(from: string, to: string): number {
  if (from === to) return 1;
  const a = PER_USD[from] ?? 1;
  const b = PER_USD[to] ?? 1;
  return b / a;
}

export function formatMinor(minor: number, currency: string): string {
  const sym = CURRENCIES[currency]?.symbol ?? currency + " ";
  const locale = currency === "INR" ? "en-IN" : "en-US";
  const major = minor / 100;
  const digits = major % 1 === 0 ? 0 : 2;
  return (
    sym +
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(major)
  );
}

export function toHomeMinor(amountMinor: number, fxToHome: number): number {
  return Math.round(amountMinor * fxToHome);
}
