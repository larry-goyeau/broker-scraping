// What one round trip costs at Spar- und Leihkasse Frutigen (SLF): buy n
// shares or ETF units on SIX Swiss Exchange through E-Banking as an
// "Execution only" client and sell them straight back, in dollars. The SIX
// book, the federal stamp, the SIX exchange fee, taxMap and the dollar
// answer come from ../migros/sixCost.mjs; this file gives the courtage, the
// account currencies and the bank's FX board.
//
// "Gebührentarif", "Gültig ab 1. Juli 2026", read on 2026-10-26:
//   https://www.slfrutigen.ch/media/0utf13h3/slf_gebuehrenblatt_web.pdf
//   Section "EXECUTION ONLY" (page 7): "Courtage Inland und Ausland pro
//   Auftrag (handelsvolumenabhängig, relativer Staffeltarif)": bis CHF
//   10 000 0,60 %, bis CHF 50 000 0,40 %, bis CHF 100 000 0,20 %, ab CHF
//   100 000 0,05 %; "keine Mindestgebühr für Aufträge Inland; CHF 50.00 pro
//   Auftrag Ausland; Fremdspesen werden generell weiterbelastet."
//   The same sheet calls its all-in fee an "absoluter Staffeltarif" (the
//   band's rate on the whole volume), so the "relativer" courtage scale is
//   taken slice by slice: 0.60 % on the first CHF 10,000, 0.40 % on the next
//   40,000, and so on. This is also the higher of the two readings.
// Execution-only flyer (fees_url), read on 2026-10-26:
//   https://www.slfrutigen.ch/media/mrccjutk/flyer_execution-only.pdf
//   "Courtage pro Auftrag Inland max. 0.60 %", "Keine Mindest-Courtage für
//   Inlandaufträge", "Depotgebühr pro Jahr nur 0.25 % min. CHF 50.–".
// A SIX trade is an "Inland" order whatever the line's currency, so the
// CHF 50 foreign-order minimum does not apply. The tariff marks the
// courtage without its VAT asterisk.
//
// Accounts (https://www.slfrutigen.ch/konten-und-karten/privatkonto/fremdw%C3%A4hrungskonto):
// "Das Fremdwährungskonto ist das ideale Konto zur Abwicklung Ihrer
// Zahlungen und Wertschriftentransaktionen in fremder Währung ... USD GBP
// NOK AUD andere Währungen auf Anfrage", plus the Eurokonto. So CHF, EUR,
// USD, GBP and AUD lines stay unconverted. The foreign-currency account
// costs CHF 50 a year ("Bearbeitungskommission pro Konto (ohne
// Eurokonto)").
// FX: the bank's "Fremdwährungskurse" page
// (https://www.slfrutigen.ch/services-footer/infos/fremdw%C3%A4hrungskurse)
// prints its Devisen board (Ankauf / Verkauf, "Richtwert") from
// https://mobilebanking.esprit-netzwerk.ch/Api/ExchangeRate?ClearingNumber=8784&AppVersion=1&Language=1&mobileOs=100
// (block currencyRates, issued 2026-10-26T10:10Z, snapshot below). One way
// against the mid is (Verkauf - Ankauf) / (Verkauf + Ankauf), as in
// migros_cost.mjs. A JPY, CAD or SGD line converts both ways at that rate;
// on a held currency it is a remark.
//
// Left out: the advisory and mandate products (OptiPortfolio,
// FlexPortfolio, Vermögensberatung); orders on foreign exchanges; custody
// (0.25 % a year, min CHF 50: remark); VAT (not on courtage).
//
//   node brokers/sparundleihkasse/sparundleihkasse_cost.mjs NESN XSWX CHF --shares=10 --price=80
//   node brokers/sparundleihkasse/sparundleihkasse_cost.mjs CSSPX XSWX USD --shares=1 --price=826
//   node brokers/sparundleihkasse/sparundleihkasse_cost.mjs 1306 XSWX JPY --shares=50 --price=3200
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, pctFr, sliced } from "../migros/sixCost.mjs";

const PAGE = "https://www.slfrutigen.ch/media/0utf13h3/slf_gebuehrenblatt_web.pdf";
const FLYER = "https://www.slfrutigen.ch/media/mrccjutk/flyer_execution-only.pdf";
const FX_PAGE = "https://www.slfrutigen.ch/services-footer/infos/fremdw%C3%A4hrungskurse";
const ACCOUNTS = "https://www.slfrutigen.ch/konten-und-karten/privatkonto/fremdw%C3%A4hrungskonto";
const SLICES = [
  { upTo: 10000, rate: 0.006 },
  { upTo: 50000, rate: 0.004 },
  { upTo: 100000, rate: 0.002 },
  { upTo: Infinity, rate: 0.0005 },
];

// Devisen board, CHF per unit (JPY per 100), [Ankauf, Verkauf], 2026-10-26 10:10 UTC.
const FX_BOARD = {
  readOn: "2026-10-26",
  rates: {
    EUR: [0.9125, 0.9386], USD: [0.8143, 0.8377], GBP: [1.0869, 1.118], JPY: [0.5183, 0.5316],
    AUD: [0.574, 0.5887], CAD: [0.582, 0.5969], SGD: [0.637296, 0.653481],
  },
};
const oneWay = ([buy, sell]) => (sell - buy) / (sell + buy);
function fxFor(ccy) {
  const pair = FX_BOARD.rates[ccy];
  if (!pair) return null;
  const rate = oneWay(pair);
  return {
    rate,
    basis: `au cours Devisen de la SLF (${ccy}, page «Fremdwährungskurse», relevé le ${FX_BOARD.readOn}) : ${pctFr(rate)} % du milieu par sens`,
  };
}

const CFG = {
  folder: "sparundleihkasse",
  brand: "Spar- und Leihkasse Frutigen",
  catalogue: new URL("sparundleihkasse-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP", "AUD", "NOK"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.25% a year, min CHF 50.",
  sources: { flyer: FLYER, fx: FX_PAGE, accounts: ACCOUNTS },
  commission({ amountChf }) {
    const chf = sliced(SLICES, amountChf);
    return {
      chf,
      min: 0,
      rate: amountChf > 0 ? chf / amountChf : null,
      basis:
        `courtage «Execution only», «relativer Staffeltarif» par tranche (0,60 % jusqu'à CHF 10 000, 0,40 % jusqu'à 50 000, 0,20 % jusqu'à 100 000, 0,05 % au-delà), ` +
        `sans minimum pour un ordre suisse : CHF ${Number(chf.toFixed(2))} par sens.`,
      confidence: "courtage «Execution only» publiée ; barème «relatif» lu par tranches (la lecture la plus chère)",
    };
  },
};
const engine = makeRoundTrip(CFG);

/** The listing's currency decides which line of the FX board applies. */
export function roundTrip(query) {
  let ccy = String(query.currency || "").trim().toUpperCase();
  if (!ccy) {
    CFG.fx = null;
    const probe = engine(query);
    ccy = probe.listing?.currency || "";
    if (!fxFor(ccy)) return probe;
  }
  CFG.fx = fxFor(ccy);
  try {
    return engine(query);
  } finally {
    CFG.fx = null;
  }
}

cli(import.meta.url, roundTrip);
