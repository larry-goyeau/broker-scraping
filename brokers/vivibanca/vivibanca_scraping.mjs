// What ViViBanca (ViViBanca S.p.A., Turin) sells on Euronext Milan, with no
// login. Its only place here is Borsa Italiana's regulated markets: shares
// of Euronext Milan (XMIL) and the ETFs, ETCs and ETNs of ETFplus.
//
// The bank prints no list of titles. Its online-trading sheet (MITO, in
// force 29 Nov 2024) says clients can "effettuare operazioni di acquisto e
// vendita di strumenti finanziari trattati su mercati regolamentati".
//   https://vivibanca.it/public/upload/homebanking_mito.pdf
// Its MiFID file (order-transmission strategy, section 3.4) lists, first,
// "azioni ed ETF quotati sui mercati regolamentati italiani"; orders go to
// a single broker, Invest Banca S.p.A.
//   https://vivibanca.it/public/upload/fascicolo%20normativo%20e%20informativo.pdf
// Neither page excludes a segment, ETCs or ETNs, so ETFplus is kept whole.
//
// So the catalogue is the whole Milan book (./euronextMilanBook.mjs, read
// from Euronext's product directory): every Euronext Milan share, STAR and
// savings shares included, every ETFplus ETF, ETC and ETN, minus warrants
// and rights, halted lines, shares with no trade for 30 days (suspended)
// and lines that never traded. Left out: Euronext Growth Milan and
// Euronext Global Equity Market (MTFs, not "mercati regolamentati"), MIV,
// SeDeX and certificates, bonds (MOT, EuroTLX), and funds (OICR are
// subscribed, not traded on the exchange). The fee sheet also prices
// "Azionario Estero" (0.70%, min 30 EUR); that is not this place.
//
// Fees: "Foglio informativo ... custodia e amministrazione di strumenti
// finanziari", version 7 of 19 Nov 2024: "Azionario Italia 0,50% del
// valore dell'operazione (Min. Euro 5,00)"; MITO "Canone trading Online
// Euro 1,50" a month.
//   https://vivibanca.it/public/upload/deposito_titoli.pdf
//
//   node brokers/vivibanca/vivibanca_scraping.mjs

import { writeMilanCatalogue } from "./euronextMilanBook.mjs";

const rows = await writeMilanCatalogue(import.meta.url, "vivibanca-parsed.json", {
  types: ["STOCK", "ETF", "ETC", "ETN"],
  growth: false,
});
console.error(`ViViBanca: ${rows.length} rows`);
