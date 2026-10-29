// What Zagora Finacorp (ИП Загора Финакорп АД, Stara Zagora) sells online,
// with no login: every share and exchange-traded fund on the Bulgarian
// Stock Exchange and on BSE International, the BSE's MTF for foreign
// securities.
//
// Its tariff has a section "II Сделки с ФИ, сключени чрез системата ZF
// Trader" (deals made through its ZF Trader online system), with two
// lines: "Сделки с български акции и компенсаторни инструменти" and
// "Сделки с ФИ, търгувани на MTF BSE International"; its ZF Trader page
// offers the program for download. No BSE segment is named as out, so the
// catalogue is the whole BSE and BSE International, read by the shared
// ../abcfinance/bseBook.mjs ({ international: true }): every share of the
// Main Market, BaSE and BEAM (REITs and preference shares too) as STOCK and
// the fund units of the Exchange Traded Products segment as ETF, plus the
// BSE International shares, ETFs, ETCs and ETNs; less lines in liquidation
// or bankruptcy, lines under a BSE suspension or removal notice and lines
// with no trade in the last year. Bonds, compensatory instruments, warrants
// and rights stay out. Places: "Bulgarian Stock Exchange" and "BSE
// International", XBUL, in EUR.
//
//   https://zf-bg.com/zf-trader/
//   https://zf-bg.com/тарифа-за-таксите-и-комисионните/
//   https://www.bse-sofia.bg/en/listed-instruments
//   https://www.bse-sofia.bg/en/mtf-international-company
//
// Fees: https://zf-bg.com/wp-content/uploads/2025/08/2024_12_20_Тарифа_ИП_EUR.pdf
// (in force 21.01.2025: through ZF Trader, Bulgarian shares "0,5 % от
// стойността на сделката, минимум 2,56 евро", BSE International "0,5 % от
// стойността на сделката, минимум 10,23 евро", exchange and clearing fees
// on top; office deals 1 % to 2 %).
//
//   node brokers/zagora/zagora_scraping.mjs

import { writeBseCatalogue } from "../abcfinance/bseBook.mjs";
import { says, pdfAnswers } from "../denizyatrm/evidence.mjs";

const TARIFF = "https://zf-bg.com/wp-content/uploads/2025/08/2024_12_20_Тарифа_ИП_EUR.pdf";

await says("https://zf-bg.com/zf-trader/", [/ZF TRADER/i]);
// The tariff page still links this tariff, and the tariff still answers.
await says(encodeURI("https://zf-bg.com/тарифа-за-таксите-и-комисионните/"), [/2024_12_20_Тарифа_ИП_EUR\.pdf/], { raw: true });
await pdfAnswers(encodeURI(TARIFF));

const rows = await writeBseCatalogue(import.meta.url, "zagora-parsed.json", { international: true });
if (rows.length < 100) throw new Error(`only ${rows.length} BSE rows`);
