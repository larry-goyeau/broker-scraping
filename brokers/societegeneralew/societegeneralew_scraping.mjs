// What Société Générale Capital Securities West Africa (SGCS, the SGI of
// Société Générale in Abidjan) sells in shares to the clients of Société
// Générale Côte d'Ivoire, with no login. Its only place is the BRVM, the
// regional exchange of the eight UEMOA states. The online broker's user
// guide says its market screen shows "l'ensemble des valeurs disponibles
// sur le marché", and names no board, compartment or share it leaves out;
// its examples are ORAC (Orange CI) and ETIT (Ecobank Transnational).
// So the catalogue is every share listed on the BRVM (brvmBook.mjs, next
// to this file): the exchange's own price page, less the lines flagged
// "SP" (suspended) on the latest official bulletin. The BRVM lists no ETF;
// bonds and subscription rights are other products and are not written.
// Every line is quoted in francs CFA (XOF).
//
// Fees: the bank's general conditions list the SGI's tariff, "Achat/Vente
// 0,8 % max. avec min. 1 000 Fcfa" (9.7.2.1), and online trading "Achat/
// vente de titres boursiers (via CONNECT) 0,8% du montant" (4.2.5).
//
//   https://particuliers.societegenerale.ci/fileadmin/user_upload/SG_Cote_ivoire/PDF/GUIDE_UTILISATEUR_E-BOURSE.pdf
//   https://particuliers.societegenerale.ci/fileadmin/user_upload/SG_Cote_ivoire/migrated/CB_particuliers.pdf
//   https://www.brvm.org/fr/cours-actions/0
//
//   node brokers/societegeneralew/societegeneralew_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { brvmBook } from "./brvmBook.mjs";
import fs from "node:fs";

const { rows, suspended, resumed, noIsin, notOnBulletin, sessionDate, bulletinDate } = await brvmBook();

fs.writeFileSync(new URL("societegeneralew-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error({
  "BRVM STOCK": rows.length,
  sessionDate,
  bulletinDate,
  suspended: suspended.map((line) => line.ticker),
  resumed,
  noIsin,
  notOnBulletin,
});
