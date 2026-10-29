// What Spaceship (Spaceship Capital Limited, Sydney; part of eToro) sells
// in US shares and exchange-traded products through Spaceship US
// Investing, with no login. The service is for Australian residents and
// "arranges the US Investing service through a US broker-dealer". The help
// centre says: "You can invest in thousands of US-listed exchange-traded
// funds (ETFs) and stocks. These are all listed on US exchanges such as
// the New York Stock Exchange (aka the NYSE) and NASDAQ." The product page
// says "From the New York Stock Exchange to the Nasdaq — invest in US ETFs
// and stocks your way".
//
//   https://help.spaceship.com.au/en/articles/8244694-what-can-i-invest-in-and-on-what-stock-exchanges
//   https://www.spaceship.com.au/us-investing/
//
// The list sits in the app. "Thousands" gives no number, and "US exchanges
// such as the NYSE and NASDAQ" names examples, not a closed list, so the
// place is the whole United States (owner rules: no number = the whole
// place; "such as" = the whole country). The catalogue is the whole US
// exchange book of the day (../wellstrade/usBook.mjs): shares, ADRs,
// REITs, partnership units, preferreds, closed-end funds, ETFs and ETNs on
// Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock
// Exchange, less the lines with an open trade halt; warrants, rights,
// units, when-issued lines and listed notes are left out there, bonds by
// withoutObligations. OTC Markets lines are not added: Spaceship names
// only US-listed securities. One row per title on its primary listing, in
// dollars (bought and sold from Australian dollars).
//
// Remarks, not removals: Australian residents only; fractional buys from
// A$10.
//
// Fees (US Investing Fee Schedule, 1 July 2026): monthly fee "AU$0 per
// month (incl. GST) If you've paid the Spaceship Voyager monthly fee within
// the last month ... Otherwise AU$4 per month (incl. GST)"; "Foreign
// exchange (FX) fee 0.70% of the trade value", charged on every buy and
// sell; SEC fee US$0.206 per US$10,000 sold; TAF US$0.000195 a share sold,
// capped at US$9.79. No brokerage per trade ("One monthly fee, unlimited
// trades").
//   https://www.spaceship.com.au/documents/spaceship_us_investing_fee_schedule.pdf
//
//   node brokers/spaceship/spaceship_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { readPage, readPdf, check, describe } from "../bellbank/ekoBook.mjs";

const HELP = "https://help.spaceship.com.au/en/articles/8244694-what-can-i-invest-in-and-on-what-stock-exchanges";
const PAGE = "https://www.spaceship.com.au/us-investing/";
const FEES = "https://www.spaceship.com.au/documents/spaceship_us_investing_fee_schedule.pdf";

check(HELP, await readPage(HELP), [
  /You can invest in thousands of US-listed exchange-traded funds \(ETFs\) and stocks/i,
  /listed on US exchanges such as the New York Stock Exchange \(aka the NYSE\) and NASDAQ/i,
]);
check(PAGE, await readPage(PAGE), [/One monthly fee, unlimited trades/i, /US Investing Fee Schedule/i]);
check(FEES, await readPdf(FEES), [/Foreign exchange \(FX\) fee 0\.70% of the trade value/i, /AU\$4 per month/i]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
for (const ticker of ["AAPL", "NKE", "TSLA", "VOO"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("spaceship-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(describe(rows));
