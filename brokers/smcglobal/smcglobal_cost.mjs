// What one round trip costs at SMC Global (SMC Global Securities Ltd): buy
// n shares, sell them back, in dollars. Online delivery. Not intraday, not
// F&O.
//
// India: two online plans, each a row (`query.plan`):
//   nirvana      Nirvana Plan, https://www.smctradeonline.com/demat-nirvana-plan
//                read on 2026-10-26: "Delivery brokerage of 0.20%" and
//                "Intraday brokerage of 0.02%" after 30 days from opening
//                or once the ₹1,000 first-month benefit is used ("zero
//                brokerage for the first 30 days up to ₹1000"). The default.
//   alphatrader  Alpha Trader Plan, digital clients only,
//                https://www.smctradeonline.com/terms-and-conditions read on
//                2026-10-26: "annual subscription fee of ₹699 + (applicable
//                GST)", "Equity & Futures Delivery: 0.10% of the transaction
//                value", "Intraday Trading & Futures ... 0.01%".
// Both: "Brokerage shall not exceed the limits prescribed by SEBI";
// "Statutory Levies and Taxes will be levied to the clients as prescribed
// by the regulators": STT 0.1% on buy and sell, stamp 0.015% on the buy,
// NSE 0.00307%, BSE by scrip group (BSE's own table,
// ../bajaj/indiaAbroad.mjs), SEBI ₹10 per crore, GST 18% on brokerage +
// transaction + SEBI.
//   DP on a delivery sell       the CDSL fiche of DP 12019100 (SMC Global
//                               Securities, Delhi, the registered office),
//                               https://www.cdslindia.com/dp/dpdetails.aspx?dp_id=19100
//                               read 2026-10-26: "On Market Rs. 15 per ISIN
//                               plus Depository Charges at actual". CDSL's
//                               own debit charge is ₹3.50 (as Bajaj's
//                               pricing page prints it): ₹18.50. No GST
//                               printed. (SMC's Mumbai DP 27000 prints
//                               another scheme, 0.02% min ₹20 max ₹100.)
//
// Abroad: "SMC Global Securities Ltd., as an introducing broker to Saxo
// Bank, Denmark" (https://smcindiaonline.com/international-broking/, read
// 2026-10-26). The catalogue's foreign lines are Saxo Bank's book
// (../saxofr). SMC prints no commission, exchange fee, custody or FX for
// them, so Saxo Bank A/S's own Classic table stands in (owner, 2026-10-26),
// priced by ../saxofr/saxofr_cost.mjs (US 0.08%, min $1; Xetra 0.08%,
// min €3; London 0.08%, min £3; …): the bank that executes and holds the
// lines, with its cash currencies (deposits.mjs lists Saxo's for SMC).
//
//   node brokers/smcglobal/smcglobal_cost.mjs INE002A01018 NSE INR --shares=10 --price=1400
//   node brokers/smcglobal/smcglobal_cost.mjs INE002A01018 BSE INR --shares=10 --price=1400 --plan=alphatrader
//   node brokers/smcglobal/smcglobal_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { pathToFileURL } from "node:url";
import { indiaRoundTrip, pct, rateGap, sebiRate } from "../../indianDelivery.mjs";
import { BSE_TABLE_BASIS, bseTxnRate, catalogueRows, cliArgs, goesToIndia } from "../bajaj/indiaAbroad.mjs";
import { roundTrip as saxoRoundTrip } from "../saxofr/saxofr_cost.mjs";

const CATALOGUE = new URL("smcglobal-parsed.json", import.meta.url);
const NIRVANA = "https://www.smctradeonline.com/demat-nirvana-plan";
const TERMS = "https://www.smctradeonline.com/terms-and-conditions";
const INTL = "https://smcindiaonline.com/international-broking/";
const READ_ON = "2026-10-26";

function txnRate(exchange, row) {
  if (exchange === "NSE") return pct("0.00307");
  if (exchange === "BSE") return bseTxnRate(row, catalogueRows(CATALOGUE));
  return null;
}

const PLANS = {
  nirvana: {
    name: "Nirvana",
    url: NIRVANA,
    delivery: "0.20",
    intraday: "0.02",
    basis: "Nirvana : livraison 0,20 % par ordre (après les 30 premiers jours à 0 ₹, jusqu'à 1 000 ₹).",
    remark: "₹0 brokerage for the first 30 days, up to ₹1,000.",
  },
  alphatrader: {
    name: "Alpha Trader",
    url: TERMS,
    delivery: "0.10",
    intraday: "0.01",
    basis: "Alpha Trader : livraison 0,10 % par ordre ; 699 ₹ + GST par an, hors de cet aller-retour.",
    remark: "₹699 + GST a year.",
  },
};

function india(plan) {
  return {
    broker: "SMC Global",
    folder: "smcglobal",
    catalogueUrl: CATALOGUE,
    url: plan.url,
    readOn: READ_ON,
    brokerageEach: (notional) => notional * pct(plan.delivery),
    txnRate,
    sttRate: pct("0.1"),
    stampRate: pct("0.015"),
    sebiRate: sebiRate(),
    gstRate: 0.18,
    gstOnDp: false,
    ipftRate: 0,
    dpInr: 18.5,
    basis: `${plan.basis} DP 15 ₹ + 3,50 ₹ CDSL par valeur à la vente (fiche CDSL 19100). ${BSE_TABLE_BASIS}`,
    remark: plan.remark,
  };
}

function indiaTrip(plan, query) {
  const out = indiaRoundTrip(india(plan), query);
  if (!(Number(out?.trade?.notional) > 0)) return out;
  const gap = rateGap(pct(plan.delivery), pct(plan.intraday));
  return gap ? { ...out, remark: [`Same day sell fees are ${gap}.`, out.remark].filter(Boolean).join(" ") } : out;
}

const ABROAD = {
  broker: "SMC Global",
  folder: "smcglobal",
  catalogueUrl: CATALOGUE,
  url: INTL,
  readOn: READ_ON,
  dealer: null,
  basis: `Courtage international via Saxo Bank A/S (SMC courtier introducteur), page relue le ${READ_ON}.`,
};

export function roundTrip(query) {
  const id = String(query.plan || "nirvana").toLowerCase();
  if (goesToIndia(catalogueRows(CATALOGUE), query)) return indiaTrip(PLANS[id] || PLANS.nirvana, query);
  const out = saxoRoundTrip({ ...query, plan: "classic" });
  return {
    ...out,
    url: INTL,
    why: [ABROAD.basis, "SMC n'imprime aucun tarif étranger : barème Classic de Saxo Bank A/S en substitut (choix du propriétaire, 2026-10-26)", out.why]
      .filter(Boolean)
      .join(" ; "),
  };
}

let called = false;
try {
  called = import.meta.url === pathToFileURL(process.argv[1]).href;
} catch {
  called = false;
}
if (called) console.log(JSON.stringify(roundTrip(cliArgs()), null, 2));
