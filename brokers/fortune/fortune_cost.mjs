// What one round trip costs at Fortune Securities: buy n shares at price p,
// sell them back at once, in dollars. Online (Fortune Connect), PSX ready
// market. Custody stays out.
//
// The "Commission Structure" PDF linked from the equities page, read on
// 2026-10-26:
//
//   https://fortunesecurities.com/webImages/doc/Tariff-Fortune-Securities-Ltd.pdf
//
//   "Commission Schedule (Standard Range/Scale of Brokerage Commission with
//   the approval of SECP as per PSX/N-1258)"
//   "Regular Market (Delivery and Square Trades) One Side | 0.01 & Above |
//   0.15% | 0.03 Paisas"   read as max(PKR 0.03 a share, 0.15 %) a side:
//                          the "Low" column is the PSX floor of 3 paisa,
//                          and the PDF quotes it as "3 Paisa per share or
//                          0.15% of the transaction value, whichever is
//                          higher"
//   "Commission is exclusive of levies."
//   "Sindh Sales Tax | 13% on Commission Amount": the page is older than
//   1 July 2024 (its CGT table is FY 2021-22); the office is in Clifton,
//   Karachi, so Sindh SST 15 % is used.
//   "Clearing House Fee | Nil (Borne by Broker)", "Regulatory Fee | Nil
//   (Borne by Broker)", "NCCPL Charges | Nil (Borne by Broker)", "CDC
//   Charges | Nil (Borne by Broker)": the NCCPL and CDC levies are left
//   out of this trip. The PSX trading fee (with its SST) is not on the
//   list, and the SECP levy is "Nil (If not applicable)", which it is not
//   on a PSX trade: both stay.
//   CDC sub-account Rs 400, UIN Rs 200 and CKO Rs 75 a year, the account
//   opening checks and physical deposits: not per order, out.
//
// "One Side" is the rate each way; the PDF does not say a same-day square
// pays one side, so the trip charges it each way and adds no remark.
//
// PSX trading fee plus SST, SECP levy, the floor and their sources:
// ../nextcapital/psxCost.mjs. CGT is a tax on the gain: out.
//
//   node brokers/fortune/fortune_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//   node brokers/fortune/fortune_cost.mjs KEL PSX PKR --shares=45600 --price=6.09 --bp=10
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, leviesNote, paisa, LEVY_SOURCES, CASH, SALES_TAX } from "../nextcapital/psxCost.mjs";
import { toUsd } from "../../fx.mjs";
import { finite } from "../../na.mjs";

const TARIFF = "https://fortunesecurities.com/webImages/doc/Tariff-Fortune-Securities-Ltd.pdf";

// "0.15%" with the "Low" of "0.03 Paisas": whichever is higher, every price.
const BANDS = [{ upTo: Infinity, perShare: 0.03, rate: 0.0015 }];

const base = makePsxCost({
  folder: "fortune",
  brand: "Fortune Securities",
  catalogueUrl: new URL("fortune-parsed.json", import.meta.url),
  url: TARIFF,
  urls: ["https://fortunesecurities.com/fortune-connect"],
  readOn: "2026-10-26",
  salesTax: SALES_TAX.sindh,
  plans: {
    online: {
      label: "Online",
      basis:
        "Fortune Securities : 0,15 % de la valeur, au moins 0,03 PKR par action, à chaque sens, plus SST 15 % (la page imprime encore 13 %)",
      side: ({ notional, shares, price }) => bandSide(BANDS, notional, shares, price),
    },
  },
  notes: [
    "tariff prints SST 13% (older than 1 July 2024): Sindh SST 15% used (Karachi office)",
    "NCCPL and CDC charges printed \"Nil (Borne by Broker)\": left out",
    "same-day square not described: commission each way",
  ],
});

// Fortune bears the NCCPL and CDC charges: the client pays the PSX trading
// fee with its SST and the SECP levy only.
const LEVIES_BASIS =
  "par sens : frais de négociation PSX 3,50 PKR pour 100 000 PKR échangés plus SST 15 %, prélèvement SECP 0,65 PKR pour 100 000 PKR ; NCCPL et CDC à la charge du courtier (« Nil (Borne by Broker) ») ; CVT et impôt anticipé à 0 % ; frais réglementaire PSX supprimé depuis le 29 août 2025";
const LEVIES_NOTE =
  "levies each side: PSX trading fee PKR 3.50 per 100,000 plus SST 15%, SECP levy PKR 0.65 per 100,000, CVT and advance tax 0%, PSX regulatory fee discontinued; NCCPL and CDC borne by Fortune";

export function roundTrip(query) {
  const out = base.roundTrip(query);
  const each = out.levies?.each;
  if (!each) return out;
  const kept = paisa(each.psxTrade + each.psxSst + each.secp);
  const v = toUsd(paisa(kept * 2), CASH);
  const leviesUsd = v == null ? null : finite(Number(v.toPrecision(12)), 6);
  const usd = out.usd == null || out.parts?.levies == null || leviesUsd == null ? null : out.usd - out.parts.levies + leviesUsd;
  return {
    ...out,
    usd: finite(usd, 6),
    levies: {
      ...out.levies,
      each: { psxTrade: each.psxTrade, psxSst: each.psxSst, secp: each.secp, cdc: 0, nccpl: 0 },
      basis: LEVIES_BASIS,
      urls: [LEVY_SOURCES.psx, TARIFF],
    },
    parts: { ...out.parts, levies: leviesUsd },
    confidence: String(out.confidence || "").replace(leviesNote(), LEVIES_NOTE),
  };
}

export const { PLANS, planOf } = base;

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage: node brokers/fortune/fortune_cost.mjs <ticker|ISIN> [venue] [currency] [--shares=n] [--price=p] [--bp=x]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
  });
  const show = (value) => (value == null ? "N/A" : value);
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const listing = out.listing;
  console.log(`${listing.ticker || listing.isin} — ${listing.name || ""}`);
  console.log(`${listing.exchange}${listing.mic ? ` (${listing.mic})` : ""}, ${listing.currency}, ${(listing.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const trade = out.trade;
    console.log(`${trade.shares} share${trade.shares > 1 ? "s" : ""} at ${trade.price} ${trade.currency} = ${trade.notional.toFixed(2)} ${trade.currency}\n`);
    console.log(`round trip : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`broker fees: ${show(out.brokerFees)} $`);
    const bill = out.parts || {};
    if (bill.market != null) console.log(`  book       : ${bill.market} $`);
    if (bill.commission != null) console.log(`  commission : ${bill.commission} $`);
    if (bill.levies != null) console.log(`  levies     : ${bill.levies} $`);
    if (bill.taxes) console.log(`  taxes      : ${bill.taxes} $`);
  } else if (out.why) {
    console.log(`round trip : N/A — ${out.why}`);
  }
  if (out.confidence) console.log(`\n${out.confidence}`);
}
