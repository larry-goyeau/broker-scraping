// What one round trip costs at Samuel Sekuritas Indonesia through STAR:
// buy n shares (or ETF units) on the Indonesia Stock Exchange, sell them
// back at once, in dollars. The online trading account.
//
// https://star.id/faq read on 2026-10-26, "Pricing":
//   "Online Trading / Full Service: Fee Beli 0,15% net / 0,25% net,
//    Fee Jual 0,25% net / 0.35% net, Minimum Saldo Rp. 0,-"
//   "Komisi Transaksi sudah termasuk biaya: VAT (PPN) 11% dari brokerage
//    fee, IDX Fee (Biaya Levy BEI) 0,043% ..., Selling Tax (PPh) 0,1% dari
//    total Value transaksi jual"
// So the online 0.15% and 0.25% are all-in and go in as they are. Full
// service (orders through a broker/sales) is not an online price and stays
// out. No floor, no ETF rate and no e-Meterai are printed, so none is
// added. The Rp 22,200 per code is a stock transfer fee, not this trip.
//
// fees = notional x (0.15% + 0.25%).
// The account is in rupiah (RDI), so there is no FX leg. The book comes
// from spreads/ (spreads/idx-touch.mjs). The sums are in
// ../stockbit/idxCost.mjs.
//
//   node brokers/samuel/samuel_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Samuel Sekuritas",
  folder: "samuel",
  catalogueUrl: new URL("samuel-parsed.json", import.meta.url),
  url: "https://star.id/faq",
  readOn: "2026-10-26",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "compte Online Trading STAR, ordre en ligne, taux nets (TVA, levy et impôt de vente inclus)",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
