// What Monabanq (Monabanq S.A., Villeneuve d'Ascq, Crédit Mutuel Alliance
// Fédérale) sells on Euronext Paris, with no login. Its only place here is
// the Paris regulated market (XPAR).
//
// Its securities-account page, read 2026-10-25, prints no list of titles:
// "Investissez librement sur des actions et / ou Exchange Traded Funds",
// and the account buys "une large gamme de valeurs mobilières (actions,
// obligations, OPCVM, ETF…)".
//   https://www.monabanq.com/fr/produits-bancaires/cto/en-resume.html
// Its account terms name what it does not take: "la Banque n'accepte pas
// d'ordre avec Service de Règlement et de livraison Différés (ou SRD), ni
// d'opérations sur le MONEP ... ni le MATIF". That is an order kind and
// derivatives markets, not a cash line, so nothing is removed for it.
//   https://www.monabanq.com/fr/pdf/conditions/bourse/conditions-compte-titres-pea.pdf
// The tariff prices "Opérations sur tout type de valeurs cotées sur
// euronext paris" as one item, so ETFs, ETCs and ETNs are kept.
//
// So the catalogue is the whole Paris book (../monabanq/euronextParisBook.mjs,
// read from Euronext's product-directory downloads): every share of the
// regulated market, French or foreign, every Paris ETF, ETC and ETN, minus
// lines on Euronext's halt list, warrants and subscription rights, and lines
// that never traded. Left out: Euronext Growth Paris and Euronext Access
// Paris (filed as their own places in broker-list.json), the XPMC
// multi-currency twins (not named by the bank), bonds, funds (OPCVM are
// subscribed through the bank, not on the exchange), and the foreign
// markets the tariff prices separately ("bourses étrangères", 0.80%, min 50 EUR).
//
// Fees: "Guide de tarification", in force 1 May 2026: "Opérations sur tout
// type de valeurs cotées sur euronext paris - Frais de courtage en ligne
// (min 9,90 €) 0,25 %"; account fee "Gratuit dès le 1er ordre exécuté dans
// le mois sinon 6 €/mois"; custody free.
//   https://www.monabanq.com/fr/pdf/tarifications/monabanq_tarification.pdf
//
//   node brokers/monabanq/monabanq_scraping.mjs

import { writeParisCatalogue } from "./euronextParisBook.mjs";

const rows = await writeParisCatalogue(import.meta.url, "monabanq-parsed.json");
console.error(`Monabanq: ${rows.length} rows`);
