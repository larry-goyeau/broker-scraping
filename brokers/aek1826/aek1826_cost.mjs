// What one round trip costs at AEK BANK 1826 ("Anlagelösung Online
// (Execution Only)"): buy n shares or ETF units on SIX Swiss Exchange
// online and sell them back, in dollars. The SIX book, the federal stamp,
// the SIX exchange fee, taxMap and the dollar answer come from
// ../migros/sixCost.mjs.
//
// "Dienstleistungs- und Preisübersicht im Anlagegeschäft" (2026-01-14),
// read on 2026-10-26:
//   https://www.aekbank.ch/dam/jcr:92abf7d1-911b-4167-8a30-1792abacb512/Dienstleistungs-_und_Preis%C3%BCbersicht_im_Anlagegesch%C3%A4ft.2026-01-14-16-03-36.pdf
// "Courtage im Börsenhandel", "Handelsplatz Schweiz: Aktien, ETF, kotierte
// Anlagefonds, strukturierte Produkte, Warrants, Anrechte", column
// "Staffeltarif Online": CHF 1 bis 30'000 0.45 %, 30'001 bis 200'000
// 0.25 %, ab 200'001 0.10 %, "Minimum Courtage CHF 45.00"
// ("Staffeltarif": each rate on its slice, as the bank's depot fee uses
// "Staffeltarif" for its upper slices). "Kleinstabschlüsse bis CHF 700.00:
// Kurswert 10 %" (printed once for both columns): a trade up to CHF 700
// pays 10 % of its value when that is below the minimum. So one side is
//   max(CHF 45, progressive online courtage), or 10 % of the amount when
//   the amount is CHF 700 or less and that is lower.
// SIX is "Handelsplatz Schweiz" whatever the line's currency. The general
// price list says the fees exclude "Umsatzabgabe und Börsengebühren"
// (mandates); the exchange fee comes on top.
//
// Accounts: "Privatkonto in CHF oder EUR", "Sparkonto in CHF oder EUR",
// and "Fremdwährungs-, Klientengeld- und Klientenkonto auf Anfrage" in the
// general price list (https://www.aekbank.ch/dam/jcr:bad6134c-03d9-44d4-b871-7edeed996c59/Dienstleistungs-%20und%20Preisuebersicht.2026-02-26-11-05-29.pdf):
// CHF, EUR, USD and GBP are taken as held. No FX markup is printed, so a
// JPY/AUD/CAD/SGD line (converted both ways) is N/A.
//
// Left out: online depot fee 0.25 % (Swiss) / 0.35 % (foreign domicile) a
// year, at least CHF 50 a depot and CHF 5 a position (remark); the "Basis"
// column (advised clients); VAT (not on courtage).
//
//   node brokers/aek1826/aek1826_cost.mjs NESN XSWX CHF --shares=10 --price=80
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, sliced } from "../migros/sixCost.mjs";

const PAGE =
  "https://www.aekbank.ch/dam/jcr:92abf7d1-911b-4167-8a30-1792abacb512/Dienstleistungs-_und_Preis%C3%BCbersicht_im_Anlagegesch%C3%A4ft.2026-01-14-16-03-36.pdf";
const BANDS = [
  { upTo: 30000, rate: 0.0045 },
  { upTo: 200000, rate: 0.0025 },
  { upTo: Infinity, rate: 0.001 },
];
const MIN_ONLINE = 45;
const SMALL_UP_TO = 700;
const SMALL_RATE = 0.1;

export const roundTrip = makeRoundTrip({
  folder: "aek1826",
  brand: "AEK BANK 1826",
  catalogue: new URL("aek1826-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.25% a year (0.35% on foreign shares), at least CHF 50.",
  sources: {
    accounts: "https://www.aekbank.ch/dam/jcr:bad6134c-03d9-44d4-b871-7edeed996c59/Dienstleistungs-%20und%20Preisuebersicht.2026-02-26-11-05-29.pdf",
  },
  commission({ amountChf }) {
    const scale = Math.max(MIN_ONLINE, sliced(BANDS, amountChf));
    const small = amountChf <= SMALL_UP_TO ? amountChf * SMALL_RATE : Infinity;
    const chf = Math.min(scale, small);
    return {
      chf,
      min: MIN_ONLINE,
      basis:
        `«Staffeltarif Online», Handelsplatz Schweiz (0,45 % jusqu'à CHF 30 000, 0,25 % de 30 001 à 200 000, 0,10 % au-delà, par tranche), minimum CHF 45` +
        (small < scale ? `, petit ordre jusqu'à CHF 700 à 10 % du montant` : "") +
        ` : CHF ${Number(chf.toFixed(2))} par sens.`,
      confidence: "courtage en ligne imprimée (colonne «Staffeltarif Online»)",
    };
  },
});

cli(import.meta.url, roundTrip);
