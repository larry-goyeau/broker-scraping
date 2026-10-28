// What NSIA Capital (the Abidjan SGI of the NSIA group) sells in shares,
// with no login. Its only place is the BRVM, the regional exchange of the
// eight UEMOA states; its online platform page offers the "détail des
// offres et des demandes de titres à la BRVM" and names no board,
// compartment or share it leaves out. So the catalogue is every share
// listed on the BRVM (brokers/societegeneralew/brvmBook.mjs): the
// exchange's own price page, less the lines flagged "SP" (suspended) on
// the latest official bulletin. The BRVM lists no ETF; bonds and
// subscription rights are other products and are not written. Every line
// is quoted in francs CFA (XOF).
//
// Fees: the 2026 tariff (from 1 July 2026) gives "Commission de courtage
// sur transaction ordinaire ... Taux appliqué: 1%" and online trading at
// 1 000 FCFA a month for individuals.
//
//   https://nsiacapital.com/nsia-capital-online/
//   https://nsiacapital.com/wp-content/uploads/2026/07/Grille-Tarifaire-NSIA-Capital-2026-Version-clientele-01072026-V2.pdf
//   https://www.brvm.org/fr/cours-actions/0
//
//   node brokers/nsia/nsia_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { brvmBook } from "../societegeneralew/brvmBook.mjs";
import fs from "node:fs";

const { rows, suspended, resumed, noIsin, notOnBulletin, sessionDate, bulletinDate } = await brvmBook();

fs.writeFileSync(new URL("nsia-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error({
  "BRVM STOCK": rows.length,
  sessionDate,
  bulletinDate,
  suspended: suspended.map((line) => line.ticker),
  resumed,
  noIsin,
  notOnBulletin,
});
