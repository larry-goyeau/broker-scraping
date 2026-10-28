// What one round trip costs at Luna Securities (LUNA app): buy n shares at
// price p, sell them back at once, in dollars. Online (app) only.
//
// The support page FAQ "What are LUNA's Commission Rates?" (its text is in
// the page script /_next/static/chunks/app/support/page-*.js), read on
// 2026-10-26, "Gross Transaction Value (Php)" / "Commission Rate":
//   Up to 2,500              Php 5.00
//   > 2,500 up to 100k       0.20%
//   > 100,000 up to 250k     0.18%
//   > 250,000 up to 500k     0.16%
//   > 500k up to 1m          0.14%
//   > 1m                     0.12%
// The whole order takes the rate of its band. The page prints nothing else.
// The market-wide charges every PSE trade pays are added as in bdosec and
// mytrade (see ../firstmetro/pseCost.mjs): 12% VAT on the commission (law),
// PSE fee 0.005% and SCCP 0.01% each side, stock transaction tax 0.1% on
// the sell (RA 12214). Left out: the PDTC transfer fee (P75 per stock),
// not this order.
//
// Formula, each side: band commission + 12% VAT + PSE 0.005% + SCCP 0.01%;
// the sell adds 0.1%. Exact.
//
// Funding (LunaFundNow, bank bills payment) is "Php (Amount)" only: the three
// PSE dollar lines would need a conversion the broker does not price, and the
// bands are in pesos: N/A.
//
//   https://www.lunasecurities.com/support/
//
//   node brokers/lunasec/lunasec_cost.mjs SM PSE PHP --shares=120 --price=497
//
// `roundTrip(...)` reads files, not the network.

import { pseRoundTrip, printCli } from "../firstmetro/pseCost.mjs";

const SCHEDULE = {
  broker: "Luna Securities",
  folder: "lunasec",
  catalogueUrl: new URL("lunasec-parsed.json", import.meta.url),
  url: "https://www.lunasecurities.com/support/",
  readOn: "2026-10-26",
  commission: {
    tiers: [
      { upTo: 2_500, flat: 5 },
      { upTo: 100_000, rate: 0.002 },
      { upTo: 250_000, rate: 0.0018 },
      { upTo: 500_000, rate: 0.0016 },
      { upTo: 1_000_000, rate: 0.0014 },
      { upTo: Infinity, rate: 0.0012 },
    ],
  },
  basis:
    "Luna en ligne, barème relu le 2026-10-26. Commission par tranche de montant brut : jusqu'à 2 500 PHP 5 PHP, puis 0,20 % jusqu'à 100 000 PHP, 0,18 % jusqu'à 250 000, 0,16 % jusqu'à 500 000, 0,14 % jusqu'à 1 million, 0,12 % au-delà (tout l'ordre au taux de sa tranche). S'y ajoutent les frais de marché de toute opération à la PSE : TVA 12 % de la commission, PSE 0,005 %, SCCP 0,01 %, chaque côté ; taxe sur les transactions 0,1 % à la vente.",
  confidence:
    "La page Luna n'imprime que la commission : la TVA, les frais PSE et SCCP et la taxe de 0,1 % sont les chiffres de marché, ajoutés comme pour bdosec et mytrade.",
};

export function roundTrip(query) {
  return pseRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
