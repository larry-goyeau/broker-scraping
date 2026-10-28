// What one round trip costs in Uphold's equities account (Uphold Securities
// Inc.): buy n shares at price p, sell them back at once, in the Uphold app,
// as market orders in regular hours, in dollars. The 4,000 US stocks and
// ETFs of the catalogue, whole or fractional. Crypto and the crypto-funded
// path stay out.
//
// Read 2026-10-26:
//   https://uphold.com/legal/security-disclosures   (Schedule of Fees and Charges, effective 2026-07-21)
//   https://support.uphold.com/hc/en-us/articles/53123035115163   (Funding & Fees, updated 2026-10-23)
//   https://support.uphold.com/hc/en-us/articles/53122698072859   (Get started with Equities)
//
//   commission      $0 each way: "Commission on equity trades, including
//                   fractional shares $0.00".
//   SEC / TAF       the schedule lists both rates (SEC $0.0000206 per dollar,
//                   rounded up; TAF $0.000195 a share, cap $9.79) under
//                   "Uphold Securities pays these fees and does not charge
//                   them to customers", so 0. The help article ("When you
//                   sell, two small regulatory fees are applied") says
//                   otherwise; the signed schedule wins. Either way the TAF
//                   is paused until 2026-12-31 and the SEC on $1,000 is $0.03.
//   CAT             not listed; third-party and regulator charges: "Uphold
//                   Securities currently absorbs these charges", so 0.
//   account fees    opening, maintenance, inactivity $0.00; ACATS out $100
//                   (not this trip).
//   crypto funding  "Standard Uphold fees apply when converting crypto to
//                   USD": optional, cash can be USD, so not in the trip.
//
// Formula: book (605 × Q) + 0 + 0. Uphold Securities clears through Apex
// Clearing Corporation and its routing disclosure points to "our clearing
// firm's" 606 report (https://public.s3.com/rule606/apex/), so a listed US
// line takes Apex's Q ("apex" in spreads/rule606.mjs). The TXSE dual
// listings read the same per-symbol 605.
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/uphold/uphold_cost.mjs US0378331005 XNAS USD --shares=2.8758 --price=347.725
//   node brokers/uphold/uphold_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Uphold",
  folder: "uphold",
  catalogueUrl: new URL("uphold-parsed.json", import.meta.url),
  url: "https://uphold.com/legal/security-disclosures",
  help: "https://support.uphold.com/hc/en-us/articles/53123035115163",
  routing: "https://public.s3.com/rule606/apex/",
  readOn: "2026-10-26",
  entity: "Uphold Securities Inc. (clearing and custody: Apex Clearing Corporation)",
  rule606: "apex",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  basis:
    "barème Uphold Securities « Schedule of Fees and Charges » (en vigueur le 2026-07-21), relu le 2026-10-26 : " +
    "« Commission on equity trades, including fractional shares $0.00 »",
  notes: [
    "SEC et TAF listées mais « Uphold Securities pays these fees and does not charge them to customers » : 0 (l'aide dit le contraire, le barème prime)",
    "compensation chez Apex Clearing, 606 d'Apex : Q d'Apex",
    "financement en crypto converti en USD aux frais Uphold, au choix du client : hors trajet",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
