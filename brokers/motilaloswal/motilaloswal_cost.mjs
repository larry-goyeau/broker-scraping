// What one round trip costs at Motilal Oswal: buy n shares, sell them
// back, equity delivery, in dollars. Futures, options and commodities
// stay out.
//
// Re-read 2026-10-11.
//   https://www.motilaloswal.com/exchange-traded-funds
//   https://www.motilaloswal.com/learning-centre/2023/6/what-are-the-charges-levied-on-stock-trading-at-motilal-oswal
//
//   Delivery brokerage     0.20% of the consideration, each side. The
//                          figure stays on this rate. The sale is
//                          another day.
//   Same day               0.02%. The remark credits the 0.18 point
//                          gap on that sale.
//   GST                    18% on the brokerage. The charges article
//                          prints it on the brokerage.
//   STT                    0.1% on the buy and on the sell. The article
//                          prints a range of 0.025% to 0.1%. Delivery
//                          is the top of that range.
//   Stamp                  0.015% on the buy. The article prints a
//                          range of 0.002% to 0.015%. Delivery is the
//                          top of that range.
//   Transaction            NSE 0.00335%, the delivery figure the
//                          article prints. BSE is not given a usable
//                          delivery figure there, so this ticket uses
//                          the cash rate 0.00375%.
//   SEBI                   ₹10 per crore. The article names the charge
//                          and does not print the rupee.
//
// A value-pack sheet with a 0.50% default is a prepaid scheme, not
// this ticket. A DP debit is named and not priced, so it is not added.
//
// US wallet, https://www.motilaloswal.com/us-stocks read on 2026-10-11.
//   Brokerage                 0.50% or $1 a transaction, whichever is
//                             higher. The round trip is two transactions.
//   FX                        Rupees are converted on the way in. The
//                             article prints the bank forex markup as
//                             1% to 2%. That range is the remark. It
//                             stays out of the figure.
//   https://www.motilaloswal.com/learning-centre/2026/1/how-much-money-do-you-need-to-start-investing-in-us-stocks
//
//   node brokers/motilaloswal/motilaloswal_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//   node brokers/motilaloswal/motilaloswal_cost.mjs AAPL NASDAQ USD --shares=10 --price=200
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, printCli, pct, sebiRate } from "../../indianDelivery.mjs";
import { fxRemark, toUsd } from "../../fx.mjs";
import { qOf } from "../../spreads/rule606.mjs";
import { plus, finite } from "../../na.mjs";

const US_RATE = 0.005;
const US_MIN = 1;

const SCHEDULE = {
  broker: "Motilal Oswal",
  folder: "motilaloswal",
  catalogueUrl: new URL("motilaloswal-parsed.json", import.meta.url),
  url: "https://www.motilaloswal.com/exchange-traded-funds",
  readOn: "2026-10-11",
  brokerageEach: (notional) => notional * pct("0.20"),
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00335") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnTxn: false,
  gstOnSebi: false,
  basis: "Courtage livraison 0,20 % par exécution, plus GST 18 % sur ce courtage.",
  remark: "If the sale is the same day, brokerage fees is -0.18%.",
  us: usBook,
};

function usBook({ listing, leafBook, shared, query }) {
  const n = Number(query.shares);
  const p = Number(query.price);
  const remark = fxRemark("1–2", "USD");
  const perShare = query.perShare ?? leafBook.leaf?.perShare ?? null;
  const q = qOf("motilaloswal");
  // DriveWealth's 2026 Q2 stock sections are empty. The options mix is
  // not this book. With no equity Q, the figure is the quoted NBBO.
  const bookNote = q != null
    ? `carnet 605 × Q DriveWealth ${Number(q.toFixed(3))}`
    : "carnet NBBO reconstitué : le 606 DriveWealth n'a pas de mix actions";
  const basis = `0,50 % ou 1 $ par ordre, le plus élevé des deux. ${bookNote}.`;
  const head = { ...shared, cashCurrency: "USD", url: "https://www.motilaloswal.com/us-stocks", remark, basis };
  if (!(n > 0) || !(p > 0)) {
    return { ...head, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }
  const notional = n * p;
  const each = Math.max(US_MIN, notional * US_RATE);
  const brokerFees = each * 2;
  const bookUsd = perShare == null ? null : perShare * n;
  return {
    ...head,
    usd: finite(plus(bookUsd, brokerFees), 6),
    brokerFees: finite(brokerFees, 6),
    bp: null,
    perShare,
    trade: { shares: n, price: p, notional, notionalUsd: toUsd(notional, "USD"), currency: "USD" },
    commission: { each, rate: US_RATE, min: US_MIN, currency: "USD" },
    ...(bookUsd == null ? { why: `aucun carnet pour ${listing.exchange}` } : {}),
  };
}

export function roundTrip(query) {
  const out = indiaRoundTrip(SCHEDULE, query);
  const listing = out.listing;
  if (listing && listing.currency === "USD") return { ...out, remark: fxRemark("1–2", "USD") };
  if (listing && (listing.currency !== "INR" || !["NSE", "BSE"].includes(listing.brokerExchange))) {
    return { ...out, remark: "" };
  }
  return out;
}

printCli(import.meta.url, roundTrip);
