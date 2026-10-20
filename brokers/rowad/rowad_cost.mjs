// What one round trip costs at Al Rowad Securities Brokerage: buy n
// shares (or EGX 30 ETF units) on the Egyptian Exchange, sell them back,
// in dollars. Online order through the e-trade site.
//
// https://alrowadonline.com/Commission.aspx
// read on 2026-10-18. The page prints one line:
//   Execution commission   "عمولة التنفيذ (0.005) خمسة فى الالف", five per
//                          thousand of the order, each side. No minimum,
//                          no ticket and no online discount is printed.
//                          The page does not say whether the market's
//                          lines are inside it; they are levied on every
//                          member's order, so they are added on top.
// The market's lines (EGX, MCDR, FRA, risk insurance, T0 stamp) are the
// third-party card in ./egxdelivery.mjs, read the same day:
//   EGX and MCDR 0.01 % each, FRA 0.005 % (min EGP 1), insurance 0.005 %,
//   stamp 0.025 % a side on a same-session trip (T1/T2 0.05 %).
// MCDR custody (0.01 % a year) is not per trip and stays in the remark.
// Nile Sat (EGSA) is a dollar line and pays the same rates in dollars.
// The account holds pounds only (deposits.mjs), so EGSA must be bought
// with dollars Al Rowad converts at a rate it does not print: its total
// is unknown.
// The EGX book is not stored, so the total stays unknown until it is.
//
//   node brokers/rowad/rowad_cost.mjs COMI EGX EGP --shares=10 --price=90
//
// `roundTrip(...)` reads files, not the network.

import { egyptRoundTrip, printCli } from "./egxdelivery.mjs";
import { depositHas } from "../../deposits.mjs";

const SCHEDULE = {
  broker: "Al Rowad",
  folder: "rowad",
  catalogueUrl: new URL("rowad-parsed.json", import.meta.url),
  url: "https://alrowadonline.com/Commission.aspx",
  readOn: "2026-10-18",
  rate: 0.005,
  basis: "commission d'exécution",
  remark: "",
};

export function roundTrip(query) {
  const out = egyptRoundTrip(SCHEDULE, query);
  const currency = out.listing?.currency;
  if (!currency || depositHas("rowad", "", currency)) return out;
  return {
    ...out,
    usd: null,
    brokerFees: null,
    why: `change obligatoire : le compte Al Rowad ne garde que des livres égyptiennes et Al Rowad ne publie pas son taux pour passer en ${currency}`,
  };
}

printCli(import.meta.url, roundTrip);
