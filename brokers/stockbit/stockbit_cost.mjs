// What one round trip costs at Stockbit Sekuritas Digital: buy n shares
// (or ETF units) on the Indonesia Stock Exchange, sell them back at once,
// in dollars. The one online account, in the Stockbit app or on the web.
//
// https://help.stockbit.com/id/article/transaksi-saham-berapa-biaya-trading-di-stockbit-sekuritas-1lbkyq9/
// read on 2026-10-26 ("Diperbarui pada: 16/10/2026"):
//   Shares   "Fee beli 0.15% Fee Jual 0.25%", for individuals and
//            institutions alike. Read as all-in: broker fee, VAT and the
//            0.0433% levy, and on the sell the 0.1% final income tax (the
//            sell is the buy plus 0.10 points), as bni, indopremier, cgsid
//            and fac read their own pages. No floor is printed.
//   ETF      "Fee ETF, right dan warrant (beli & jual): Fee beli 0.15% Fee
//            Jual 0.15% (fee jual tidak dikenakan PPh)", so an ETF unit
//            pays 0.15% each way.
//   e-Meterai  Rp 10,000 (PMK 134/PMK.03/2021) on a "Trade Confirmation
//            ... dengan total nilai transaksi jual, beli, maupun jual dan
//            beli di atas Rp10.000.000". The confirmation is the day's, so
//            a same-day trip carries one stamp when buy + sell is above
//            Rp 10,000,000.
// Left out: the "Biaya Live Datafeed", billed the next month when a
// month's trades total Rp 20 to 100 million; it is a monthly data charge,
// not this trip, and its amount is only in an image.
//
// fees = notional x (buy + sell) + Rp 10,000 if 2 x notional > Rp 10M.
// The account is in rupiah (RDN at BCA or Jago), so there is no FX leg.
// The book comes from spreads/ (spreads/idx-touch.mjs). The sums are in
// ./idxCost.mjs.
//
//   node brokers/stockbit/stockbit_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "./idxCost.mjs";

const SCHEDULE = {
  broker: "Stockbit",
  folder: "stockbit",
  catalogueUrl: new URL("stockbit-parsed.json", import.meta.url),
  url: "https://help.stockbit.com/id/article/transaksi-saham-berapa-biaya-trading-di-stockbit-sekuritas-1lbkyq9/",
  readOn: "2026-10-26",
  buy: pct("0.15"),
  sell: pct("0.25"),
  etfBuy: pct("0.15"),
  etfSell: pct("0.15"),
  stamp: "daily",
  basis: "compte en ligne, ordre dans l'application",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
