// What one round trip costs at Clientis Entlebucher Bank: buy n shares or
// ETF units on SIX Swiss Exchange through e-Banking ("Direkt", execution
// only) and sell them straight back, in dollars. The SIX book, the federal
// stamp, the SIX exchange fee, taxMap and the dollar answer come from
// ../migros/sixCost.mjs.
//
// Factsheet "Direkt – Execution only", read on 2026-10-26:
//   https://eb.clientis.ch/documents/2239571/4744872/ebs-factsheet-execution-only.pdf
//   "Tarife für Abschlüsse in der Schweiz: An- und Verkauf – Aktien, ETF,
//   Traded Options, Obligationen und ähnliche Papiere: 0.85% (40%
//   e-banking-Rabatt, min. CHF 50.–)"; "Kleinstabschlüsse (z.B. Verkauf
//   Anrechte) bis CHF 500.– 10 %"; "Börsenabgaben und eidg. Steuern werden
//   separat verrechnet." (engine)
// "Preise und Gebühren Wertschriftengeschäft", 21.11.2025, read on
// 2026-10-26, says the same: "Direkt (execution only) (übrige Werte) 0.85%,
// min. CHF 50.00", footnote 3 "Auf Börsenaufträge, die via e-Banking erteilt
// werden, wird auf der Courtage ein Rabatt von 40 % angewendet (mind. ...
// übrige Werte CHF 50.00)".
//   https://eb.clientis.ch/documents/2239571/4744872/EBS_Preise_DL_WS_Geschaeft.pdf
// So one side online is 10 % of the amount up to CHF 500, otherwise
// max(CHF 50, 60 % x 0.85 % = 0.51 % of the amount). A SIX trade is a Swiss
// trade whatever the line's currency.
//
// Accounts: Privatkonto (CHF), Eurokonto, and the "Fremdwährungskonto: Das
// Basiskonto zur Abwicklung des Bargeld-, Zahlungs- und
// Wertschriftenverkehrs in einer fremden, frei handelbaren Währung. Für die
// Fremdwährungen EUR und USD gibt es separate Konti."
//   https://eb.clientis.ch/de/privatkunden/konten/zahlkonten
//   https://eb.clientis.ch/de/privatkunden/konten/zahlkonten/fremdwaehrungskonto
// Every catalogue currency (CHF, EUR, USD, GBP, JPY, AUD, CAD, SGD) is
// freely traded, so no line is converted. No FX markup is printed (the
// "Preise und Gebühren" sheet prices only cash: "Bareinzahlung
// Fremdwährungskonto 1% Disagio"), so no FX remark.
//
// Left out: funds (own tariff), the advisory mandates, foreign exchanges,
// custody (0.30 % a year, min CHF 50: remark; own shares free), the CHF 300
// a year fee for clients domiciled abroad, VAT (not on courtage).
//
//   node brokers/clientisentlebuc/clientisentlebuc_cost.mjs NESN XSWX CHF --shares=10 --price=80
//   node brokers/clientisentlebuc/clientisentlebuc_cost.mjs CSSPX XSWX USD --shares=1 --price=826
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip } from "../migros/sixCost.mjs";

const PAGE = "https://eb.clientis.ch/documents/2239571/4744872/ebs-factsheet-execution-only.pdf";
const RATE = 0.0085;
const DISCOUNT = 0.4;
const ONLINE_RATE = RATE * (1 - DISCOUNT);
const MIN_ONLINE = 50;
const SMALL_UP_TO = 500;
const SMALL_RATE = 0.1;

export const roundTrip = makeRoundTrip({
  folder: "clientisentlebuc",
  brand: "Clientis Entlebucher Bank",
  catalogue: new URL("clientisentlebuc-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP", "JPY", "AUD", "CAD", "SGD"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.30% a year, min CHF 50.",
  sources: {
    tariff: "https://eb.clientis.ch/documents/2239571/4744872/EBS_Preise_DL_WS_Geschaeft.pdf",
    accounts: "https://eb.clientis.ch/de/privatkunden/konten/zahlkonten/fremdwaehrungskonto",
  },
  commission({ amountChf }) {
    if (amountChf <= SMALL_UP_TO) {
      const chf = amountChf * SMALL_RATE;
      return {
        chf,
        min: null,
        rate: SMALL_RATE,
        basis: `«Kleinstabschlüsse bis CHF 500.– 10 %» : CHF ${Number(chf.toFixed(2))} par sens.`,
        confidence: "tarif des très petits ordres publié",
      };
    }
    const chf = Math.max(MIN_ONLINE, amountChf * ONLINE_RATE);
    return {
      chf,
      min: MIN_ONLINE,
      rate: ONLINE_RATE,
      basis: `courtage «Direkt» 0,85 %, rabais e-Banking 40 % (0,51 %), minimum CHF 50 : CHF ${Number(chf.toFixed(2))} par sens.`,
      confidence: "courtage e-Banking publiée (rabais 40 %, minimum CHF 50 imprimé)",
    };
  },
});

cli(import.meta.url, roundTrip);
