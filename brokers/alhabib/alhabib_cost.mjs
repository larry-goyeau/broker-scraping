// What one round trip costs at AL Habib Capital Markets (AL Habib Capital
// GROW): buy n shares at price p, sell them back at once, in dollars.
// Online (desktop, mobile app and web trading), PSX ready market. Custody
// stays out.
//
// The GROW page, read on 2026-10-26, prints the brokerage commission of its
// two accounts:
//
//   https://www.ahcml.com/grow
//
//   "GROW Basic   PKR 0.03 per share or 0.15% of the trade value,
//                 whichever is higher*"
//   "GROW Premium PKR 0.05 per share or 0.17% of the trade value,
//                 whichever is higher*"
//   "* One-side commission will be charged where the same security is
//   bought and sold in the same quantity. Applicable taxes, levies and
//   regulatory charges may apply separately."
//   "Maximum Up to 2.5% of the transaction value."
//
//   GROW Basic is the Grow Value account, "a self-directed trading account
//   ... without any assigned trader" (the default here). Grow Premium is
//   "an online trading account complemented by a dedicated trader",
//   "enabling investors to trade independently": still online,
//   `--plan=premium` (as foundation's Edge Prime).
//
// Each account prints its own rate; "Maximum Up to 2.5%" is the exchange's
// ceiling on any commission (PSX standard range, PSX/N-1258), not a range
// the account is priced in, so the printed rates are used.
//
// The one-side rule is the PSX same-day square (a security bought and sold
// back in the same quantity): this trip is not squared the same day, so
// the commission is each way; the remark gives the saving.
//
// AL Habib prints no sales-tax rate. Head office "GF-01 Technocity, Hasrat
// Mohani Road, Karachi": Sindh sales tax, 15 % since 1 July 2024.
//
// Levies (PSX trading fee plus SST, SECP levy, CDC 0.0036 %, NCCPL), the
// floor and their sources: ../nextcapital/psxCost.mjs.
//
// CGT is a tax on the gain: out.
//
//   node brokers/alhabib/alhabib_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//   node brokers/alhabib/alhabib_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10 --plan=premium
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, SALES_TAX } from "../nextcapital/psxCost.mjs";

const BASIC = [{ upTo: Infinity, perShare: 0.03, rate: 0.0015 }];
const PREMIUM = [{ upTo: Infinity, perShare: 0.05, rate: 0.0017 }];

const cost = makePsxCost({
  folder: "alhabib",
  brand: "AL Habib Capital Markets",
  catalogueUrl: new URL("alhabib-parsed.json", import.meta.url),
  url: "https://www.ahcml.com/grow",
  readOn: "2026-10-26",
  salesTax: SALES_TAX.sindh,
  plans: {
    basic: {
      label: "GROW Basic",
      basis:
        "AL Habib GROW Basic : le plus élevé de 0,03 PKR par action et 0,15 % de la valeur, à chaque sens, plus SST 15 %",
      side: ({ notional, shares, price }) => bandSide(BASIC, notional, shares, price),
    },
    premium: {
      label: "GROW Premium",
      basis:
        "AL Habib GROW Premium : le plus élevé de 0,05 PKR par action et 0,17 % de la valeur, à chaque sens, plus SST 15 %",
      side: ({ notional, shares, price }) => bandSide(PREMIUM, notional, shares, price),
    },
  },
  planAliases: { value: "basic", "grow-basic": "basic", "grow-value": "basic", "grow-premium": "premium" },
  remark: "Selling the same day pays commission half less.",
  notes: [
    "no sales-tax rate printed: Sindh SST 15% (Karachi head office)",
    "one-side commission when the same security is bought and sold in the same quantity: the trip pays it each way",
    "\"Maximum Up to 2.5%\" read as the PSX ceiling; the account's printed rate is used",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
