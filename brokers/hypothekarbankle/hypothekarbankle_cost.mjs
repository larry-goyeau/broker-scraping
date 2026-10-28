// What one round trip costs at Hypothekarbank Lenzburg (execution-only
// "Solo"): buy n shares or ETF units on SIX Swiss Exchange through
// E-Banking/Mobile and sell them back, in dollars. The SIX book, the
// federal stamp, the SIX exchange fee, taxMap and the dollar answer come
// from ../migros/sixCost.mjs.
//
// "Wertschriftendienstleistungen", Stand März 2025, "Solo Eigenverwaltung",
// read on 2026-10-26:
//   https://www.hbl.ch/media/ll1lqwia/wertschriftendienstleistungen.pdf
// Courtagen "in CHF, zuzüglich externe Gebühren sowie die gesetzlichen und
// börsenplatzabhängigen Abgaben":
//   "Aktien, Aktien- und Strategiefonds, Anrechte": bis zu CHF 50'000
//   1.10 %, für die nächsten 50'000 0.80 %, für die nächsten 100'000
//   0.50 %, für die nächsten 100'000 0.20 %, über 300'000 0.10 %.
//   "Obligationen, Obligationenfonds, strukturierte Produkte": 0.80 %,
//   0.60 %, 0.40 %, 0.20 %, 0.10 % on the same slices.
// Mindestcourtagen: "pro Börsenauftrag CHF 80.–"; "via E-Banking/Mobile:
// 50 % der ordentlichen Courtage, mind. CHF 40.–". So one side online is
//   max(CHF 40, 50 % x progressive courtage).
// ETFs take the share tariff (the catalogue does not say which ETFs hold
// bonds, so the higher fund tariff is used for all); ETNs and ETCs are
// structured products. The same scale applies in every trading currency
// (amounts in CHF).
//
// Accounts: Privatkonto "Auch in EUR oder anderen Fremdwährungen
// verfügbar" (Dienstleistungspreise Kontoführung & Zahlungsverkehr, Stand
// 1. April 2026, https://www.hbl.ch/media/meoakt2o/dienstleistungspreise-kontofuehrung_zahlungsverkehr.pdf;
// currencies as in the bank's correspondent list), so every SIX trading
// currency is taken as held. No FX markup is printed.
//
// Left out: Solo administration fee 0.25 % a year, at least CHF 20 a
// portfolio and CHF 10 a position (remark); advisory solutions (not online
// prices); VAT (not on courtage).
//
//   node brokers/hypothekarbankle/hypothekarbankle_cost.mjs NESN XSWX CHF --shares=10 --price=80
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, sliced } from "../migros/sixCost.mjs";

const PAGE = "https://www.hbl.ch/media/ll1lqwia/wertschriftendienstleistungen.pdf";
const SHARES = [
  { upTo: 50000, rate: 0.011 },
  { upTo: 100000, rate: 0.008 },
  { upTo: 200000, rate: 0.005 },
  { upTo: 300000, rate: 0.002 },
  { upTo: Infinity, rate: 0.001 },
];
const STRUCTURED = [
  { upTo: 50000, rate: 0.008 },
  { upTo: 100000, rate: 0.006 },
  { upTo: 200000, rate: 0.004 },
  { upTo: 300000, rate: 0.002 },
  { upTo: Infinity, rate: 0.001 },
];
const DISCOUNT = 0.5;
const MIN_ONLINE = 40;

export const roundTrip = makeRoundTrip({
  folder: "hypothekarbankle",
  brand: "Hypothekarbank Lenzburg",
  catalogue: new URL("hypothekarbankle-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP", "JPY", "AUD", "CAD", "SGD"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.25% a year, at least CHF 20 a portfolio and CHF 10 a position.",
  sources: { accounts: "https://www.hbl.ch/media/meoakt2o/dienstleistungspreise-kontofuehrung_zahlungsverkehr.pdf" },
  commission({ amountChf, listing }) {
    const structured = listing.type === "ETN" || listing.type === "ETC";
    const full = sliced(structured ? STRUCTURED : SHARES, amountChf);
    const chf = Math.max(MIN_ONLINE, full * DISCOUNT);
    return {
      chf,
      min: MIN_ONLINE,
      basis:
        (structured
          ? "«Solo», tarif «strukturierte Produkte» progressif (0,80 % jusqu'à CHF 50 000, 0,60 % sur les 50 000 suivants, 0,40 % sur les 100 000 suivants, 0,20 % sur les 100 000 suivants, 0,10 % au-delà de 300 000)"
          : "«Solo», tarif «Aktien, Aktien- und Strategiefonds» progressif (1,10 % jusqu'à CHF 50 000, 0,80 % sur les 50 000 suivants, 0,50 % sur les 100 000 suivants, 0,20 % sur les 100 000 suivants, 0,10 % au-delà de 300 000)") +
        `, E-Banking 50 % de la courtage ordinaire, minimum CHF 40 : CHF ${Number(chf.toFixed(2))} par sens.`,
      confidence:
        "courtage en ligne imprimée (50 % de la courtage ordinaire, minimum CHF 40)" + (listing.type === "ETF" ? " ; ETF au tarif des fonds en actions" : ""),
    };
  },
});

cli(import.meta.url, roundTrip);
