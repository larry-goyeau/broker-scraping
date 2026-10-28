// What one round trip costs at SimInvest (PT Sinarmas Sekuritas): buy n
// shares (or ETF units) on the Indonesia Stock Exchange, sell them back at
// once, in dollars. The online trading rate, in the SimInvest app or Simas
// Equity.
//
// https://help.siminvest.id/berapa-fee-transaksi-yang-berlaku-di-sinarmas-sekuritas/
// read on 2026-10-26, the table "Tipe Fee Beli Jual":
//   Online Trading      0,1403%   0,2403%   <- used
//   Reguler             0,2503%   0,3503%   through a sales officer
//   Day Trade           0,1253%   0,2253%
//   Billionaire         0,1203%   0,2203%   month's trades Rp 10 to 29.99bn,
//                                           "efektif pada bulan berikutnya"
//   Mega Billionaire    0,1003%   0,2003%   Rp 30bn or more a month
// The rates were set after the VAT rise of 1 April 2022, and the sell is
// the buy plus 0.10 points (the 0.1% final income tax), so they are read
// as all-in, as bni, indopremier, cgsid and fac read their own pages. No
// floor is printed, no ETF rate, and no e-Meterai, so none is added.
// The day-trade line is 0.015 points lower on each side: the remark
// "Same day sell fees are 11% lower.", the cut on the fee without the 0.1%
// sale tax (0.2806% → 0.2506% buy and sell). The monthly tiers depend on
// the last month's volume and are a remark too, cut the same way (0.2406%
// = 14% lower, 0.2006% = 29%). The StarPoin reward (0.01% of the
// trade, paid in points) is not cash and is left out.
//
// fees = notional x (0.1403% + 0.2403%).
// The account is in rupiah (RDN at Bank Sinarmas, BCA or CIMB Niaga), so
// there is no FX leg. The book comes from spreads/ (spreads/idx-touch.mjs).
// The sums are in ../stockbit/idxCost.mjs.
//
//   node brokers/siminvest/siminvest_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "SimInvest",
  folder: "siminvest",
  catalogueUrl: new URL("siminvest-parsed.json", import.meta.url),
  url: "https://help.siminvest.id/berapa-fee-transaksi-yang-berlaku-di-sinarmas-sekuritas/",
  readOn: "2026-10-26",
  buy: pct("0.1403"),
  sell: pct("0.2403"),
  basis: "tarif Online Trading, ordre en ligne",
  remark: "Same day sell fees are 11% lower. Rp 10bn or more traded a month: fees are 14% lower; Rp 30bn or more: 29% lower.",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
