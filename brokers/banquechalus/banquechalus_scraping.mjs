// What Banque Chalus (Clermont-Ferrand, Crédit Agricole group) sells on
// Euronext Paris through its online service Invest Store, with no login.
// Its only place here is the Paris regulated market (XPAR).
//
// The Invest Store page, read 2026-10-25, prints no list of titles:
// "Instruments financiers négociables : OPC (Sicav et FCP), actions et
// obligations françaises et étrangères, ETF (Exchange-Traded Fund). Mode de
// règlement : Règlement au comptant uniquement." Cash settlement only is an
// order kind (no SRD), not a line removal. The page names no excluded
// segment and does not exclude ETCs or ETNs, so the whole Paris ETP book is
// kept, as for the other single-place banks.
//   https://www.banque-chalus.fr/particulier/epargne/bourse/service-de-bourse-en-ligne-invest-store.html
//
// So the catalogue is the whole Paris book (../monabanq/euronextParisBook.mjs,
// read from Euronext's product-directory downloads): every share of the
// regulated market, French or foreign, every Paris ETF, ETC and ETN, minus
// lines on Euronext's halt list, warrants and subscription rights, and lines
// that never traded. Left out: Euronext Growth Paris and Euronext Access
// Paris (filed as their own places in broker-list.json), the XPMC
// multi-currency twins (not named by the bank), bonds, funds (OPC are
// subscribed through the bank), and the foreign markets the tariff prices
// separately ("Opération sur bourses étrangères 1,84 %, Minimum 50,10 €").
//
// Fees: "Conditions tarifaires particuliers" (22-10-2025), "Les ordres de
// bourse en France - Achat et vente d'actions ou d'obligations en Bourse de
// Paris, hors frais de marché": by internet, compte titres 0.63%, fixed fee
// 2.60 EUR per line, minimum 8.10 EUR (PEA / PEA-PME 0.50%); by phone 1.44%,
// 5.20 EUR, min 11.50 EUR. Invest Store Initial is listed at 2.90 EUR/month
// under the online-banking subscriptions; the product page calls it "le
// service gratuit Invest Store Initial".
//   https://www.banque-chalus.fr/content/dam/assetsca/cr764/npc/documents/tarifs/2026/conditions-tarifaires-particulier-22-10-2025.pdf
//
//   node brokers/banquechalus/banquechalus_scraping.mjs

import { writeParisCatalogue } from "../monabanq/euronextParisBook.mjs";

const rows = await writeParisCatalogue(import.meta.url, "banquechalus-parsed.json");
console.error(`Banque Chalus: ${rows.length} rows`);
