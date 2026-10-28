// What Attijari Securities West Africa (ASWA, the Abidjan SGI of the
// Attijariwafa bank group, at Société Ivoirienne de Banque) sells in
// shares, with no login. Its only place is the BRVM, the regional exchange
// of the eight UEMOA states: its Bourse Connect platform gives "un accès
// direct et simple au marché boursier régional", and its brokerage page
// takes orders on any listed title ("action ou obligation"). It names no
// board, compartment or share it leaves out. So the catalogue is every
// share listed on the BRVM (brokers/societegeneralew/brvmBook.mjs): the
// exchange's own price page, less the lines flagged "SP" (suspended) on
// the latest official bulletin. The BRVM lists no ETF; bonds and
// subscription rights are other products and are not written. Every line
// is quoted in francs CFA (XOF).
//
// Fees: the 2025 tariff gives "Commission de courtage sur transactions
// ordinaires ... Négociable avec un maximum de 1% HT" of the gross amount.
//
//   https://sib.ci/aswa/bourse-en-ligne/
//   https://sib.ci/aswa/courtage-en-bourse/
//   https://sib.ci/wp-content/uploads/2025/11/Grille-Tarifaire-ASWA-2025.pdf
//   https://www.brvm.org/fr/cours-actions/0
//
//   node brokers/attijariwestafri/attijariwestafri_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { brvmBook } from "../societegeneralew/brvmBook.mjs";
import fs from "node:fs";

const { rows, suspended, resumed, noIsin, notOnBulletin, sessionDate, bulletinDate } = await brvmBook();

fs.writeFileSync(new URL("attijariwestafri-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error({
  "BRVM STOCK": rows.length,
  sessionDate,
  bulletinDate,
  suspended: suspended.map((line) => line.ticker),
  resumed,
  noIsin,
  notOnBulletin,
});
