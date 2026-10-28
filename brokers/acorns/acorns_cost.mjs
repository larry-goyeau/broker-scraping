// What one round trip costs at Acorns in a Custom Portfolio: buy n shares
// at price p, sell them back, in dollars. The about 100 stocks and 13 ETFs
// of the Custom Portfolio list (see acorns_scraping.mjs).
//
// Acorns Securities, LLC. Pages re-read 2026-10-26:
//
//   https://www.acorns.com/pricing/
//     "No hidden costs or transaction fees — just one, transparent monthly
//     payment"; Acorns Bronze "$4/mo.", Silver "$8/mo.", Gold "$12/mo.";
//     Custom Portfolio stocks and ETFs are a "Gold subscription exclusive".
//   https://help.acorns.com/hc/en-us/articles/Are-my-trades-instant-for-Custom-Portfolio
//     "Buying and selling stocks in your Custom Portfolio is NOT instant.
//     Acorns trades in what is called “omnibus trading”" (bulk orders in
//     scheduled trade windows).
//
//   commission       $0 each way ("No ... transaction fees")
//   SEC, TAF, CAT    not printed, so 0 (owner rule)
//   subscription     Gold, $12 a month, needed for a Custom Portfolio:
//                    remark, not in the total. Only Gold can hold these
//                    lines, so there is one row, not one per plan.
//
// Formula: book + 0.
//
// Routing: Acorns Securities has no report and no adopt-by-reference line
// in the FINRA 606 bulk file (2026 Q2). Its statement of financial
// condition (31 Dec 2025) names "omnibus account trading agreements with
// clearing firms, RBC Capital Markets, LLC and DriveWealth, LLC in order to
// execute trades", without saying which takes an order: ALIASES
// `acorns` in spreads/rule606.mjs takes the higher Q of the two.
//   https://sqy7rm.media.zestyio.com/Acorns-Securities-SOFC-12-2025-FINAL.pdf
//
// Cash is dollars only (a US bank account), every line is in dollars: no
// conversion.
//
//   node brokers/acorns/acorns_cost.mjs AAPL XNAS USD --shares=3.8 --price=262
//   node brokers/acorns/acorns_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Acorns",
  folder: "acorns",
  catalogueUrl: new URL("acorns-parsed.json", import.meta.url),
  url: "https://www.acorns.com/pricing/",
  help: "https://help.acorns.com/hc/en-us/articles/Are-my-trades-instant-for-Custom-Portfolio",
  readOn: "2026-10-26",
  entity: "Acorns Securities, LLC",
  rule606: "acorns",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  remark: "$12/month (Gold plan).",
  basis: "tarifs Acorns relus le 2026-10-26 : « No hidden costs or transaction fees », portefeuille Custom réservé à Gold (12 $/mois)",
  notes: [
    "abonnement Gold 12 $/mois hors trajet",
    "ordres groupés (« omnibus trading ») aux fenêtres de négociation, pas en direct",
    "606 de RBC Capital Markets ou DriveWealth, le Q le plus haut, 2026 T2",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
