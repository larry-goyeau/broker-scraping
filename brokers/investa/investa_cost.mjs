// What one round trip costs at Investa (Investa Markets Ltd, London, FCA FRN
// 1037289): buy n shares at price p, sell them back at once, in the app, in
// regular hours. US-listed stocks and ETFs; options stay out. Investa
// receives and transmits orders to Interactive Brokers (U.K.) Limited, which
// holds the money and the shares (terms 1.1, 1.5).
//
// Pages read 2026-10-26:
//   https://www.investa.co.uk/pricing   (redirects to the home page's pricing table, "Stocks" tab)
//   https://www.investa.co.uk/terms-of-service
//
//   Trading Commissions        "£0"
//   Securities Custody         "£0"
//   Deposits/ Withdrawals      "£0"
//   Currency Conversion        "0%": "0% currency conversion is subject to an
//                              annual limit of £250,000 trade value or 5000
//                              shares traded or 50 trades per year, whichever
//                              comes first". Terms 8.2: IBKR "charges 0.99% of
//                              the value of the Foreign Exchange conversion
//                              that takes place when converting your base
//                              currency"; 8.6: Investa rebates it "in respect
//                              of any transaction in shares"; 8.12: past a
//                              Fair Usage Limit the 0.99% applies
//   Third-party fees (stocks)  "TAF £0", "SEC £0", "CAT £0" (the options tab
//                              prints rates; the stocks tab prints zero)
//
// Formula: book (IB LLC 605 × Q) + 0 + FX 0% each way. The base currency is
// sterling, so the dollar line is converted both ways, at 0% inside the fair
// usage limits; the 0.99% past them is the remark.
//
// Routing: the US orders reach the tape through Interactive Brokers (IBKR
// U.K. routes US orders to Interactive Brokers LLC, CRD 36418), so a listed
// line takes IB LLC's per-symbol 605 × Q (rule606 key "interactivebrokers"),
// as raiffeisenrs and the IBKR files do.
//
//   node brokers/investa/investa_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/investa/investa_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Investa",
  folder: "investa",
  catalogueUrl: new URL("investa-parsed.json", import.meta.url),
  url: "https://www.investa.co.uk/pricing",
  terms: "https://www.investa.co.uk/terms-of-service",
  readOn: "2026-10-26",
  entity: "Investa Markets Ltd (FCA 1037289), orders transmitted to Interactive Brokers (U.K.) Limited",
  rule606: "interactivebrokers",
  cash: "GBP",
  deposits: ["GBP"],
  feeCurrency: "GBP",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  // 0% inside the annual fair usage limits (rebated by Investa on shares).
  fx: { rate: 0, label: "0" },
  remark: "FX 0.99% each way after £250,000, 5,000 shares or 50 trades a year.",
  basis:
    "grille Investa (onglet Stocks) relue le 2026-10-26 : « Trading Commissions £0 », « Currency Conversion 0% » " +
    "dans la limite annuelle de 250 000 £, 5 000 actions ou 50 ordres, frais tiers actions « TAF £0 », « SEC £0 », « CAT £0 »",
  notes: [
    "devise de base sterling : change à 0 % (0,99 % d'IBKR remboursé par Investa sur les actions, clauses 8.2 et 8.6), 0,99 % au-delà des limites d'usage (8.12)",
    "ordres transmis à IBKR (U.K.), exécution US par Interactive Brokers LLC : 605 × Q d'IB LLC",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
