// What one round trip costs at Frankenmuth Credit Union (Michigan): buy n
// shares at price p, sell them back at once, online, in regular hours, in
// dollars. US exchange-listed stocks and ETFs in the InvestiFi Self-Directed
// Investment Portal inside the FCU Consumer App and online banking. Guided
// Investing (AdvisiFi, 0.50% a year) and crypto stay out.
//
// Broker InvestiFi Securities LLC (CRD 289604), clearing and custody RQD
// Clearing LLC (CRD 134284). Invest page and its FAQ read 2026-10-26:
//
//   https://frankenmuthcu.org/invest/
//   https://frankenmuthcu.org/wp-content/uploads/2025/06/InvestiFi-Securities-Customer-Agreement-FINAL.pdf
//
//   commission     $0 each way: "zero commissions on any trade and no fees on
//                  buys", "no fee charges for purchasing"; the customer
//                  agreement (section 23): "We do not currently charge fees,
//                  such as commissions, mark-ups or otherwise, on Customer
//                  Account transactions"
//   SEC            on the sale: "Section 31 (SEC) fee will be applied to sell
//                  orders", "$20.60 per $1,000,000 of securities sold (or
//                  $0.0000206 per dollar)", formula "(Total Principal Amount
//                  of Sale) x 0.0000206 = SEC Fee". The FAQ prints no
//                  rounding (its $50,000 example is a whole $1.03); the trip
//                  rounds up to the cent, as the clearing firms do.
//   TAF / CAT      not printed, so 0
//   order cap      "You can purchase up to $5,000 of stocks and ETFs in a
//                  single transaction": a larger trip is refused (one order);
//                  minimum $1
//
// Formula: book (quoted NBBO, see below) + 0 + SEC on the sale.
//
// Routing: InvestiFi files no 606 of its own. The FINRA 606 bulk file, 2026
// Q2 adopt-by-reference list, has "289604|INVESTIFI SECURITIES LLC|134284|RQD*
// CLEARING, LLC" (2025 Q4 and 2026 Q1). RQD's 2026 Q2 report is not in that
// zip; spreads/rule606.mjs reads it on FINRA's CDN (key `rqd`): the book is
// the blended 605 × that 606's Q.
//   https://cdn.finra.org/606/2026/134284_606_NMS_2026_Q2_V1.xml
//
// Cash is the member's FCU checking account in dollars and every line is in
// dollars: no conversion. Advisory and crypto fees do not ride on a share
// order.
//
//   node brokers/frankenmuthcredi/frankenmuthcredi_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/frankenmuthcredi/frankenmuthcredi_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const CAP = 5000;

const SCHEDULE = {
  broker: "Frankenmuth CU",
  folder: "frankenmuthcredi",
  catalogueUrl: new URL("frankenmuthcredi-parsed.json", import.meta.url),
  url: "https://frankenmuthcu.org/invest/",
  readOn: "2026-10-26",
  entity: "InvestiFi Securities LLC (CRD 289604), clearing RQD Clearing LLC (CRD 134284)",
  // InvestiFi adopts RQD Clearing's 606 by reference; key `rqd`.
  rule606: "rqd",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: false, cat: false },
  tradable: (ctx) =>
    ctx.notionalUsd != null && ctx.notionalUsd > CAP ? `au-delà de ${CAP} $ par ordre d'achat (plafond Frankenmuth CU)` : null,
  remark: "",
  basis: "page Invest de Frankenmuth CU et sa FAQ relues le 2026-10-26 : aucune commission, aucun frais d'achat, frais SEC (section 31) sur la vente",
  notes: ["arrondi de la SEC non imprimé : centime supérieur", "achat plafonné à 5 000 $ par ordre, minimum 1 $"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
