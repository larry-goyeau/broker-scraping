// What one round trip costs at Navy Federal Digital Investor (Navy Federal
// Investment Services, LLC, self-directed accounts for Navy Federal Credit
// Union members): buy n shares at price p, sell them straight back, online,
// in dollars. US-listed stocks and ETFs, whole or fractional.
//
// Read in full 2026-10-26:
//   https://www.navyfederal.org/content/dam/nfculibs/pdfs/nffg/digital-investor-crs-form.pdf   (Client Relationship Summary, October 2024)
//   https://www.navyfederal.org/investment-services/investments.html
//   https://www.navyfederal.org/content/dam/nfculibs/pdfs/nffg/Digital%20Investor%20Fee%20Schedule.pdf   (service fees as of 8/12/26)
//   https://www.navyfederal.org/investment-services/disclosures.html   (606)
//
//   commission       "The subscription-based fee means you will not pay a
//                    commission on any trades": $0
//   subscription     "Self-directed accounts pay a monthly subscription fee
//                    of $3.50 ($2.50 for NFCU Active-Duty members with Active
//                    Duty Checking accounts ...)": remark, not in the trip
//   share allowance  "The monthly subscription fee covers up to 2,000 shares
//                    traded per month. If you trade over 2,000 shares ...
//                    $0.01/per share for all trades in excess of 2,000
//                    shares will be passed through". The trip is taken as the
//                    month's only trading: the buy uses n of the 2,000, the
//                    sell the next n, and every share past 2,000 pays $0.01
//   service fees     outgoing ACAT $75, wires, paper: not on an order
//   SEC, TAF, CAT    not printed: 0 (owner rule)
//
// Formula: book + $0.01 × max(0, 2n − 2,000).
//
// Routing: "Digital Investor accounts are routed to Drivewealth, LLC and
// Apex" (disclosures page). The FINRA 606 bulk 2026 Q2 adopt-by-reference
// list has NFIS (CRD 138459) with DriveWealth (165429) and Apex (13071) from
// 2026 Q1. Two dealers named: like an ALIASES array, the one with the higher
// Q is taken (rule606.mjs `aliasOf` rule).
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/navyfederaldigit/navyfederaldigit_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/navyfederaldigit/navyfederaldigit_cost.mjs US9229083632 ARCX USD --shares=1.41 --price=709.175
//   node brokers/navyfederaldigit/navyfederaldigit_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";
import { qOf } from "../../spreads/rule606.mjs";

const ALLOWANCE = { shares: 2000, perShare: 0.01 };
const SUBSCRIPTION = { month: 3.5, activeDuty: 2.5 };
const DEALERS = ["drivewealth", "apex"];
const pickDealer = () => {
  let best = DEALERS[0];
  let bestQ = -Infinity;
  for (const key of DEALERS) {
    const q = qOf(key);
    if (q != null && q > bestQ) [best, bestQ] = [key, q];
  }
  return best;
};

/** Pass-through per side when this trip is the month's only trading. */
export function passThrough(shares) {
  const over = (used) => Math.max(0, used - ALLOWANCE.shares);
  const buy = over(shares) * ALLOWANCE.perShare;
  const sell = (over(2 * shares) - over(shares)) * ALLOWANCE.perShare;
  return { buy: Number(buy.toFixed(2)), sell: Number(sell.toFixed(2)) };
}

const SCHEDULE = {
  broker: "Navy Federal Digital Investor",
  folder: "navyfederaldigit",
  catalogueUrl: new URL("navyfederaldigit-parsed.json", import.meta.url),
  url: "https://www.navyfederal.org/content/dam/nfculibs/pdfs/nffg/digital-investor-crs-form.pdf",
  readOn: "2026-10-26",
  entity: "Navy Federal Investment Services, LLC",
  crd: "138459",
  rule606: pickDealer(),
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: ({ shares }) => {
    const t = passThrough(shares);
    return { ...t, note: t.buy + t.sell > 0 ? `au-delà de 2 000 parts dans le mois : 0,01 $ la part (${t.buy} $ + ${t.sell} $)` : null };
  },
  levies: { sec: false, taf: false, cat: false },
  remark: `$${SUBSCRIPTION.month.toFixed(2)}/month.`,
  basis:
    "Client Relationship Summary NFIS (octobre 2024), relu le 2026-10-26 : 0 $ de commission, abonnement 3,50 $/mois " +
    "couvrant 2 000 parts échangées par mois, 0,01 $ la part au-delà",
  notes: () => [
    "abonnement 3,50 $/mois (2,50 $ avec Active Duty Checking) : en remarque, hors total",
    "trajet supposé seul du mois pour le compteur des 2 000 parts",
    `606 : « Digital Investor accounts are routed to Drivewealth, LLC and Apex » ; Q le plus haut des deux retenu (${pickDealer()})`,
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
