// What one round trip costs at TIAA Brokerage (TIAA-CREF Individual &
// Institutional Services, LLC, carried by Pershing LLC): buy n shares at
// price p, sell them straight back, online, in dollars. US-listed stocks,
// ETFs and ETNs. Options, funds and bonds stay out.
//
// tiaa.org does not answer plain HTTP clients; both documents were read in
// full from their Wayback copies on 2026-10-26:
//   https://www.tiaa.org/public/pdf/commissions_and_fees.pdf
//     (web.archive.org/web/20251119052108id_/..., form A15034 (01/25))
//   https://www.tiaa.org/public/pdf/BrokerageAccountCustomerAgreement.pdf
//     (web.archive.org/web/20250710035627id_/..., commission and fee schedule)
//
//   "Online equities, ETFs and options"   "No charge"
//   Client Service Assistance             "$55 transactional fee" (not this trip)
//   Equity notes                          "Orders to buy shares priced under $1 ... will not
//                                         be accepted": a price under $1 is refused
//   SEC Section 31 transaction fee        "Varies per transaction. Visit https://www.SEC.gov
//                                         for the current rate": SEC's rate, on the sale,
//                                         nearest cent (no rounding printed)
//   FINRA Trading Activity Fee            "Varies per transaction/security. Visit
//                                         https://www.finra.org/...trading-activity-fee for
//                                         the current rates": FINRA's rate, which is paused
//                                         until 2026-12-31, so $0 today
//   CAT                                   not printed: 0
//   ADR agent servicing fee               "$0.01 to $0.03 per share", a depositary fee,
//                                         not this trip
//   outgoing transfer $50, wires $25      not on an order
//
// Formula: book (quoted NBBO × shares) + $0 + $0 + SEC on the sale + TAF on
// the sale (0 during FINRA's pause).
//
// Routing: TIAA-CREF Individual & Institutional Services, LLC (CRD 20472)
// files its own 606 (FINRA 606 bulk 2026 Q2, 20472_606_NMS_2026_Q2_V1).
// Key `tiaacref` in spreads/rule606.mjs: the book is the blended 605 × that
// 606's Q.
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/tiaa/tiaa_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/tiaa/tiaa_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "TIAA Brokerage",
  folder: "tiaa",
  catalogueUrl: new URL("tiaa-parsed.json", import.meta.url),
  url: "https://www.tiaa.org/public/pdf/commissions_and_fees.pdf",
  agreement: "https://www.tiaa.org/public/pdf/BrokerageAccountCustomerAgreement.pdf",
  readOn: "2026-10-26",
  entity: "TIAA-CREF Individual & Institutional Services, LLC",
  crd606: "20472",
  clearing: "Pershing LLC",
  rule606: "tiaacref",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "nearest", taf: "nearest", cat: false },
  tradable: (ctx) =>
    ctx.price > 0 && ctx.price < 1 ? "TIAA n'accepte pas d'ordre d'achat sous 1 $ la part (Equity Notes)" : null,
  basis:
    "barème TIAA Brokerage (résumé A15034 01/25 et contrat client), relu le 2026-10-26 : " +
    "« No charge » pour les actions et ETF en ligne",
  notes: [
    "SEC et TAF répercutées au taux officiel (contrat client : « Visit https://www.SEC.gov for the current rate »), arrondi non imprimé : centime le plus proche",
    "606 de TIAA-CREF Individual & Institutional Services (CRD 20472), 2026 T2",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
