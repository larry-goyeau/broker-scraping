// Mid rates into one US dollar. A fact about the market, not about any broker,
// so it lives at the root next to `venues.mjs` and `taxes.mjs`.
//
// The figures are the ECB reference of 2026-09-07, published as foreign units
// per euro and inverted here through USD. Swissquote converts its CHF grid at
// that same mid, with no markup; the other two files only need the table so
// `b` and `c` can be added across listings.
//
//   toUsd(3, "CHF")     → dollars
//   usdPer("EUR")       → dollars per euro
//
// `GBX` is a penny: one-hundredth of a pound. `AED` is the UAE peg, which the
// ECB does not print.

export const QUOTE = "USD";
export const AS_OF = "2026-09-07";
export const SOURCE = "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/";

// Foreign units per one US dollar, ECB 2026-09-07 via Frankfurter. Invert to
// multiply: dollars = amount / FOREIGN_PER_USD[ccy].
const FOREIGN_PER_USD = {
  USD: 1,
  EUR: 0.86044,
  CHF: 0.80924,
  GBP: 0.73906,
  JPY: 154.75,
  CAD: 1.382,
  AUD: 1.3861,
  HKD: 7.8402,
  SGD: 1.2662,
  SEK: 9.6042,
  NOK: 9.2703,
  DKK: 6.4314,
  NZD: 1.7019,
  PLN: 3.7087,
  CZK: 20.82,
  HUF: 312.51,
  MXN: 16.9121,
  ZAR: 15.9917,
  THB: 32.895,
  CNY: 6.711,
  INR: 94.49,
  KRW: 1347.93,
  TRY: 48.433,
  BRL: 5.1261,
  ILS: 3.0108,
  IDR: 17647,
  MYR: 4.046,
  PHP: 62.641,
  RON: 4.5189,
  ISK: 121.15,
  // UAE dirham, IMF peg. Not an ECB print.
  AED: 3.6725,
};

function keyOf(currency) {
  const s = String(currency || "").trim();
  if (/^GBX$/i.test(s) || s === "GBp" || /^GBPENCE$/i.test(s)) return "GBX";
  return s.toUpperCase();
}

export function usdPer(currency) {
  const key = keyOf(currency);
  if (key === "GBX") {
    const gbp = FOREIGN_PER_USD.GBP;
    return gbp ? 1 / gbp / 100 : null;
  }
  const per = FOREIGN_PER_USD[key];
  return per ? 1 / per : null;
}

export function toUsd(amount, currency) {
  const px = usdPer(currency);
  if (px == null || amount == null || !Number.isFinite(Number(amount))) return null;
  return Number(amount) * px;
}
