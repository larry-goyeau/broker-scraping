// What one round trip costs at First Metro Securities (FirstMetroSec):
// buy n shares at price p, sell them back at once, in dollars. Online only.
//
// "Fees and Charges" (help centre article 55429528585369, behind Cloudflare,
// read through the Zendesk API .../api/v2/help_center/en-us/articles/
// 55429528585369.json) on 2026-10-26, "Effective September 4, 2025", the
// same for the peso and the dollar-denominated (DDS) account, purchase and
// sale:
//   A. Commission, 1. Online Trading     "0.25% of the gross value"
//   B. Value Added Tax                   "12% of the Commission"
//   C. PSE Transaction Fee + VAT         "0.005% of the gross trade value
//                                        + 12% VAT"
//   D. SCCP Charges                      "0.01% of the gross trade value."
//   E. Sales Transaction Tax (sale)      "0.1% of the gross trade value",
//                                        "reduced from 0.6% to 0.1% effective
//                                        July 1, 2025 (Republic Act No. 12214
//                                        ...)"
//   Bank Transfer Charges (PDDTS)        peso account "N/A"; dollar account
//                                        "Actual fees varies per bank"
// No floor is printed. Broker-assisted orders (0.75% peso, 0.50% dollar) are
// not online and stay out, as do the certificate, transfer and Pesonet
// (PHP 50 per withdrawal outside MBT/BDO/BPI/UBP) fees.
//
// Formula, each side: 0.25% + 12% VAT on it + PSE 0.005% + 12% VAT on it
// + SCCP 0.01%; the sell adds the 0.1% tax. Exact, no rounding.
//
// Cash: a peso account and a USD account ("To invest in DDS, open a USD
// FirstMetroSec account", article 55429167151129), so the three PSE dollar
// lines (DTEL, TCB2A, TCB2B) are priced in dollars with the remark that a
// peso balance would be converted, as utrade. Their PDDTS bank transfer
// charge "varies per bank" and has no figure: unknown + x = unknown, so
// their broker fees are N/A (they have no book leaf either).
//
//   https://help.firstmetrosec.com.ph/hc/en-us/articles/55429528585369-Fees-and-Charges
//   https://help.firstmetrosec.com.ph/hc/en-us/articles/55429167151129-Dollar-Denominated-Securities-DDS
//
//   node brokers/firstmetro/firstmetro_cost.mjs SM PSE PHP --shares=120 --price=497
//   node brokers/firstmetro/firstmetro_cost.mjs DTEL PSE USD --shares=5000 --price=0.2
//
// `roundTrip(...)` reads files, not the network.

import { PSE_FEE, SCCP_FEE, pseRoundTrip, printCli } from "./pseCost.mjs";
import { fxRemark } from "../../fx.mjs";

const SCHEDULE = {
  broker: "First Metro Securities",
  folder: "firstmetro",
  catalogueUrl: new URL("firstmetro-parsed.json", import.meta.url),
  url: "https://help.firstmetrosec.com.ph/hc/en-us/articles/55429528585369-Fees-and-Charges",
  readOn: "2026-10-26",
  commission: { rate: 0.0025 },
  levies: [
    { name: "PSE", rate: PSE_FEE, vat: true },
    { name: "SCCP", rate: SCCP_FEE },
  ],
  cash: ["PHP", "USD"],
};

export function roundTrip(query) {
  const r = pseRoundTrip(SCHEDULE, query);
  if (!r.listing) return r;
  if (r.listing.currency !== "USD") return { ...r, remark: "" };
  // Dollar lines: FX remark as utrade; PDDTS bank charge unpublished.
  return {
    ...r,
    remark: fxRemark("", "USD"),
    usd: null,
    brokerFees: null,
    why: `${r.listing.ticker || query.etf} se règle sur le compte en dollars : les frais de virement bancaire PDDTS « varient selon la banque » et n'ont pas de montant publié`,
  };
}

printCli(import.meta.url, roundTrip);
