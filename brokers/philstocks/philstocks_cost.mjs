// What one round trip costs at Philstocks (PhilstocksFinancial): buy n
// shares at price p, sell them back at once, in dollars. Online only.
//
// The FAQ (https://www.philstocks.ph/faq), read on 2026-10-26: "the
// industry's lowest commission rates of .25% or a minimum of Php20 whichever
// is higher". Its fee table is an image (/media/1343/survey-pubmmat-2-51.jpg,
// "FEES AND CHARGES"), buying and selling:
//   Broker's Commission Rate                         0.25%
//   Vat on Commission                                12%
//   Securities Clearing Corporation of the Philippines 0.01%
//   PSE FEE                                          0.005%
//   Sales Tax (selling only)                         0.10%
// The sample image (/media/1344/survey-pubmmat-2-52.jpg) prices 1,000 ABZY
// at 12.52: buy charges 36.94, sell charges 49.46, which only comes out with
// each line rounded to the centavo (31.30 + 3.76 + 0.63 + 1.25; + 12.52).
// So: rounding "line", floor PHP 20.
//
// Formula, each side: max(0.25%, PHP 20) + 12% VAT + PSE 0.005% + SCCP
// 0.01%, each to the centavo; the sell adds 0.1%. Left out: the certificate
// sale (1.5%), upliftment and lodgement fees, none of them this order.
//
// Funding is in pesos only (InitialFunding / AdditionalFunding guides: bank
// bills payment and transfer). The three PSE dollar lines would need a
// conversion the broker does not price, and the floor is in pesos: N/A.
//
//   https://www.philstocks.ph/faq
//   https://www.philstocks.ph/media/1343/survey-pubmmat-2-51.jpg
//   https://www.philstocks.ph/media/1344/survey-pubmmat-2-52.jpg
//
//   node brokers/philstocks/philstocks_cost.mjs SM PSE PHP --shares=120 --price=497
//
// `roundTrip(...)` reads files, not the network.

import { pseRoundTrip, printCli } from "../firstmetro/pseCost.mjs";

const SCHEDULE = {
  broker: "Philstocks",
  folder: "philstocks",
  catalogueUrl: new URL("philstocks-parsed.json", import.meta.url),
  url: "https://www.philstocks.ph/faq",
  readOn: "2026-10-26",
  commission: { rate: 0.0025, min: 20 },
  rounding: "line",
  basis:
    "Philstocks en ligne, FAQ et tableau des frais relus le 2026-10-26. Commission 0,25 % ou 20 PHP au minimum, plus TVA 12 % de la commission, SCCP 0,01 %, PSE 0,005 %, chaque côté, chaque ligne arrondie au centavo comme dans l'exemple ABZY de la page ; taxe de vente 0,1 % à la vente.",
};

export function roundTrip(query) {
  return pseRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
