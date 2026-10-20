// What one round trip costs at Dhan: buy n shares, sell them back, in dollars.
//
// India, https://dhan.co/pricing/ read on 2026-09-25.
//   Delivery brokerage          ₹0 for equity and ETFs
//   STT                         0.1% on the buy and on the sell
//   Transaction                 NSE 0.0030699%, BSE 0.00375%
//   GST                         18% of brokerage + transaction + SEBI + IPFT
//   SEBI                        0.0001% of turnover
//   Stamp                       0.015% on the buy
//   IPFT                        0.0000001% of turnover
//   DP                          ₹12.50 + GST per ISIN on the sell
//   STT and stamp round to the rupee. Other charges round to the paisa.
//   Gold, liquid and gilt ETFs have no STT.
//
// United States, https://dhan.co/us-stocks/ read on 2026-09-25.
//   Brokerage                   0.25% of trade value, minimum $0.01, each order
//   A transfer into the US account below $100 costs $1. It is not part of
//   this trip.
//   Cash is rupees only (deposits.mjs), so a US line is a forced INR->USD
//   conversion on the buy and USD->INR on the sell. Dhan prints no rate:
//   "The FX rate applied includes a markup over the interbank rate. The
//   exact rate and markup are shown transparently in the app before you
//   confirm the transfer."
//   https://dhan.co/support/platforms/us-stocks/what-is-the-fx-rate-i-get-is-it-the-interbank-rate/
//   https://dhan.co/support/platforms/us-stocks/what-are-the-charges-for-adding-funds-in-us-stocks/
//   read on 2026-10-19. The change leg is unknown, so the total is N/A.
//   ViewTrade Securities (CRD 46987) executes and clears. The US book is
//   that firm's 606, not a place fill.
//   https://dhan.co/support/platforms/us-stocks/who-are-dhan-s-partners-for-us-stocks/
//
//   node brokers/dhan/dhan_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//   node brokers/dhan/dhan_cost.mjs AAPL NASDAQ USD --shares=10 --price=230

import { indiaRoundTrip, printCli, pct, sebiRate, intradayGap } from "../../indianDelivery.mjs";
import { plus, finite } from "../../na.mjs";
import { QUOTE, toUsd } from "../../fx.mjs";

const US_RATE = 0.0025;
const US_MIN = 0.01;

function dollars(amount, currency) {
  const value = toUsd(amount, currency);
  return value == null ? null : Number(value.toPrecision(12));
}

function sttSides(row) {
  const text = `${row?.name || ""} ${row?.ticker || ""}`;
  if (/GOLD|LIQUID|GILT/i.test(text) && /ETF|BEES|IETF/i.test(text)) return 0;
  return 2;
}

function usRoundTrip({ listing, leafBook, shared, query }) {
  const n = Number(query.shares);
  const p = Number(query.price);
  const basis =
    "actions américaines, page relue le 2026-09-25 : 0,25 % par ordre, minimum 0,01 $. Change forcé INR→USD et retour : marge de change non publiée (FAQ relue le 2026-10-19).";
  const remark = "A pay-in below $100 costs $1.";
  if (!(n > 0) || !(p > 0)) {
    return { ...shared, cashCurrency: "USD", basis, remark, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }
  const notional = n * p;
  const each = Math.max(US_MIN, notional * US_RATE);
  const commissionUsd = dollars(each * 2, listing.currency);
  // Forced INR->USD and back. No published markup: unknown.
  const fxUsd = null;
  const brokerFees = plus(commissionUsd, fxUsd);
  const notionalUsd = dollars(notional, listing.currency);
  const leaf = leafBook.leaf;
  const marketBp = query.bp ?? leaf?.bp ?? null;
  const marketPerShare = query.perShare ?? leaf?.perShare ?? null;
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;
  const usd = plus(bookUsd, brokerFees);
  return {
    ...shared,
    cashCurrency: "USD",
    url: "https://dhan.co/us-stocks/",
    remark,
    basis,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    why: [
      "change forcé vers USD : taux de change non publié",
      bookUsd == null ? `aucun carnet pour ${listing.exchange}` : null,
    ]
      .filter(Boolean)
      .join(" ; "),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate: US_RATE, min: US_MIN, currency: "USD", eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: null,
    },
  };
}

const SCHEDULE = {
  broker: "Dhan",
  folder: "dhan",
  catalogueUrl: new URL("dhan-parsed.json", import.meta.url),
  url: "https://dhan.co/pricing/",
  readOn: "2026-09-25",
  brokerageEach: () => 0,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.0030699") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: true,
  gstOnDp: true,
  ipftRate: pct("0.0000001"),
  dpInr: 12.5,
  roundRupee: true,
  sttSides,
  us: usRoundTrip,
  basis: "Courtage livraison 0. DP 12,50 ₹ + GST par ISIN à la vente. STT et stamp arrondis au roupie.",
  remark: intradayGap(0, pct("0.03")),
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
