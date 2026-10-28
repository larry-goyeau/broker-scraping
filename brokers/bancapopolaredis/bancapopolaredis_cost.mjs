// What one round trip costs at Banca Popolare di Sondrio (Suisse): buy n
// shares on SIX Swiss Exchange through Trading online (GoBanking) and sell
// them straight back, in dollars. The SIX book, the Swiss stamp, the SIX
// exchange fee, taxMap and the FX rule come from ../migros/sixCost.mjs;
// this file gives the bank's courtage and its currencies.
//
// Read on 2026-10-26:
//   https://www.bps-suisse.ch/trading_online.shtml
//     "operare sui mercati a condizioni vantaggiose, CHF 40.-- per singola
//     operazione" (shares, bonds, warrants, structured products, funds and
//     ETFs, for Execution Only and advisory clients).
//   https://www.bps-suisse.ch/pdf/bpsDoc_tariffario_prodotti_servizi_investimento_1.pdf
//     (Tariffario prodotti e servizi d'investimento, from 1 August 2024)
//     "Trading online ... CHF 40.-- per singola operazione. Escluse: tassa
//     federale di negoziazione, imposte e spese di terzi dove applicabili."
//     Execution Only "Classic": flat fee 0.40% a year, min CHF 100, which
//     includes custody (remark).
//   https://www.bps-suisse.ch/conto_corrente_privati.shtml
//     "Il conto può essere aperto in CHF, EUR e valuta estera."
//
// Commission: CHF 40 a side, whatever the amount or currency. The exchange
// fee ("spese di terzi") is SIX's own list, added by the engine.
//
// FX: the current account opens in CHF, EUR and "valuta estera" (no list);
// the investment tariff names "Depositi vincolati (CHF/EUR/USD)", so CHF,
// EUR and USD are taken as held. No markup is printed, so a listing in
// another currency (GBP, JPY, AUD, CAD, SGD) is N/A.
//
// Left out: the "Modello Classico" percentage tariff (orders given to the
// bank, not online), Ticket-model fees, VAT on the flat custody fee.
//
//   node brokers/bancapopolaredis/bancapopolaredis_cost.mjs NESN XSWX CHF --shares=12 --price=80
//   node brokers/bancapopolaredis/bancapopolaredis_cost.mjs CSSPX XSWX USD --shares=2 --price=650
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip } from "../migros/sixCost.mjs";

const PAGE = "https://www.bps-suisse.ch/trading_online.shtml";
const TARIFF = "https://www.bps-suisse.ch/pdf/bpsDoc_tariffario_prodotti_servizi_investimento_1.pdf";
const ACCOUNT = "https://www.bps-suisse.ch/conto_corrente_privati.shtml";
const ONLINE_CHF = 40;

export const roundTrip = makeRoundTrip({
  folder: "bancapopolaredis",
  brand: "BPS (Suisse)",
  catalogue: new URL("bancapopolaredis-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD"],
  fx: null,
  onlineBuy: true,
  remark: "Custody 0.40% a year (min CHF 100).",
  sources: { tariff: TARIFF, account: ACCOUNT },
  commission: () => ({
    chf: ONLINE_CHF,
    min: ONLINE_CHF,
    basis: `Trading online GoBanking : CHF ${ONLINE_CHF} par opération, à l'achat et à la vente.`,
    confidence: "commission fixe publiée pour le Trading online",
  }),
});

cli(import.meta.url, roundTrip);
