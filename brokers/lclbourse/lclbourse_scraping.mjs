// What LCL sells online through its "Service Bourse" (LCL Bourse, web and
// app) on Euronext Paris and Euronext Growth Paris, with no login.
//
// "Découvrez dès à présent votre nouvel Espace Bourse : réalisez vos
// opérations boursières ... passer vos ordres"; "Passez vos ordres de
// bourse". LCL publishes no list of what it sells.
//   https://www.lcl.fr/bourse
//
// Places: Euronext Paris and Euronext Growth Paris, as broker-list.json
// gives them. The tariff prices "Bourse France" and "Bourse Étranger"
// orders "par Internet ou téléphone"; "Bourse France" names no market, and
// no LCL page leaves Growth, a segment or a product type out. Foreign
// exchanges ("Bourse Étranger") are not this broker's places in
// broker-list.json.
//
// So the catalogue is the Euronext Paris book of ../monabanq/
// euronextParisBook.mjs with Euronext Growth Paris (`growth: true`): every
// share, ETF, ETC and ETN line of Euronext's product directory on the
// regulated market (XPAR) and on Growth (ALXP), minus halted, never-traded
// lines, warrants and subscription rights. Euronext Access and the
// multi-currency (XPMC) lines are other places and are not read.
//
// Fees: "Guide tarifaire", janvier 2026, "Commissions de courtage compte
// titres", INTERNET, Bourse France, LCL Bourse: "Commission proportionnelle
// 0,50 % (minimum 5 €)"; LCL Bourse Expert: "ordres jusqu'à 1 715 € : 0,50
// %", "ordres supérieurs à 7 700 € : 4 € + 0,12 %".
//   https://portail-lcl-web.cdn.prismic.io/portail-lcl-web/TiQQ7RKx1juBXH1U_GUIDE-TARIFAIRE-janvier-2026.pdf
//
//   node brokers/lclbourse/lclbourse_scraping.mjs

import { writeParisCatalogue } from "../monabanq/euronextParisBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://www.lcl.fr/bourse", [/Passez vos ordres de bourse/, /passer vos ordres/]);

const rows = await writeParisCatalogue(import.meta.url, "lclbourse-parsed.json", { growth: true });
if (rows.filter((r) => r.mic === "XPAR").length < 900 || rows.filter((r) => r.mic === "ALXP").length < 100) throw new Error("Paris book too small");
console.error(`LCL Bourse: ${rows.length} rows`);
