// What one round trip costs in the BNY Brokerage Account (BNY Brokerage
// Services, a division of BNY Mellon Securities Corporation; introduced to
// and cleared by Pershing LLC): buy n shares at price p, sell them straight
// back, online, in dollars. US-listed stocks and ETFs. Mutual funds, bonds,
// options and the managed programs stay out.
//
// Read 2026-10-26:
//   https://www.bny.com/content/dam/im/documents/manual/brochures/bny-mellon-brokerage-account.pdf
//     (brochure DRD-885569-2026-02-12): "Online Trading starting at $2.00",
//     note 1: "$2.00 per trade for the first 1,000 shares and $0.01 per
//     share thereafter. See Fee and Commission Schedule for details."
//   https://www.bny.com/investments/us/en/individual/resources/investment-tools-services/bny-brokerage-account.html
//     note 1: "$8.95 per trade for the first 1,000 shares and $0.01 per
//     share thereafter", the same footnote as the 2022 brochure
//     (MARK-295427-2022-08-22, "Online Trading starting at $8.95"; Wayback
//     copies of the page carry $8.95 since 2025-10).
//
// The February 2026 brochure is the newest dated document and lowers the
// online ticket to $2.00; the page's $8.95 is the older 2022 footnote left in
// place. The trip takes $2.00. The Fee and Commission Schedule itself is
// handed out at enrolment and is not public.
//
//   online equity order   $2.00 for the first 1,000 shares, + $0.01 a share
//                         over 1,000, each way
//   SEC, TAF, CAT         SEC and TAF added at the regulators' rates on the
//                         sale, rounded up to the cent (none is printed;
//                         owner, 2026-10-28). CAT: no rate printed, 0.
//   minimum               $10,000 for the basic account (brochure): not a
//                         cost on the order
//
// Formula: book (quoted NBBO × shares) + 2 × ($2.00 + $0.01 × max(0, n − 1,000)).
//
// Routing: BNY Mellon Securities Corporation (CRD 231) adopts Pershing LLC's
// 606 by reference (FINRA 606 bulk file, 2026 Q2 adopt-by-reference list,
// since 2025 Q1); Pershing (CRD 7560) files 7560_606_NMS_2026_Q2. Key `pershing`
// in spreads/rule606.mjs: the book is the blended 605 × Pershing's Q.
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/bny/bny_cost.mjs US0378331005 XNAS USD --shares=2.8758 --price=347.725
//   node brokers/bny/bny_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const ONLINE = { base: 2.0, sharesIncluded: 1000, perShareOver: 0.01 };
const PAGE_BASE = 8.95;

/** One online equity order, in dollars. */
export function commission({ shares }) {
  if (!(shares > 0)) return null;
  return Number((ONLINE.base + ONLINE.perShareOver * Math.max(0, shares - ONLINE.sharesIncluded)).toFixed(4));
}

const SCHEDULE = {
  broker: "BNY Brokerage",
  folder: "bny",
  catalogueUrl: new URL("bny-parsed.json", import.meta.url),
  url: "https://www.bny.com/content/dam/im/documents/manual/brochures/bny-mellon-brokerage-account.pdf",
  page: "https://www.bny.com/investments/us/en/individual/resources/investment-tools-services/bny-brokerage-account.html",
  readOn: "2026-10-26",
  entity: "BNY Mellon Securities Corporation (BNY Brokerage Services)",
  crd606: "231 → Pershing LLC 7560",
  clearing: "Pershing LLC",
  rule606: "pershing",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: (ctx) => commission(ctx),
  levies: { sec: "up", taf: "up", cat: false },
  basis:
    "brochure BNY Brokerage Account (DRD-885569-2026-02-12), relue le 2026-10-26 : ordre en ligne 2,00 $ jusqu'à 1 000 parts, " +
    "+ 0,01 $ la part au-delà, à l'achat comme à la vente",
  notes: [
    `la page du compte imprime encore ${PAGE_BASE} $ (note de la brochure de 2022) ; la brochure de février 2026, plus récente, fait foi`,
    "606 de Pershing LLC (CRD 7560), 2026 T2",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
