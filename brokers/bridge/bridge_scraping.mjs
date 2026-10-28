// What Bridge Securities (an Abidjan SGI) sells in shares, with no login.
// Its FAQ says its only place is the BRVM, the regional exchange of the
// eight UEMOA states: "Un compte titres chez BRIDGE SECURITIES vous permet
// d'effectuer des transactions sur la Bourse Régionale des Valeurs
// Mobilières (BRVM) tels que les achats ou ventes d'actions & d'obligations."
// It names no board, compartment or share it leaves out. So the catalogue
// is every share listed on the BRVM (brokers/societegeneralew/brvmBook.mjs):
// the exchange's own price page, less the lines flagged "SP" (suspended)
// on the latest official bulletin. The BRVM lists no ETF; bonds and
// subscription rights are other products and are not written. Every line
// is quoted in francs CFA (XOF).
//
// Fees: the account tariff (Annexe II) gives "Commissions de courtage sur
// transactions ordinaires ... [0,80%-1%]" of the amount traded.
//
//   https://www.bridge-securities.com/centre-dinformation/faq
//   https://www.bridge-securities.com/images/documents/tarification-compte-titre.pdf
//   https://www.brvm.org/fr/cours-actions/0
//
//   node brokers/bridge/bridge_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { brvmBook } from "../societegeneralew/brvmBook.mjs";
import fs from "node:fs";

const { rows, suspended, resumed, noIsin, notOnBulletin, sessionDate, bulletinDate } = await brvmBook();

fs.writeFileSync(new URL("bridge-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error({
  "BRVM STOCK": rows.length,
  sessionDate,
  bulletinDate,
  suspended: suspended.map((line) => line.ticker),
  resumed,
  noIsin,
  notOnBulletin,
});
