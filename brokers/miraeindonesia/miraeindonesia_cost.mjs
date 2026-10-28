// What one round trip costs at Mirae Asset Sekuritas Indonesia through
// M-STOCK: buy n shares (or ETF units) on the Indonesia Stock Exchange,
// sell them back at once, in dollars. The online M-STOCK account.
//
// https://sekuritas.miraeasset.co.id/m-stock read on 2026-10-26:
//   "Competitive Transaction Fees 0.15% Buy 0.25% Sell"
// Read as all-in: broker fee, VAT and the 0.0433% levy, and on the sell
// the 0.1% final income tax, as bni, indopremier, cgsid and fac read
// their own pages. The firm's tax page states that tax ("A 0.1% final
// income tax is withheld on each stock sale transaction"), and the sell
// figure is the buy plus those 0.10 points.
//   https://sekuritas.miraeasset.co.id/help-center/tax/tax-on-dividends-and-transactions
// No floor and no other ETF rate are printed, so an ETF unit takes these
// two figures, as in the other IDX files. No e-Meterai is printed, so none
// is added (as bni and indopremier). Orders through an Investment
// Specialist or HOTS dealer are not priced here.
//
// fees = notional x (0.15% + 0.25%).
// The account is in rupiah (RDN), so there is no FX leg. The book comes
// from spreads/ (spreads/idx-touch.mjs). The sums are in
// ../stockbit/idxCost.mjs.
//
//   node brokers/miraeindonesia/miraeindonesia_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Mirae Asset Sekuritas",
  folder: "miraeindonesia",
  catalogueUrl: new URL("miraeindonesia-parsed.json", import.meta.url),
  url: "https://sekuritas.miraeasset.co.id/m-stock",
  readOn: "2026-10-26",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "compte M-STOCK, ordre en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
