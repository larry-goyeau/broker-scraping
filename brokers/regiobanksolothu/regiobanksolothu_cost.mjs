// What one round trip costs at Regiobank Solothurn: buy n shares or ETF
// units on SIX Swiss Exchange through regioTrading (E-Banking, execution
// only) and sell them straight back, in dollars. The SIX book, the federal
// stamp, the SIX fee, taxMap and the conversion are ../migros/sixCost.mjs
// (through ../graubundnerkanto/sixPlaceCost.mjs); this file gives the
// courtage and the account currencies.
//
// "Gebühren Dienstleistungsangebot Wertschriften", V8, 01.07.2026 (the
// file name still says 2023), read on 2026-10-26:
//   https://www.regiobank.ch/hubfs/08_Medien/05_Dokumente/Gebuehren/Gebuehren_Dienstleistungsangebot_Wertschriften_2023.pdf
//   p. 2 "Courtage regioTrading – Auftragserteilung via E-Banking",
//   "Stufentarif auf dem Bruttowert je Auftrag/Abschluss", column "Aktien
//   und ETF CH":
//     "Bis CHF 1 000 6.000 %", "Minimumgebühr CHF 60.00", "Ab CHF 1 000
//     0.600 %", "Ab CHF 50 000 0.450 %", "Ab CHF 100 000 0.360 %", "Ab CHF
//     250 000 0.300 %", "Ab CHF 500 000 0.150 %"
//   "Bei Aufträgen, welche nicht via E-Banking erteilt werden, kommt der
//   Courtagetarif für regioAssist, zuzüglich CHF 25.00 pro Auftrag, zur
//   Anwendung" (not an online price, left out).
//   p. 4 "Die Ansätze der Courtagetarife verstehen sich ohne eidgenössische
//   Umsatzabgabe, Börsen- und Meldegebühr SIX Swiss Exchange" (the stamp
//   and the official SIX fee, in the engine; the Meldegebühr has no amount
//   and stays out). "Ausländische Brokergebühren sind bei allen
//   Courtagetarifen inbegriffen."
// "Stufentarif" (as opposed to a "Staffeltarif") is read as the rate of
// the band on the whole gross amount, with the CHF 60 minimum; up to
// CHF 1,000 the 6 % never exceeds that minimum. So each side:
// max(CHF 60, band rate x amount).
// The "Aktien und ETF CH" column is read as the trading place (an order on
// SIX), for a foreign share or ETF on SIX too; "Ausland" (0.75 %, CHF 90
// minimum) as foreign exchanges, where foreign broker fees are included.
// Custody, "Dienstleistungsgebühr Depot regioTrading": "0.300 %",
// "Minimumgebühr CHF 100.00" a year, plus VAT: a remark.
//
// Accounts: the "Fremdwährungskonto" (Spezialkonten) lets you make
// transactions "in einer von Ihnen gewählten Währung":
//   https://www.regiobank.ch/privatkunden-zahlen-und-sparen
// Every currency of the SIX book is taken as holdable, so nothing is
// converted. No conversion margin is printed, so no FX remark.
//
// Left out: regioAssist / regioAdvice (adviser tariffs), the SIX
// Meldegebühr (no amount printed), funds, structured products, bonds,
// options and the custody fee in the total.
//
//   node brokers/regiobanksolothu/regiobanksolothu_cost.mjs NESN XSWX CHF --shares=11 --price=77.46
//   node brokers/regiobanksolothu/regiobanksolothu_cost.mjs CSSPX XSWX USD --shares=1 --price=826.43
//   node brokers/regiobanksolothu/regiobanksolothu_cost.mjs NESN XSWX CHF --shares=30 --price=77.46
//
// `roundTrip(...)` reads files, not the network.

import { bandRate, cli, makeRoundTrip, pctFr } from "../graubundnerkanto/sixPlaceCost.mjs";

const PAGE = "https://www.regiobank.ch/hubfs/08_Medien/05_Dokumente/Gebuehren/Gebuehren_Dienstleistungsangebot_Wertschriften_2023.pdf";
const ACCOUNTS = "https://www.regiobank.ch/privatkunden-zahlen-und-sparen";
const MIN_CHF = 60;
const BANDS = [
  { upTo: 999.99, rate: 0.06 },
  { upTo: 49999.99, rate: 0.006 },
  { upTo: 99999.99, rate: 0.0045 },
  { upTo: 249999.99, rate: 0.0036 },
  { upTo: 499999.99, rate: 0.003 },
  { upTo: Infinity, rate: 0.0015 },
];

export const roundTrip = makeRoundTrip({
  folder: "regiobanksolothu",
  brand: "Regiobank Solothurn",
  catalogue: new URL("regiobanksolothu-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP", "JPY", "AUD", "CAD", "SGD"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.3% a year, min CHF 100.",
  sources: { accounts: ACCOUNTS },
  commission({ amountChf }) {
    const band = BANDS.find((b) => amountChf <= b.upTo);
    return {
      chf: bandRate(BANDS, amountChf, MIN_CHF),
      rate: band.rate,
      min: MIN_CHF,
      basis:
        `regioTrading via E-Banking, colonne «Aktien und ETF CH», «Stufentarif» : taux de la tranche sur tout le montant brut ` +
        `(ici ${pctFr(band.rate)} %), minimum CHF ${MIN_CHF}.`,
      confidence:
        "«Stufentarif» lu comme le taux de la tranche sur tout le montant (pas par tranches) ; «CH» lu comme la place (SIX), titre étranger compris",
    };
  },
});

cli(import.meta.url, roundTrip);
