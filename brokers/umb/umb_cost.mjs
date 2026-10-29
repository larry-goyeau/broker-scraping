// What one round trip costs in UMB Bank's self-directed brokerage account
// (UMB Financial Services, Inc., Kansas City; clearing broker National
// Financial Services, Fidelity): buy n shares at price p, sell them back at
// once, online, in regular hours, in dollars. US-listed stocks and ETFs.
//
// Read 2026-10-26:
//   https://www.umb.com/wealth-management/investing/self-direct-investing
//   (the fees_url https://www.umb.com/personal-banking/investing/self-direct-investing
//   redirects there)
//
//   commission      "Commission schedule ... Stocks $22.50" base charge plus
//                   "$0.0075" per share, each way (the self-directed online
//                   schedule; ETFs trade as stocks).
//   phone           "Investor Service Center ... Stocks $45.00 $0.0075"
//                   ($75.00 advisor-assisted): not online, not this trip.
//   SEC / TAF / CAT SEC and TAF added at the regulators' rates on the sale,
//                   rounded up to the cent (none is printed; owner,
//                   2026-10-28). CAT: no rate printed, 0.
//   custody         "Annual Custodial Fee $50 annually": remark, not the
//                   trip. Wiring $15, transfer out $100: not the trip.
//
// Formula: book + ($22.50 + $0.0075 × n) × 2. All equity trades are "routed
// and executed through National Financial Services" (NFS, Fidelity, CRD
// 13041), and "UMB Financial Services Inc.'s quarterly SEC Rule 606(a)
// reports follow": UMB files its own (CRD 17073), key `umbfs` in
// spreads/rule606.mjs, the book is the blended 605 × that 606's Q.
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/umb/umb_cost.mjs US0378331005 XNAS USD --shares=2.8758 --price=347.725
//   node brokers/umb/umb_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const STOCK = { base: 22.5, perShare: 0.0075 };

const SCHEDULE = {
  broker: "UMB Bank",
  folder: "umb",
  catalogueUrl: new URL("umb-parsed.json", import.meta.url),
  url: "https://www.umb.com/wealth-management/investing/self-direct-investing",
  readOn: "2026-10-26",
  entity: "UMB Financial Services, Inc. (clearing: National Financial Services LLC)",
  rule606: "umbfs",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: (ctx) => {
    const each = Number((STOCK.base + STOCK.perShare * ctx.shares).toFixed(4));
    return { buy: each, sell: each, note: `${STOCK.base} $ + ${STOCK.perShare} $ la part à l'achat et à la vente` };
  },
  levies: { sec: "up", taf: "up", cat: false },
  remark: "Custody $50/year.",
  basis:
    "barème UMB « Commission schedule » (investissement autonome), relu le 2026-10-26 : " +
    "« Stocks $22.50 » de base + « $0.0075 » la part",
  notes: [
    "ordres au téléphone (Investor Service Center) 45 $ + 0,0075 $ la part : hors ligne, hors trajet",
    "606 de UMB Financial Services (CRD 17073), 2026 T2",
    "frais de garde 50 $/an hors trajet",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
