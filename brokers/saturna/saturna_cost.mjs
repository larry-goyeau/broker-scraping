// What one round trip costs at Saturna Brokerage Services (Saturna
// Brokerage Services, Inc., CRD 18437, accounts carried by Pershing LLC on
// a fully disclosed basis): buy n shares at price p, sell them back at
// once, online at saturna.com/sbs, in regular hours, in dollars. US-listed
// stocks, ETFs and ETNs.
//
// The commission-schedule page answers scripts with a Cloudflare 403; the
// same schedule is page 3 of the brochure (SBS-20240524-A, PDF dated
// 2024-05-24), read 2026-10-26. A web search of the page itself shows the
// same figures.
//   https://www.saturna.com/services/commission-schedule
//   https://www.saturna.com/sites/saturna.com/files/files/sbs-brochure.pdf
//
//   Stocks, online        "$14.95" a trade ("Broker-Assisted $24.95")
//   over 1,000 shares     "Add 1¢ per share for each share over 1,000 (if
//                         share price < $1, add ¼¢ per share)"
//   foreign securities    "may be assessed an additional foreign settlement
//                         fee": not this place
//   SEC / TAF / CAT       not printed, so 0
//   inactive account      $25 a year, only with no trade in the year: not
//                         this trip
//
// Formula: book + (14.95 + extra) on the buy + the same on the sale, where
// extra = (n − 1,000) × $0.01 above 1,000 shares ($0.0025 a share when the
// price is under $1).
//
// Routing: Saturna files no 606 of its own. The FINRA 606 bulk file, 2026
// Q2 adopt-by-reference list, has "18437|SATURNA BROKERAGE SERVICES,
// INC|7560|PERSHING LLC" from 2025 Q1. Key `pershing` in
// spreads/rule606.mjs: the book is the blended 605 × Pershing's Q.
//   https://cdn.finra.org/606reportBulk/2026/606_NMS_2026_Q2.zip
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/saturna/saturna_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/saturna/saturna_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const ONLINE = 14.95;
const OVER = { from: 1000, perShare: 0.01, perShareUnderDollar: 0.0025 };

/** One online stock order: $14.95, plus a cent a share above 1,000 shares (¼¢ under $1). */
export function commissionEach(shares, price) {
  const extra = Math.max(0, Number(shares) - OVER.from) * (price < 1 ? OVER.perShareUnderDollar : OVER.perShare);
  return Number((ONLINE + extra).toFixed(6));
}

const SCHEDULE = {
  broker: "Saturna Brokerage Services",
  folder: "saturna",
  catalogueUrl: new URL("saturna-parsed.json", import.meta.url),
  url: "https://www.saturna.com/services/commission-schedule",
  brochure: "https://www.saturna.com/sites/saturna.com/files/files/sbs-brochure.pdf",
  readOn: "2026-10-26",
  entity: "Saturna Brokerage Services, Inc. (CRD 18437), carried by Pershing LLC (CRD 7560)",
  rule606: "pershing",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: (ctx) => {
    const each = commissionEach(ctx.shares, ctx.price);
    return { buy: each, sell: each, note: `commission en ligne ${ONLINE} $ (+ 1 ¢ la part au-delà de 1 000 parts, ¼ ¢ sous 1 $) à l'achat et à la vente : ${each} $` };
  },
  levies: { sec: false, taf: false, cat: false },
  basis:
    "barème Saturna (brochure SBS-20240524-A, page 3), relu le 2026-10-26 : « Stocks » « $14.95 » en ligne, " +
    "« Add 1¢ per share for each share over 1,000 (if share price < $1, add ¼¢ per share) »",
  notes: ["606 de Pershing LLC (CRD 7560), 2026 T2"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
