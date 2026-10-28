// What one round trip costs at Webull South Africa (Webull Securities South
// Africa (Pty) Ltd, FSP 50863; the account is held by Webull Securities
// (Australia) Pty Ltd): buy n shares at price p, sell them back at once,
// online, in regular hours, in dollars. The US stocks and ETFs of the
// catalogue, whole or fractional.
//
// Fee schedule ("Updated on 24 May 2025") and help pages read 2026-10-26:
//   https://www.webull.co.za/pricing
//   https://www.webull.co.za/help/faq/1495-How-do-I-withdraw-funds-from-my-account
//
//   commission   "US$ 0.0025 x Total Trade Amount After the First Month(Min.
//                US$0.50)", each order, so each way. "US$ 0 for the First
//                Month": a new client's first month, remark only.
//   CAT          "US$0.000003 per Share" (charged by FINRA), both legs (the
//                SEC line says "Sells Only", this one does not), unrounded as
//                in ../webull/webull_cost.mjs.
//   SEC          "$0.00002060 * Total Trade Volume", sells only, unrounded.
//   TAF          not printed, so 0.
//   ADR          "US$ 0.01 – 0.03 per Share" custody (DTC): remark, at the
//                top of the range (owner rule).
//   FX           "FX Transfer Fee 50BP".
//   deposits     bank transfer 0, international EFT US$1 (partner bank),
//                withdrawal "must be USD": transfer fees, not this trip.
//
// Formula: book (605 × Q) + 2 × max(0.25% × amount, $0.50) + SEC + 2 × CAT.
//
// Routing: Webull's US orders go through Webull Financial LLC (CRD 289063),
// as for the other Webull entities (webullau → "webull" in ALIASES), so a
// listed US line takes Webull's Q.
//
// Cash: the account holds dollars (international EFT in US$, withdrawals in
// USD), so a dollar line needs no conversion: "FX 0.5% when cash ≠ USD."
//
//   node brokers/webullsouthafric/webullsouthafric_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/webullsouthafric/webullsouthafric_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const RATE = 0.0025;
const MIN = 0.5;
const CAT = 0.000003;
const ADR_NAMED = /American Depositary|\bADRs?\b|\bADS\b/i;

const SCHEDULE = {
  broker: "Webull South Africa",
  folder: "webullsouthafric",
  catalogueUrl: new URL("webullsouthafric-parsed.json", import.meta.url),
  url: "https://www.webull.co.za/pricing",
  readOn: "2026-10-26",
  entity: "Webull Securities South Africa (Pty) Ltd (FSP 50863), account at Webull Securities (Australia) Pty Ltd",
  rule606: "webull",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: (ctx) => Number(Math.max(RATE * ctx.notionalUsd, MIN).toFixed(6)),
  levies: { sec: "exact", taf: false, cat: { perShare: CAT, mode: "exact" } },
  fx: { rate: 0.005 },
  remark: (ctx) =>
    [ADR_NAMED.test(String(ctx.row?.name || "")) ? "ADR custody up to $0.03/share." : "", "No commission in the first month."]
      .filter(Boolean)
      .join(" "),
  basis:
    "barème Webull South Africa (mis à jour le 24 mai 2025), relu le 2026-10-26 : " +
    "0,25 % du montant par ordre, minimum 0,50 US$, + CAT 0,000003 $ la part et SEC 0,0000206 de la vente",
  notes: ["ordres américains via Webull Financial LLC (CRD 289063) : Q de Webull"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
