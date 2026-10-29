// What Allianz Banque sells online on Euronext Paris, with no login.
//
// Allianz Banque's general conditions: the client's online services include
// "passation d'ordres en Bourse et souscriptions/rachats d'OPCVM ou FIA
// lorsque le Client a souscrit un Compte" (9.3.1 "Services Internet et
// Serveur Vocal Interactif").
//   https://www.allianzbanque.fr/a/z/upload/docs/application/pdf/2012-08/conditions_generales.pdf
// The bank publishes no list of what it sells.
//
// Place: Euronext Paris, as broker-list.json gives it, and the only market
// the tariff allows online: "Frais de négociation bourse (courtage)",
// "Opération réalisées sur internet (uniquement Euronext Paris) Réduction
// de 50 %".
//
// So the catalogue is the Euronext Paris book of ../monabanq/
// euronextParisBook.mjs: every share, ETF, ETC and ETN line of Euronext's
// product directory on the Paris regulated market (XPAR), minus halted and
// never-traded lines, warrants and subscription rights. Growth, Access and
// the multi-currency lines are other places and are not read.
//
// Fees: Allianz Banque "Conditions et tarifs" (in force from 1 April 2025;
// the bank's site sits behind a bot wall, the PDF is the copy MoneyVox
// keeps): "Frais de négociation bourse (courtage) - ordre jusqu'à 10 000 €
// 0,40 % du montant de l'opération", "- ordre supérieur à 10 000 € 0,30 %",
// "Minimum par ordre 9,00 €", "Opération réalisées sur internet
// (uniquement Euronext Paris) Réduction de 50 %".
//   https://www.moneyvox.fr/tarif-bancaire/allianz-banque/pdf/tarifs-juin-2025.pdf
//
//   node brokers/allianzbanque/allianzbanque_scraping.mjs

import { writeParisCatalogue } from "../monabanq/euronextParisBook.mjs";

// Allianz Banque's pages answer a bot challenge (Cloudflare) to scripts, so
// no sentence is re-read here; the tariff copy must still answer.
const tariff = await fetch("https://www.moneyvox.fr/tarif-bancaire/allianz-banque/pdf/tarifs-juin-2025.pdf", { headers: { "User-Agent": "Mozilla/5.0" } });
if (!tariff.ok) throw new Error(`Allianz Banque tariff answered ${tariff.status}`);

const rows = await writeParisCatalogue(import.meta.url, "allianzbanque-parsed.json");
if (rows.length < 900) throw new Error("Paris book too small");
console.error(`Allianz Banque: ${rows.length} rows`);
