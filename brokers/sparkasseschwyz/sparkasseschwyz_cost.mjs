// What one round trip costs at Sparkasse Schwyz: buy n shares on SIX Swiss
// Exchange in e-banking / mobile banking (Depot ohne Beratung) and sell
// them straight back, in dollars. The SIX book, the Swiss stamp, the SIX
// exchange fee, taxMap and the FX rule come from ../migros/sixCost.mjs;
// this file gives the bank's courtage and its currencies.
//
// Read on 2026-10-26:
//   https://www.sparkasse.ch/pdf/publikationen/broschueren/konten-sparen/dienstleistung_preise.pdf
//     (Dienstleistungen und Preise, valid from 1 October 2026)
//     "Wertschriftentransaktionen":
//       Courtage Kategorie 1 (Obligationen, Aktien CHF, Fonds Domizil
//       Schweiz, sonstige Anlagen CHF): bis CHF 100'000 1.00 %, bis 250'000
//       0.70 %, bis 500'000 0.50 %, bis 750'000 0.40 %, bis 1 Mio. 0.30 %,
//       ab 1 Mio. 0.25 %; Minimum CHF 49.
//       Courtage Kategorie 2 (Aktien Fremdwährung, Fonds Domizil Ausland,
//       sonstige Anlagen Fremdwährung): 1.50 %, 1.20 %, 1.00 %, 0.90 %,
//       0.80 %, 0.75 %; Minimum CHF 49.
//       "Börsentransaktionen via E-Banking / Mobile Banking, Anlagen in CHF
//       und Fremdwährungen: 50% Reduktion, Minimum CHF 29."
//       "Börsengebühren und fremde Gebühren werden zusätzlich verrechnet."
//     Depot ohne Beratung (Execution Only): 0.20 % a year up to CHF 1 Mio.,
//     minimum CHF 50, plus "Fremdwährungszuschlag 0.15%" (remark).
//     Privatkonto: "Kontoführung auch in Euro möglich" (Privatkonto EUR).
//
// Category of a catalogue row: a share in CHF -> 1, in another currency ->
// 2; an ETF (a fund) with a CH ISIN -> 1 ("Fonds Domizil Schweiz"), any
// other ISIN -> 2; an ETN/ETC ("sonstige Anlagen") in CHF -> 1, otherwise 2.
// The tariff prints "bis" bands with no "für die nächsten", so the band's
// rate applies to the whole amount in CHF.
//
// Commission, one side: half the category's band rate, minimum CHF 29.
//
// FX: the private accounts are CHF and EUR. No customer markup is printed
// (the 1 % "Changegebühr für Nichtkunde" is a counter fee for
// non-customers), so a USD, GBP, JPY, AUD, CAD or SGD line is N/A.
//
// Left out: OTC orders (minimum CHF 120), options, the Sparplan
// Fondsinvest and 3a solutions, VAT on custody, CHF 180 a year for clients
// domiciled abroad.
//
//   node brokers/sparkasseschwyz/sparkasseschwyz_cost.mjs NESN XSWX CHF --shares=12 --price=80
//   node brokers/sparkasseschwyz/sparkasseschwyz_cost.mjs VWRL XSWX CHF --shares=8 --price=130
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, bandRate, pctFr } from "../migros/sixCost.mjs";

const PAGE = "https://www.sparkasse.ch/pdf/publikationen/broschueren/konten-sparen/dienstleistung_preise.pdf";
const EO = "https://www.sparkasse.ch/de/private/anlegen/depot_ohne_beratung/depot_ohne_beratung_direktlink";
const DISCOUNT = 0.5;
const MIN = 29;
const UP = [100000, 250000, 500000, 750000, 1000000, Infinity];
const LIST = {
  1: [0.01, 0.007, 0.005, 0.004, 0.003, 0.0025],
  2: [0.015, 0.012, 0.01, 0.009, 0.008, 0.0075],
};
const BANDS = Object.fromEntries(Object.entries(LIST).map(([k, rates]) => [k, rates.map((r, i) => ({ upTo: UP[i], rate: r * DISCOUNT }))]));
const LABEL = {
  1: "catégorie 1 (actions CHF, fonds domiciliés en Suisse, autres placements CHF)",
  2: "catégorie 2 (actions en devise, fonds domiciliés à l'étranger, autres placements en devise)",
};

/** Courtage category of a catalogue row (see the header). */
export function categoryOf(listing) {
  const type = String(listing.type || "").toUpperCase();
  if (type === "ETF" || type === "FUND") return /^CH/.test(String(listing.isin || "").toUpperCase()) ? 1 : 2;
  return listing.currency === "CHF" ? 1 : 2;
}

export const roundTrip = makeRoundTrip({
  folder: "sparkasseschwyz",
  brand: "Sparkasse Schwyz",
  catalogue: new URL("sparkasseschwyz-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR"],
  fx: null,
  onlineBuy: true,
  remark: "Custody 0.20% a year (min CHF 50), 0.35% on foreign-currency titles.",
  sources: { executionOnly: EO },
  commission: ({ amountChf, listing }) => {
    const cat = categoryOf(listing);
    const bands = BANDS[cat];
    const band = bands.find((b) => amountChf <= b.upTo);
    return {
      chf: bandRate(bands, amountChf, MIN),
      rate: band.rate,
      min: MIN,
      basis:
        `courtage ${LABEL[cat]}, ordre en e-banking (réduction de 50 %, minimum CHF ${MIN}) : ` +
        `${pctFr(band.rate)} % du montant entier dans sa tranche (` +
        bands.map((b) => `${pctFr(b.rate)} %`).join(" / ") +
        `).`,
      confidence: "barème publié lu comme taux de la tranche sur tout l'ordre (aucun « für die nächsten »)",
    };
  },
});

cli(import.meta.url, roundTrip);
