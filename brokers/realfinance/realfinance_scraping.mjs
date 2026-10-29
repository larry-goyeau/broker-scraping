// What Real Finance (ИП Реал Финанс АД, Varna) sells online, with no
// login: every share and exchange-traded fund on the Bulgarian Stock
// Exchange.
//
// Its services page: "Intermediary services for deals with shares, bonds
// and compensatory instruments on BSE Sofia" and, under "Platforms for
// online trade", "Direct trade on BSE – Sofia via internet, by using COBOS
// (Client Order-Book Online System)"; its tariff prices orders placed in
// its "C Trader" system. No BSE segment is named as out, so the catalogue
// is the whole BSE, read by the shared ../abcfinance/bseBook.mjs: every
// share of the Main Market, BaSE and BEAM (REITs and preference shares too)
// as STOCK and the fund units of the Exchange Traded Products segment as
// ETF, less lines in liquidation or bankruptcy, lines under a BSE
// suspension or removal notice and lines with no trade in the last year.
// Bonds, compensatory instruments, warrants and rights stay out. All rows
// are on "Bulgarian Stock Exchange", XBUL, in EUR.
//
// MTF Sofia: left out. broker-list.json gives it, and the tariff has a
// section for deals on "MTF Sofia" (0.15 %, minimum 55 EUR per order), but
// it is priced per order like the office deals, not as a C Trader (online)
// trade, and no page says it can be reached online. BSE International (the
// BSE's foreign-share MTF) is not offered on its pages.
//
//   https://real-finance.net/?lang=en&page_id=326
//   https://www.bse-sofia.bg/en/listed-instruments
//
// Fees: https://real-finance.net/wp-content/uploads/2026/07/2026-08-17-Tarifa_RF-STANDARTNA.pdf
// (a scanned tariff: "I. Тарифи за ползване на системата C Trader:
// Комисиона при покупка – за сделка 0.5 %, минимум 3 [EUR]; Комисиона при
// продажба – за сделка 0.5 %, минимум 3"; deals in the office on the
// regulated market "3 %, минимум 12").
//
//   node brokers/realfinance/realfinance_scraping.mjs

import { writeBseCatalogue } from "../abcfinance/bseBook.mjs";
import { says, pdfAnswers } from "../denizyatrm/evidence.mjs";

await says("https://real-finance.net/?lang=en&page_id=326", [
  /Direct trade on BSE – Sofia via internet, by using COBOS/,
  /Intermediary services for deals with shares, bonds and compensatory instruments on BSE Sofia/,
]);
await pdfAnswers("https://real-finance.net/wp-content/uploads/2026/07/2026-08-17-Tarifa_RF-STANDARTNA.pdf");

const rows = await writeBseCatalogue(import.meta.url, "realfinance-parsed.json");
if (rows.length < 60) throw new Error(`only ${rows.length} BSE rows`);
