// What one round trip costs in an Empower brokerage account (Empower
// Investment Account or Empower Brokerage IRA, Empower Financial Services,
// Inc., CRD 13109, clearing and custody at Pershing LLC): buy n shares at
// price p, sell them back at once, online, in regular hours, in dollars.
// US-listed stocks and ETFs.
//
// Fee schedule PDF read 2026-10-26 (file dated 2026-09-29, ref.
// EPW-FBK-WF-912903-1026):
//   https://docs.empower-retirement.com/EE/Empower/DOCS/Empower-Brokerage-Multi-Product-Fee.pdf
//   https://www.empower.com/products-solutions/brokerage-accounts
//
//   Equities and ETFs   "$0 for the first 1,000 trades ($19.99 over the
//                       phone)". Footnote 4: "The first one thousand trades
//                       (1,000 trades) placed online each calendar year are
//                       $0; thereafter, each online trade will be charged
//                       $6.95." The trip is two of the first 1,000: $0;
//                       the $6.95 is the remark.
//   SEC / TAF / CAT     footnote 3: "Regulatory and American depositary
//                       receipt (ADR) fees as well as financial transaction
//                       taxes are separate": passed on. No rate or
//                       rounding printed: SEC and TAF at the regulators'
//                       rates, rounded up to the cent; CAT not named, 0.
//   IRA maintenance     $35 a year under $100,000 (IRA only): not this trip.
//
// Formula: book + 0 + SEC and TAF on the sale.
//
// Routing: the FINRA 606 bulk file, 2026 Q2 adopt-by-reference list, has
// "13109|EMPOWER FINANCIAL SERVICES, INC.|7560|PERSHING LLC" from 2024 Q2.
// Empower also files its own report, prepared by Pershing ("Pershing LLC on
// behalf of Empower Financial Services, Inc. (MPID: GWFS)",
// https://www.empower.com/sec-rule-605-rule-606; zip file
// 13109_606_NMS_2026_Q2_CNTXT-Pershing7560GWFS): key `empowerfs` in
// spreads/rule606.mjs, the book is the blended 605 × that 606's Q.
//   https://cdn.finra.org/606reportBulk/2026/606_NMS_2026_Q2.zip
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/empower/empower_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/empower/empower_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Empower",
  folder: "empower",
  catalogueUrl: new URL("empower-parsed.json", import.meta.url),
  url: "https://docs.empower-retirement.com/EE/Empower/DOCS/Empower-Brokerage-Multi-Product-Fee.pdf",
  readOn: "2026-10-26",
  entity: "Empower Financial Services, Inc. (CRD 13109), clearing Pershing LLC (CRD 7560)",
  rule606: "empowerfs",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => ({ buy: 0, sell: 0, note: "0 $ en ligne dans les 1 000 premiers ordres de l'année civile" }),
  levies: { sec: "up", taf: "up", cat: false },
  remark: "Over 1,000 online trades a year: $6.95 a trade.",
  basis:
    "barème Empower Brokerage (PDF du 2026-09-29), relu le 2026-10-26 : « Equities ... and exchange-traded funds (ETFs) » " +
    "« $0 for the first 1,000 trades », puis « $6.95 » par ordre en ligne",
  notes: [
    "frais réglementaires et ADR « separate » : SEC et TAF aux taux des régulateurs, arrondi au centime supérieur (arrondi non imprimé)",
    "606 de Empower Financial Services (CRD 13109), 2026 T2",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
