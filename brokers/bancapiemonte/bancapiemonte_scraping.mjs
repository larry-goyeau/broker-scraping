// What Banca del Piemonte (Banca del Piemonte S.p.A., Turin) sells on the
// Italian market through its online securities account, with no login. Its
// only place here is "Italy".
//
// Its "Deposito Titoli online" page, read 2026-10-25, prints no list of
// titles: the account trades "azioni, obbligazioni e altri strumenti
// finanziari sul mercato italiano e sui principali mercati esteri".
//   https://www.bancadelpiemonte.it/privati-e-famiglie/servizi-online/deposito-titoli-online/
// No Italian venue or segment is named and nothing is excluded, so the
// catalogue is the main exchange: Borsa Italiana's Euronext Milan and
// ETFplus. The tariff prices "Titoli azionari ed ETF negoziati in Italia" as
// one item, so ETFs stay, and ETCs and ETNs (ETFplus lines the bank does not
// set apart) stay too.
//
// So the catalogue is the whole Milan book (./euronextMilanBook.mjs, read
// from Euronext's product-directory downloads): every share of Euronext
// Milan (STAR included, savings shares kept), every ETFplus ETF, ETC and ETN,
// minus lines on Euronext's halt list, warrants and rights, and lines that
// never traded. Left out: Euronext Growth Milan, the Global Equity Market
// and EuroTLX (their own places in broker-list.json, not named by the bank),
// SeDeX certificates, bonds and funds. Warrants and rights are priced in the
// over-the-counter tariff but are out, as in other scrapers.
//
// Fees: "Foglio informativo - Titoli - 19/06/2026", "Operazioni effettuate
// per via telematica": "Titoli azionari ed ETF negoziati in Italia - 0,25% su
// ogni eseguito min. € 9,38" (foreign: 0,625% min. € 37,50). Branch orders:
// 1,015% min. € 19,36.
//   https://www.bancadelpiemonte.it/wp-content/uploads/2021/10/TITOLI.pdf
//
//   node brokers/bancapiemonte/bancapiemonte_scraping.mjs

import { writeMilanCatalogue } from "./euronextMilanBook.mjs";

const rows = await writeMilanCatalogue(import.meta.url, "bancapiemonte-parsed.json");
console.error(`Banca del Piemonte: ${rows.length} rows`);
