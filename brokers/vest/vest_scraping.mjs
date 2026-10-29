// What Vest (formerly Sproutfi; Vest app and Vest Web for Latin American
// investors; brokerage Northbound Securities LLC, custody through
// DriveWealth) sells in US shares and ETFs, with no login. The home page:
// "Invest in 9,000+ stocks, ETFs, and fixed-income securities across the
// NYSE and Nasdaq" and "Invest 9,000+ stocks and ETFs on Nasdaq and NYSE,
// from $1".
//
//   https://www.vest.investments/
//
// The list sits in the app. The places are closed, "the NYSE and Nasdaq":
// ../tfcapital/usTop.mjs reads "NYSE" as the markets that carry the NYSE
// name (NYSE, NYSE American, NYSE Arca where most US ETFs list, NYSE Texas)
// and "Nasdaq" as Nasdaq; Cboe BZX, Texas Stock Exchange and IEX listings
// are left out. Owner rule (stated count, top N): N = 9,000 (one figure for
// stocks and ETFs; the fixed income in the first wording is not in this
// catalogue), and the catalogue keeps the 9,000 most popular lines of those
// markets, all kinds ranked together by 30-day average traded value
// (usTop). The book is the whole US exchange book of the day
// (../wellstrade/usBook.mjs: warrants, rights, units, when-issued lines,
// listed notes and halted lines out; bonds out by withoutObligations). No
// OTC line. One row per title on its primary listing, in dollars.
//
// Fees (Fee Schedule, linked from the home page): "Stocks, REITs, and ETFs
// (U.S.) Purchase or sale commission: $0 USD on orders you place yourself,
// outside the Vest AI advisory service", platform fee $0 a month; orders
// through Vest AI pay 0.50% of the order, up to $5 an order and $20 a month;
// "ADR Commission Varies according to ADR"; SEC $20.60 per $1,000,000, TAF
// $0.000166 a share sold (max $8.30), FINRA CAT. Funding in BRL, MXN, COP or
// NGN pays the exchange fees the schedule lists.
//   https://storage.googleapis.com/northbound-legal-documents/FeeSchedule_V.02_17_03_2024.pdf
//
//   node brokers/vest/vest_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { NYSE_NASDAQ, usTop } from "../tfcapital/usTop.mjs";
import { readPage, readPdf, linkOf, check, describe } from "../bellbank/ekoBook.mjs";

const HOME = "https://www.vest.investments/";
const N = 9000;

const home = await readPage(HOME);
check(HOME, home, [
  /Invest in 9,000\+ stocks, ETFs, and fixed-income securities across the NYSE and Nasdaq/i,
  /9,000\+ stocks and ETFs on Nasdaq and NYSE/i,
  /zero commissions/i,
]);
const feeSchedule = linkOf(HOME, home, /FeeSchedule[^"]*\.pdf/i);
check(feeSchedule, await readPdf(feeSchedule), [/Purchase or sale commission: \$0 USD on orders you place yourself/i]);

const book = await usBook();
const all = stampRows(withoutObligations(book)).filter((row) => NYSE_NASDAQ.has(row.mic));
if (all.length < 10000) throw new Error(`only ${all.length} NYSE and Nasdaq rows`);
const rows = await usTop(all, N);
if (rows.length !== N) throw new Error(`only ${rows.length} rows`);
for (const ticker of ["AAPL", "SPY", "QQQ", "BRK.B"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
const top = rows.report;
rows.report = { ...book.report, top };
fs.writeFileSync(new URL("vest-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(`fee schedule ${feeSchedule}`);
console.error(describe(rows));
