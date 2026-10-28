// What one round trip costs at Webull Indonesia (PT Webull Sekuritas
// Indonesia): buy n shares (or ETF units) on the Indonesia Stock Exchange,
// sell them back at once, in dollars. The one online account in the
// Webull app.
//
// https://www.webull.co.id/pricing read on 2026-10-26, "Saham Indonesia":
//   "Komisi Biaya Beli 0,15% 0,09%**"  (0,15% struck through)
//   "Komisi Biaya Jual 0,25% 0,19%**"  (0,25% struck through)
//   "*Biaya tersebut sudah termasuk biaya broker, biaya levy, dana jaminan
//   KPEI, PPN biaya broker, dan PPH Final (hanya dikenakan untuk transaksi
//   jual)"
//   "**Periode promosi dari Februari hingga Desember 2026"
// https://www.webull.co.id/help/faq/10 (same day): the 0.15%/0.25% include
// the levy, KPEI fund and VAT "sebesar 0,0433%" and the 0.1% final tax on
// the sell; "Kamu tidak akan dikenakan biaya lainnya selain yang sudah
// disebutkan diatas", so no e-Meterai or other charge is added.
// The promotion is printed for every order with no condition, so, as
// granit_cost.mjs does with its own, 0.09%/0.19% is the price through
// 2026-12-31 and the struck-through 0.15%/0.25% after.
// All in, as printed. No floor and no other ETF rate are printed, so an
// ETF unit takes these two figures, as in the other IDX files.
//
// fees = notional x (buy + sell): 0.28% until 2026-12-31, 0.40% after.
// The account is in rupiah (RDN), so there is no FX leg. The book comes
// from spreads/ (spreads/idx-touch.mjs); a missing book stays missing. The
// sums are in ../stockbit/idxCost.mjs.
//
//   node brokers/webullindonesia/webullindonesia_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const PROMO_THROUGH = "2026-12-31";

const SCHEDULE = {
  broker: "Webull Indonesia",
  folder: "webullindonesia",
  catalogueUrl: new URL("webullindonesia-parsed.json", import.meta.url),
  url: "https://www.webull.co.id/pricing",
  readOn: "2026-10-26",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "compte Webull, ordre en ligne",
};

const PROMO = {
  buy: pct("0.09"),
  sell: pct("0.19"),
  basis: `compte Webull, ordre en ligne, promotion jusqu'au ${PROMO_THROUGH} (0,15 % / 0,25 % ensuite)`,
};

const today = () => new Date().toISOString().slice(0, 10);
export const promoLive = (day = today()) => day <= PROMO_THROUGH;

export function roundTrip(query) {
  return idxRoundTrip(promoLive() ? { ...SCHEDULE, ...PROMO } : SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
