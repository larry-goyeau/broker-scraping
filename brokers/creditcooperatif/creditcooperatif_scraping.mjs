// What Crédit Coopératif sells online through its "service Titres et
// Bourse" on Euronext Paris, with no login.
//
// The PEA page: "Investissez sur différents types de produits financiers :
// actions françaises et européennes, parts d'OPC"; "vous pouvez créer des
// alertes depuis votre banque en ligne, espace Bourse"; "(8) Pour accéder à
// l'espace Bourse, le client doit avoir demandé, au préalable, l'activation
// de l'accès auprès de son conseiller Crédit Coopératif." The bank
// publishes no list of what it sells.
//   https://www.credit-cooperatif.coop/epargner/plan-epargne-en-actions/
//
// Place: Euronext Paris. broker-list.json gives Euronext Paris and
// Equiduct. No Crédit Coopératif page names Equiduct: it is an execution
// venue (a lit MTF quoting the same Paris lines), not a listing, so it adds
// no title and is not written as a place here. The 2027 tariff brochure
// prices "Achat et vente d'actions européennes bourse domestique
// (Euronext(9))", "(9) Euronext : bourses de Paris, Amsterdam et
// Bruxelles"; Amsterdam and Brussels are not this broker's places in
// broker-list.json and are not read. "Opérations sur Bourses étrangères"
// are priced "Variable selon les places de cotation (nous consulter)": not
// online, left out.
//
// So the catalogue is the Euronext Paris book of ../monabanq/
// euronextParisBook.mjs: every share, ETF, ETC and ETN line of Euronext's
// product directory on the Paris regulated market (XPAR), minus halted and
// never-traded lines, warrants and subscription rights. Growth, Access and
// the multi-currency lines are other places.
//
// Fees: "Guide tarifaire pédagogique 2026", "Achat et vente d'actions
// européennes • par Internet via service Titres et Bourse 0,50 %" (by
// telephone 1,20 %); 2027 brochure: "< = 398 € Commission proportionnelle :
// 0,50 %", "> 3 000 € Commission proportionnelle : 0,35 %".
//   https://www.img.credit-cooperatif.coop/app/uploads/sites/19/2025/12/30173731/guide-tarifaire-pedagogique-pp-2026.pdf
//   https://www.img.credit-cooperatif.coop/app/uploads/sites/19/2026/10/14110804/brochure-tarifaire-2027-particuliers.pdf
//
//   node brokers/creditcooperatif/creditcooperatif_scraping.mjs

import { writeParisCatalogue } from "../monabanq/euronextParisBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://www.credit-cooperatif.coop/epargner/plan-epargne-en-actions/", [/espace Bourse/, /actions fran.aises et europ.ennes/]);

const rows = await writeParisCatalogue(import.meta.url, "creditcooperatif-parsed.json");
if (rows.length < 900) throw new Error("Paris book too small");
console.error(`Crédit Coopératif: ${rows.length} rows`);
