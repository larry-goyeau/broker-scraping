// What one round trip costs in Self-Directed Investing by First Citizens
// (First Citizens Investor Services, Inc., CRD 44430, First Citizens Bank's
// broker-dealer): buy n shares at price p, sell them back at once, online,
// in regular hours, in dollars. Exchange-listed US stocks and ETFs.
//
// Read 2026-10-26 (schedule "Effective 12/1/2023", PDF dated 2023-11-02):
//   https://www.firstcitizens.com/content/dam/firstcitizens/pdfs/hosted/wealth/self-directed-investing-fee-schedule.pdf
//   https://www.firstcitizens.com/personal/investments/self-directed-investing
//
//   Stocks & ETFs, online   "$0". Footnote: "Stocks of American companies
//                           traded on the various stock exchanges. Excludes
//                           shares priced less than $3.00 or not trading on
//                           an exchange." The page's disclosure: "Commission-
//                           free trading applies to ... US-listed securities
//                           on major US exchanges", so ADRs listed in the US
//                           are in.
//   under $3.00 a share     excluded from the $0 line and no other online
//                           price is printed for a listed line (OTC equities
//                           are $6.95, call center $40 + $0.03 a share over
//                           1,000): unknown, so the total is N/A.
//   SEC / TAF / CAT         "Commission-free trading does not apply to
//                           transaction fees", but no rate is printed: 0.
//   non-activity fee        $50 a year under $100,000, only with no
//                           activity in the year: not this trip.
//
// Formula: book + 0 + 0 (price ≥ $3.00). Below $3.00: N/A.
//
// Routing: First Citizens Investor Services files its own 606 (CRD 44430
// in the FINRA 606 bulk file, 2026 Q2, <bd> "FIRST CITIZENS INVESTOR
// SERVICES"). Key `firstcitizensis` in spreads/rule606.mjs: the book is the
// blended 605 × that 606's Q.
//   https://cdn.finra.org/606reportBulk/2026/606_NMS_2026_Q2.zip
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/firstcitizens/firstcitizens_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/firstcitizens/firstcitizens_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const MIN_FREE_PRICE = 3;

const SCHEDULE = {
  broker: "First Citizens Bank",
  folder: "firstcitizens",
  catalogueUrl: new URL("firstcitizens-parsed.json", import.meta.url),
  url: "https://www.firstcitizens.com/content/dam/firstcitizens/pdfs/hosted/wealth/self-directed-investing-fee-schedule.pdf",
  page: "https://www.firstcitizens.com/personal/investments/self-directed-investing",
  readOn: "2026-10-26",
  entity: "First Citizens Investor Services, Inc. (CRD 44430)",
  rule606: "firstcitizensis",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: (ctx) =>
    ctx.price < MIN_FREE_PRICE
      ? null
      : { buy: 0, sell: 0, note: "0 $ en ligne sur les actions et ETF cotés aux États-Unis à 3 $ la part ou plus" },
  levies: { sec: false, taf: false, cat: false },
  basis:
    "barème Self-Directed Investing (en vigueur le 12/1/2023), relu le 2026-10-26 : « Stocks & ETFs » « Self-directed Online Trading $0 », " +
    "« Excludes shares priced less than $3.00 or not trading on an exchange »",
  notes: (ctx) => [
    ...(ctx.price < MIN_FREE_PRICE ? ["sous 3 $ la part : hors ligne à 0 $, aucun autre prix en ligne imprimé pour une ligne cotée"] : []),
    "« transaction fees » hors gratuité mais sans taux imprimé : 0",
    "606 de First Citizens Investor Services (CRD 44430), 2026 T2",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
