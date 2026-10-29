// What one round trip costs at Peninsula Federal Credit Union: buy n shares
// at price p, sell them back at once, online, in regular hours, in dollars.
// US exchange-listed stocks and ETFs in the InvestiFi Self-Directed
// Investment Portal inside PFCU online banking. Guided Investing (AdvisiFi)
// and crypto stay out.
//
// Broker InvestiFi Securities LLC (CRD 289604), clearing and custody RQD
// Clearing LLC (CRD 134284). Investing page read 2026-10-26:
//
//   https://www.peninsulafcu.com/investing-securities
//
//   commission     $0 each way: "zero commissions on any trade and no fees on
//                  buys", "no fee charges for purchasing"; the InvestiFi
//                  Securities Customer Agreement (section 23, the same as the
//                  other InvestiFi credit unions): "We do not currently charge
//                  fees, such as commissions, mark-ups or otherwise, on
//                  Customer Account transactions"
//   SEC / TAF / CAT  SEC and TAF added at the regulators' rates on the sale,
//                    rounded up to the cent (Frankenmuth CU, on the same
//                    InvestiFi platform, prints the SEC fee; owner,
//                    2026-10-28). CAT: no rate printed, 0.
//   order cap      "You can purchase up to $5,000 of stocks and EFTs in a
//                  single transaction": a larger trip is refused (one order);
//                  minimum $1
//
// Formula: book (quoted NBBO, see below) + 0 + SEC and TAF on the sale.
//
// Routing: InvestiFi files no 606 of its own. The FINRA 606 bulk file, 2026
// Q2 adopt-by-reference list, has "289604|INVESTIFI SECURITIES LLC|134284|RQD*
// CLEARING, LLC" (2025 Q4 and 2026 Q1). RQD's 2026 Q2 report is not in that
// zip; spreads/rule606.mjs reads it on FINRA's CDN (key `rqd`): the book is
// the blended 605 × that 606's Q.
//   https://cdn.finra.org/606/2026/134284_606_NMS_2026_Q2_V1.xml
//
// Cash is the member's PFCU account in dollars and every line is in dollars:
// no conversion. Advisory and crypto fees do not ride on a share order.
//
//   node brokers/peninsulafederal/peninsulafederal_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/peninsulafederal/peninsulafederal_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const CAP = 5000;

const SCHEDULE = {
  broker: "Peninsula FCU",
  folder: "peninsulafederal",
  catalogueUrl: new URL("peninsulafederal-parsed.json", import.meta.url),
  url: "https://www.peninsulafcu.com/investing-securities",
  readOn: "2026-10-26",
  entity: "InvestiFi Securities LLC (CRD 289604), clearing RQD Clearing LLC (CRD 134284)",
  // InvestiFi adopts RQD Clearing's 606 by reference; key `rqd`.
  rule606: "rqd",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: "up", cat: false },
  tradable: (ctx) =>
    ctx.notionalUsd != null && ctx.notionalUsd > CAP ? `au-delà de ${CAP} $ par ordre d'achat (plafond Peninsula FCU)` : null,
  remark: "",
  basis: "page Investing & Securities de Peninsula FCU relue le 2026-10-26 : aucune commission, aucun frais d'achat (InvestiFi Securities, accord client section 23)",
  notes: ["achat plafonné à 5 000 $ par ordre, minimum 1 $"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
