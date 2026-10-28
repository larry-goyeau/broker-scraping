// What BOA Capital Securities (the Abidjan SGI of the Bank of Africa group)
// sells in shares, with no login. Its only place is the BRVM, the regional
// exchange of the eight UEMOA states; its brokerage page speaks of "20 ans
// de présence sur le marché de la Bourse Régionale des Valeurs Mobilières"
// and of "négociation de titres (Actions, Obligations)", and names no
// board, compartment or share it leaves out. Its online order book
// (boaksdirect.com) is behind a login. So the catalogue is every share
// listed on the BRVM (brokers/societegeneralew/brvmBook.mjs): the
// exchange's own price page, less the lines flagged "SP" (suspended) on
// the latest official bulletin. The BRVM lists no ETF; bonds and
// subscription rights are other products and are not written. Every line
// is quoted in francs CFA (XOF).
//
// Fees: the order simulator shows "Comm. BOA CAPITAL SECURITIES (1%)",
// plus the BRVM (0.2%) and DC/BR (0.1%) fees and 10% TAF on the commission.
//
//   https://boacapitalsecurities.com/fr/notre-expertise/intermediation-financiere
//   https://boacapitalsecurities.com/fr/simulateur
//   https://www.brvm.org/fr/cours-actions/0
//
//   node brokers/boa/boa_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { brvmBook } from "../societegeneralew/brvmBook.mjs";
import fs from "node:fs";

const { rows, suspended, resumed, noIsin, notOnBulletin, sessionDate, bulletinDate } = await brvmBook();

fs.writeFileSync(new URL("boa-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error({
  "BRVM STOCK": rows.length,
  sessionDate,
  bulletinDate,
  suspended: suspended.map((line) => line.ticker),
  resumed,
  noIsin,
  notOnBulletin,
});
