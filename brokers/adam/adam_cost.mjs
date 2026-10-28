// What one round trip costs at Adam Securities: buy n shares at price p,
// sell them back at once, in dollars. Online (Vtrade / web portal), PSX
// ready market. Custody stays out.
//
// The site's "Fee & Commission" and "Commission Slabs" links open the
// exchange's notice on the standard range of brokerage commission, read on
// 2026-10-26. Adam prints no rate of its own:
//
//   https://adamsecurities.com.pk/uploads/files/Commission_Slabs.pdf
//   (PSX/N-1258, 9 October 2019, in force from 14 October 2019)
//
//   Ready Market – Normal       "3p or 0.15% whichever is higher", "On
//                               every buy and sell transaction which is
//                               not squared during the same trading day"
//   Ready Market – Intra-Day    the same, "On one side – either on buy
//   Squared                     side or sell side trade"
//   "The prescribed range is from 3 Paisa per share or 0.15% of the
//   transaction value, whichever is higher, up to 2.5% of the transaction
//   value"; "Rates in each type of transaction can be scaled up within the
//   minimum and maximum ranges"; "Commission is exclusive of levies."
//
// A range left to the broker is a published tariff and takes its maximum
// (owner rule): 2.5 % of the value, each way. Below Rs 1.20 a share the
// exchange minimum of 3 paisa a share is above 2.5 %; the minimum wins
// there (applyFloor).
//
// The intra-day line is one side: the remark says so. This trip is not
// squared the same day, so the commission is each way.
//
// Adam prints no sales-tax rate. Office "Main Stock Exchange Building,
// Pakistan Stock Exchange, Karachi": Sindh sales tax, 15 % since 1 July
// 2024.
//
// Levies (PSX trading fee plus SST, SECP levy, CDC 0.0036 %, NCCPL), the
// floor and their sources: ../nextcapital/psxCost.mjs.
//
// CGT is a tax on the gain: out.
//
//   node brokers/adam/adam_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//   node brokers/adam/adam_cost.mjs ATRL PSX PKR --shares=230 --price=1206
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, SALES_TAX } from "../nextcapital/psxCost.mjs";

// Top of the exchange's standard range, of the traded value, each side.
const RATE = 0.025;

const cost = makePsxCost({
  folder: "adam",
  brand: "Adam Securities",
  catalogueUrl: new URL("adam-parsed.json", import.meta.url),
  url: "https://adamsecurities.com.pk/uploads/files/Commission_Slabs.pdf",
  readOn: "2026-10-26",
  salesTax: SALES_TAX.sindh,
  applyFloor: true,
  plans: {
    online: {
      label: "Online",
      basis:
        "Adam Securities publie la fourchette PSX (PSX/N-1258) : de max(0,03 PKR par action, 0,15 %) jusqu'à 2,5 % ; maximum retenu, 2,5 % à chaque sens (au moins 0,03 PKR par action), plus SST 15 %",
      side: ({ notional }) => ({ each: notional * RATE, band: { rate: RATE } }),
    },
  },
  remark: "Selling the same day pays commission half less.",
  notes: [
    "Adam publishes only the PSX standard range (3 paisa or 0.15% up to 2.5%): maximum 2.5% each way taken (owner rule for a discretionary range)",
    "no sales-tax rate printed: Sindh SST 15% (Karachi office)",
    "intra-day squared trade: one side (PSX/N-1258)",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
