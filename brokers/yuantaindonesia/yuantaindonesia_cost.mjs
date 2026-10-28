// What one round trip costs at Yuanta Sekuritas Indonesia through
// YSInvest or YuantaConnect: buy n shares (or ETF units) on the Indonesia
// Stock Exchange, sell them back at once, in dollars. The online account.
//
// https://www.yuanta.co.id/inc/uploads/content/RIPLAY.pdf (product summary)
// read on 2026-10-26, fee table "Reguler / Online / Marjin":
//   "Fee Transaksi Beli (set by Default) 0,25% 0,15% *"
//   "Fee Transaksi Jual (set by Default) 0,35% 0,25% *"
//   "Fee Lain  Materai Rp10.000 sesuai dengan ketentuan PMK"
//   simulation note: "The transaction commision includes taxes and other
//   fes in accordance with the prevailing capital market law"
// https://www.yuanta.co.id/page/faq gives the same: "The Transaction fee
// for online trading as follows : Buy 0.15%, Sell 0.25%"; through sales
// 0.25% and 0.35%.
// So 0.15% and 0.25% are all-in: broker fee, VAT, the 0.0433% levy, and
// on the sell the 0.1% final income tax. The regular account trades
// through sales staff and stays out; margin is a loan and stays out. No
// floor and no ETF rate are printed. The Rp 10,000 e-Meterai "per PMK"
// is PMK 134/2021: one stamp on the day's trade confirmation above
// Rp 10,000,000, so a same-day trip above that carries one stamp. Left
// out: the Rp 100,000 that must stay in the RDN (a balance, not a fee),
// Rp 22,200 per security moved out, the closing transfer fees.
//
// fees = notional x (0.15% + 0.25%) + Rp 10,000 if 2 x notional > Rp 10M.
// The account is in rupiah (RDN at Mandiri, BCA or CIMB), so there is no
// FX leg. The book comes from spreads/ (spreads/idx-touch.mjs). The sums
// are in ../stockbit/idxCost.mjs.
//
//   node brokers/yuantaindonesia/yuantaindonesia_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Yuanta Sekuritas Indonesia",
  folder: "yuantaindonesia",
  catalogueUrl: new URL("yuantaindonesia-parsed.json", import.meta.url),
  url: "https://www.yuanta.co.id/inc/uploads/content/RIPLAY.pdf",
  readOn: "2026-10-26",
  buy: pct("0.15"),
  sell: pct("0.25"),
  stamp: "daily",
  basis: "compte Online Trading, ordre en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
