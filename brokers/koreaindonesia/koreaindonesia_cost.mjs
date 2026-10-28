// What one round trip costs at Korea Investment & Sekuritas Indonesia
// (KISI) through the KOINS app: buy n shares (or ETF units) on the
// Indonesia Stock Exchange, sell them back at once, in dollars. The
// regular account ("Akun Reguler"), online.
//
// https://www.kisi.co.id/produk/saham read on 2026-10-26 (a React page;
// the text is in the bundle /static/js/main.*.js):
//   "Fee transaksi beli 0,13% dan jual 0,23%."
//   The home page's "Biaya Transaksi" box: "Fee Beli 0,13%", "Fee Jual
//   0,23%", note "Biaya transaksi di atas yaitu bersifat promosi" (the
//   rates above are promotional). No other rate is printed, so the
//   promotional rate is the price today.
// The two figures are read as all-in: broker fee, VAT and the 0.0433%
// levy, and on the sell the 0.1% final income tax (the sell is the buy
// plus 0.10 points), as bni, indopremier, cgsid and fac read their own
// pages. The margin account prints the same rates and is a loan, so it is
// not priced here. The ETF page says ETFs trade "layaknya seperti saham",
// with no rate of their own, so they take the share rates. No floor and
// no e-Meterai are printed, so none is added.
//
// fees = notional x (0.13% + 0.23%).
// The account is in rupiah (RDN at an Indonesian bank), so there is no FX
// leg. The book comes from spreads/ (spreads/idx-touch.mjs). The sums are
// in ../stockbit/idxCost.mjs.
//
//   node brokers/koreaindonesia/koreaindonesia_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Korea Investment & Sekuritas Indonesia",
  folder: "koreaindonesia",
  catalogueUrl: new URL("koreaindonesia-parsed.json", import.meta.url),
  url: "https://www.kisi.co.id/produk/saham",
  readOn: "2026-10-26",
  buy: pct("0.13"),
  sell: pct("0.23"),
  basis: "compte régulier, ordre en ligne KOINS, tarif promotionnel",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
