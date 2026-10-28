// What one round trip costs at HSBC Securities (USA) Inc. in the
// Self-Directed Brokerage account (online banking, HSBC Premier clients):
// buy n shares at price p, sell them back at once, online, in dollars. US
// domestic equities and ETFs (the whole US exchange book, see
// hsbcus_scraping.mjs). International equities (desk only) stay out.
//
// HSBC Securities Brokerage Commission and Fee Schedule, "Effective July
// 15th, 2026", read in full 2026-10-26:
//
//   https://www.us.hsbc.com/content/dam/hsbc/us/en_us/investments/disclosures/hsbc-fee-schedule-investments.pdf
//
//   Domestic U.S. Equities and ETFs
//     "Eligible orders entered online $10.99/trade"
//     "Orders entered by the Wealth Services Desk $35.00/trade" (not online)
//     "All commissions are subject to a 4% of principal maximum charge."
//   General terms: charges "may include, but not be limited to, transaction
//     fees (rounded to the nearest penny on each sale transaction)": the
//     SEC Section 31 fee on the sale, rounded to the nearest cent.
//   TAF, CAT: not printed, so 0.
//   Confirmation fee $2, inactivity fee $50 a year, safekeeping: "No
//     Charge" for HSBC Premier clients, who are the only ones offered the
//     account. Not in the total.
//
// Formula: book (605 × Q) + min($10.99, 4% of principal) on the buy and on
// the sale + SEC on the sale (nearest cent).
//
// Routing: HSBC Securities (USA) files its own 606 (CRD 19585, rule606 key
// "hsbcsecuritiesusa"). The 2026 Q2 adopt-by-reference list also has it
// adopting Pershing's report (7560) from 2025 Q2; Pershing has no key, so
// the firm's own report is used.
//   https://cdn.finra.org/606reportBulk/2026/606_NMS_2026_Q2.zip
//
// Cash is dollars (a US Premier checking account), every line is in
// dollars: no conversion.
//
//   node brokers/hsbcus/hsbcus_cost.mjs AAPL XNAS USD --shares=3.8 --price=262
//   node brokers/hsbcus/hsbcus_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const ONLINE = 10.99;
const CAP = 0.04;

const SCHEDULE = {
  broker: "HSBC Securities (USA)",
  folder: "hsbcus",
  catalogueUrl: new URL("hsbcus-parsed.json", import.meta.url),
  url: "https://www.us.hsbc.com/content/dam/hsbc/us/en_us/investments/disclosures/hsbc-fee-schedule-investments.pdf",
  readOn: "2026-10-26",
  effective: "2026-07-15",
  entity: "HSBC Securities (USA) Inc. (CRD 19585)",
  rule606: "hsbcsecuritiesusa",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  online: ONLINE,
  cap: CAP,
  ticket: (ctx) => {
    const each = ctx.notionalUsd == null ? null : Math.min(ONLINE, ctx.notionalUsd * CAP);
    if (each == null) return null;
    const capped = each < ONLINE;
    return {
      buy: Number(each.toFixed(6)),
      sell: Number(each.toFixed(6)),
      note: capped ? `plafond de 4 % du principal : ${each.toFixed(2)} $ par ordre au lieu de ${ONLINE} $` : `${ONLINE} $ par ordre en ligne`,
    };
  },
  levies: { sec: "nearest", taf: false, cat: false },
  basis: "barème HSBC Securities (en vigueur le 2026-07-15), relu le 2026-10-26 : 10,99 $ par ordre en ligne, plafond 4 % du principal",
  notes: [
    "« transaction fees (rounded to the nearest penny on each sale transaction) » : SEC à la vente",
    "frais de confirmation, d'inactivité et de garde nuls pour les clients Premier",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
