// What one round trip costs at Maya Stocks (the stock tab of the Maya wallet
// app; orders go through the partner broker Philstocks Financial): buy n
// shares at price p on the Philippine Stock Exchange, sell them back at once,
// in dollars. Online only.
//
// The page's FAQ "Are there are any fees when using Maya Stocks?", read on
// 2026-10-26:
//   commission          "0.25% or P20, whichever is higher", each side
//   VAT                 "VAT on Commission 12%"
//   PSE fee             "Philippine Stock Exchange (PSE) Fee 0.01%", each side
//                       (the formula line says "Gross Amount x 0.0005%", but
//                       its own ₱10 on ₱100,000 is 0.01%)
//   PCD fee             "Philippine Central Depository (PCD) Fee 0.01%",
//                       each side
//   sales tax           "Sales Tax 0.6%", on the sell: read at 0.1%, the rate
//                       since 1 July 2025 (RA 12214 / CMEPA), as gstocks,
//                       investors and the other PSE files do
//   platform fees       Philstocks "1% of deposit amount" and "₱25 per
//                       withdrawal": on the funding, not on the order, so in
//                       the remark
// The table says the rates "may vary depending on the broker provider". The
// page's own PSE figure (0.01%) is used, as 2tradeasia does with its own
// table; Philstocks' own table prints 0.005%. Each charge is rounded to the
// centavo, as the partner Philstocks' worked example is.
// The marketing line "zero transaction fees" contradicts the table and is
// ignored. A share and the PSE's ETF take this one table.
//
// The account is funded in pesos from the Maya wallet only, so the three PSE
// lines in dollars (DTEL, TCB2A, TCB2B) would need a conversion no page
// prices, and the 20 peso floor has no dollar figure: N/A.
//
//   https://www.maya.ph/stocks
//
//   node brokers/mayastocks/mayastocks_cost.mjs SM PSE PHP --shares=120 --price=497
//   node brokers/mayastocks/mayastocks_cost.mjs DTEL PSE USD --shares=5000 --price=0.2
//
// `roundTrip(...)` reads files, not the network.

import { pseRoundTrip, printCli, SCCP_FEE } from "../firstmetro/pseCost.mjs";

const SCHEDULE = {
  broker: "Maya Stocks",
  folder: "mayastocks",
  catalogueUrl: new URL("mayastocks-parsed.json", import.meta.url),
  url: "https://www.maya.ph/stocks",
  readOn: "2026-10-26",
  commission: { rate: 0.0025, min: 20 },
  levies: [
    { name: "PSE", rate: 0.0001 },
    { name: "PCD", rate: SCCP_FEE },
  ],
  rounding: "line",
  cash: ["PHP"],
  remark: "1% deposit fee, ₱25 per withdrawal.",
  basis:
    "Maya Stocks (courtier partenaire Philstocks) en ligne, barème relu le 2026-10-26. Commission 0,25 % ou 20 PHP au minimum plus TVA 12 % de la commission, frais PSE 0,01 % (chiffre de la page) et PCD 0,01 %, chaque côté, chaque ligne arrondie au centavo ; taxe de vente 0,1 % à la vente (la page affiche encore 0,6 %, taux abaissé à 0,1 % depuis le 1er juillet 2025, RA 12214).",
  confidence:
    "La page indique que les taux « may vary depending on the broker provider » ; le tableau propre de Philstocks affiche 0,005 % pour la PSE au lieu de 0,01 %.",
};

export function roundTrip(query) {
  return pseRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
