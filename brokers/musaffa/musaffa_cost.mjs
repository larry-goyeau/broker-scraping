// What one round trip costs on Musaffa's self-directed Halal Investing
// Platform (Musaffa LLC, an SEC-registered adviser; orders executed,
// cleared and custodied by Alpaca Securities LLC): buy n shares at price p,
// sell them straight back, in the app, in dollars. US-listed stocks and
// ETFs, whole or fractional. Managed portfolios stay out.
//
// Read 2026-10-26:
//   https://musaffa.com/trading-service-fee-schedule/   (Excluded Fee Schedule)
//   https://musaffa.com/halal-investing-pricing/
//   https://musaffa.com/halal-investing-platform/
//
//   commission          $0 each way: "Simple pricing with no trading
//                       commissions"; FAQ "does not charge commissions on
//                       buying and selling stocks and ETFs"
//   SEC, TAF, CAT       printed (SEC 0.0000206 of the sale, TAF $0.000195 a
//                       share, CAT $0.000003 a share), but "Musaffa absorbs
//                       these Regulatory Trading Fees and FINRA Consolidated
//                       Audit Trail (CAT) Fees assessed by Alpaca Securities
//                       LLC on eligible trades. These regulatory trading fees
//                       are not charged to Musaffa's client accounts": 0
//   FX Fee              "1% of Notional Amount" (Alpaca funding wallets). The
//                       account is in dollars and every line is in dollars,
//                       so it is the remark "FX 1% when cash ≠ USD."
//   platform fee        "$5 / month" under $24,000 of assets under
//                       advisement, then 0.25% a year ($24,000-$99,999),
//                       0.20%, 0.15%, 0.10% ("Includes ... investing platform
//                       access"): a subscription, remark, not in the trip
//   ADR fees ($0.01-$0.05 a share, depositary), ACATS out $25, wires $15/$35,
//                       Swift withdrawal $35: not on an order
//
// Formula: book (605 × Q of Alpaca Securities) + $0 + $0.
//
// Routing: the Excluded Fee Schedule names Alpaca Securities LLC as the
// broker-dealer that "provides custody, clearing, and settlement services"
// (rule606.mjs key `alpaca`, CRD 288202).
//
//   node brokers/musaffa/musaffa_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/musaffa/musaffa_cost.mjs US78462F1030 ARCX USD --shares=1.313 --price=761.69
//   node brokers/musaffa/musaffa_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Musaffa",
  folder: "musaffa",
  catalogueUrl: new URL("musaffa-parsed.json", import.meta.url),
  url: "https://musaffa.com/trading-service-fee-schedule/",
  pricing: "https://musaffa.com/halal-investing-pricing/",
  readOn: "2026-10-26",
  entity: "Musaffa LLC (adviser), Alpaca Securities LLC (execution, clearing, custody)",
  rule606: "alpaca",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => ({ buy: 0, sell: 0, note: "« no trading commissions »" }),
  // Printed by Alpaca, absorbed by Musaffa: none reaches the client.
  levies: { sec: false, taf: false, cat: false },
  fx: { rate: 0.01, label: "1" },
  remark: "$5/month platform fee under $24,000, then 0.25% a year.",
  basis:
    "Excluded Fee Schedule et page de prix Musaffa, relues le 2026-10-26 : 0 $ de commission, " +
    "SEC, TAF et CAT d'Alpaca pris en charge par Musaffa",
  notes: [
    "SEC, TAF et CAT imprimés mais « absorbed » par Musaffa : 0 pour le client",
    "abonnement 5 $/mois sous 24 000 $ d'actifs (puis 0,25 % à 0,10 % l'an) hors trajet",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
