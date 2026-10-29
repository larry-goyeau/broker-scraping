// What Arkéa Banque Privée sells online on Euronext Paris and Euronext
// Growth Paris, with no login.
//
// The bank publishes no list of what it sells. Its 2026 tariff prices the
// stock-exchange order "par Internet" next to the branch order ("ACHAT ET
// VENTE EN BOURSE UE ET EEE", "Ordre de Bourse passé : ● en agence ● par
// Internet 1,20 % 0,50 %"); its examples are orders "Bourse France".
//   https://www.arkeabanqueprivee.fr/arkea-banque/patrimoine/tarification-des-services
//   https://www.arkeabanqueprivee.fr/arkea-banque/upload/docs/application/pdf/2026-04/conditions_tarifaires_2026.pdf
//
// Places. broker-list.json gives "Euronext" and "Euronext Growth". The
// tariff names no market beyond "Bourse France" (and "Bourse étrangère ...
// HORS UE ET EEE", 1,50 %, minimum 50 €, with a branch order fee), so the
// places read are the French ones: Euronext Paris and Euronext Growth
// Paris. The other Euronext markets (Amsterdam, Brussels, Lisbon, Milan,
// Dublin, Oslo) are named on no page of the bank and are not read.
//
// So the catalogue is the Euronext Paris book of ../monabanq/
// euronextParisBook.mjs with Euronext Growth Paris (`growth: true`): every
// share, ETF, ETC and ETN line of Euronext's product directory on the
// regulated market (XPAR) and on Growth (ALXP), minus halted and
// never-traded lines, warrants and subscription rights.
//
// Fees: "Conditions Tarifaires 2026", "ACHAT ET VENTE EN BOURSE UE ET EEE",
// "Ordre de Bourse passé : ● en agence ● par Internet 1,20 % 0,50 %".
//
//   node brokers/arkeabanqueprive/arkeabanqueprive_scraping.mjs

import { writeParisCatalogue } from "../monabanq/euronextParisBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";

await pageSays("https://www.arkeabanqueprivee.fr/arkea-banque/patrimoine/tarification-des-services", [/Conditions Tarifaires 2026/]);

const rows = await writeParisCatalogue(import.meta.url, "arkeabanqueprive-parsed.json", { growth: true });
if (rows.filter((r) => r.mic === "XPAR").length < 900 || rows.filter((r) => r.mic === "ALXP").length < 100) throw new Error("Paris book too small");
console.error(`Arkéa Banque Privée: ${rows.length} rows`);
