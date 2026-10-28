// What one round trip costs at Clientis Spar- und Leihkasse Thayngen: buy
// n shares or ETF units on SIX Swiss Exchange through e-Banking and sell
// them back, in dollars. The SIX book, the federal stamp, the SIX exchange
// fee, taxMap and the dollar answer come from ../migros/sixCost.mjs.
//
// "Preise für Dienstleistungen im Wertschriftengeschäft", "Gültig ab
// 01.07.2026", read on 2026-10-26:
//   https://thayngen.clientis.ch/documents/2154777/4757904/THA_Preise_DL_WS_Geschaeft.pdf/b8bdadb2-b2d3-6ee4-a6cc-e222314856b5?t=1562661684957
// "Tarife für Abschlüsse in der Schweiz – An- und Verkauf: Aktien, ETF,
// Traded Options und ähnliche Papiere, Mindestcourtage CHF 80.–": bis CHF
// 50'000 1.10 %, bis CHF 100'000 1.00 %, bis CHF 150'000 0.90 %. No
// "kumuliert" or "für die nächsten", so the band's rate is taken on the
// whole amount; no rate is printed above CHF 150,000 (unknown there).
// "Execution only «Direkt»: 100% (ohne Rabatt, nur über e-Banking 50%
// Rabatt)"; "Auf Börsenaufträge, die via e-Banking erteilt werden, wird ein
// Rabatt von 50% angewendet. Die Minimalsätze werden ebenfalls um 50%
// reduziert." So one side online is max(CHF 40, 50 % x band rate x amount).
// "Börsen- und Steuerabgaben werden getrennt verrechnet." A SIX trade is a
// Swiss trade whatever the line's currency.
// "Kleinstabschlüsse 10%" prints no threshold, so it is not applied.
//
// Accounts: Privatkonto (CHF) and "Eurokonto"
// (https://thayngen.clientis.ch/de/privatkunden/konten); the general price
// list (https://thayngen.clientis.ch/documents/2154777/4757904/THA_Preise_und_Gebuehren.pdf/b9377e88-83bd-61e8-ed75-cbd6e2a6d8c1?t=1571771275456)
// prices "Auszahlung Fremdwährungskonto: Eurokonto ... Übrige Währungen",
// so other foreign-currency accounts exist: CHF, EUR, USD and GBP are taken
// as held. FX: "Kauf / Verkauf von Fremdwährungen" prints no markup, so a
// JPY/AUD/CAD/SGD line (converted both ways) is N/A.
//
// Left out: depot fee «Direkt» 0.25 % a year, at least CHF 50, plus 0.10 %
// on foreign values and CHF 8 a position (remark); advisory mandates (not
// online prices); VAT (not on courtage).
//
//   node brokers/clientissparundl/clientissparundl_cost.mjs NESN XSWX CHF --shares=10 --price=80
//
// `roundTrip(...)` reads files, not the network.

import { bandRate, cli, makeRoundTrip } from "../migros/sixCost.mjs";

const PAGE =
  "https://thayngen.clientis.ch/documents/2154777/4757904/THA_Preise_DL_WS_Geschaeft.pdf/b8bdadb2-b2d3-6ee4-a6cc-e222314856b5?t=1562661684957";
const BANDS = [
  { upTo: 50000, rate: 0.011 },
  { upTo: 100000, rate: 0.01 },
  { upTo: 150000, rate: 0.009 },
];
const DISCOUNT = 0.5;
const MIN_ONLINE = 80 * DISCOUNT;

export const roundTrip = makeRoundTrip({
  folder: "clientissparundl",
  brand: "Clientis Spar- und Leihkasse Thayngen",
  catalogue: new URL("clientissparundl-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.25% a year, at least CHF 50, plus CHF 8 a position.",
  sources: { accounts: "https://thayngen.clientis.ch/de/privatkunden/konten" },
  commission({ amountChf }) {
    const full = bandRate(BANDS, amountChf);
    if (full == null) {
      return { chf: null, basis: "courtage «Abschlüsse in der Schweiz» : aucun taux imprimé au-delà de CHF 150 000.", confidence: "montant hors des tranches imprimées" };
    }
    const chf = Math.max(MIN_ONLINE, full * DISCOUNT);
    return {
      chf,
      min: MIN_ONLINE,
      basis:
        `courtage «Abschlüsse in der Schweiz» (1,10 % jusqu'à CHF 50 000, 1 % jusqu'à 100 000, 0,90 % jusqu'à 150 000, taux de la tranche sur tout le montant), ` +
        `rabais e-Banking 50 % y compris sur le minimum (CHF 80 → 40) : CHF ${Number(chf.toFixed(2))} par sens.`,
      confidence: "courtage en ligne imprimée (rabais e-Banking 50 %, minimum réduit de moitié)",
    };
  },
});

cli(import.meta.url, roundTrip);
