// What one round trip costs at Tuntun Sekuritas Indonesia: buy n shares
// (or ETF units) on the Indonesia Stock Exchange, sell them back at once,
// in dollars. The one online account, in the Tuntun app.
//
// https://www.tuntun.co.id/id read on 2026-10-26, pricing block, tab
// "Saham", "Fixed Fee". The two figures are an image,
// https://www.tuntun.co.id/static/fees-new.png: "BUY FEE 0,15%", "SELL
// FEE 0,25%". The note under it: "Sudah termasuk biaya broker, biaya Levy
// (BEI, KPEI, KSEI) 0.0433%, PPN Biaya broker 11%, and PPh Final untuk
// Transaksi jual 0.1%" (broker fee, levy, VAT and the sale tax included).
// So both are all-in. The other tab, "Reksa Dana", is mutual funds with no
// admin fee, not in the catalogue. No floor, no ETF rate, no promotion and
// no e-Meterai are printed, so none is added.
//
// fees = notional x (0.15% + 0.25%).
// The account is in rupiah (RDN at an Indonesian bank), so there is no FX
// leg. The book comes from spreads/ (spreads/idx-touch.mjs). The sums are
// in ../stockbit/idxCost.mjs.
//
//   node brokers/tuntun/tuntun_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "Tuntun Sekuritas",
  folder: "tuntun",
  catalogueUrl: new URL("tuntun-parsed.json", import.meta.url),
  url: "https://www.tuntun.co.id/id",
  readOn: "2026-10-26",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "compte en ligne, ordre dans l'application",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
