// What one round trip costs at Investors Securities (InvestaTrade): buy n
// shares at price p, sell them back at once, in dollars. Online only.
//
// The home-page FAQ "What transactional fees do I need to pay?", read on
// 2026-10-26, buying and selling:
//   Commission fee: 0.25% based on Gross Value Traded
//   Value Added Tax: 12% based on Commission
//   Securities Clearing Corp. of the Phils.: .01% based on Gross Value Traded
//   PSE Fees: .005% based on Gross Value Traded
//   Stock Transaction Tax: .6% based on Gross Value Traded (selling)
// The page still prints the old 0.6% tax; it is 0.1% since 1 July 2025
// (RA 12214, CMEPA), read at 0.1% as gstocks and col do. "0.25% commission,
// no minimum deposit, and no maintaining balance"; "there are no withdrawal
// fees". The PSETradex / traditional account is another product and stays
// out.
//
// Formula, each side: 0.25% + 12% VAT + SCCP 0.01% + PSE 0.005%; the sell
// adds 0.1%. Exact.
//
// Cash in is InstaPay or bank Pay Bills in pesos: the three PSE dollar lines
// would need a conversion the broker does not price: N/A.
//
//   https://www.investorsonline.ph/
//
//   node brokers/investors/investors_cost.mjs SM PSE PHP --shares=120 --price=497
//
// `roundTrip(...)` reads files, not the network.

import { pseRoundTrip, printCli } from "../firstmetro/pseCost.mjs";

const SCHEDULE = {
  broker: "Investors Securities",
  folder: "investors",
  catalogueUrl: new URL("investors-parsed.json", import.meta.url),
  url: "https://www.investorsonline.ph/",
  readOn: "2026-10-26",
  commission: { rate: 0.0025 },
  basis:
    "InvestaTrade (Investors Securities) en ligne, FAQ relue le 2026-10-26. Commission 0,25 % plus TVA 12 % de la commission, SCCP 0,01 %, PSE 0,005 %, chaque côté ; taxe sur les transactions 0,1 % à la vente (la page imprime encore 0,6 %, ramenée à 0,1 % depuis le 1er juillet 2025 par la loi RA 12214).",
};

export function roundTrip(query) {
  return pseRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
