// What HSBC Securities (USA) Inc. sells in its Self-Directed Brokerage
// account (online banking, for HSBC Premier clients), with no login. Its
// pages name the kinds, not a list: "Trade stocks, ETFs and mutual funds
// with an HSBC Securities (USA) Inc. (HSBC Securities) self-directed
// brokerage account" and "Trade U.S. domestic equities and ETFs at a fee of
// only $10.99 per trade" (product page), "the platform required to trade
// Equities, ETFs, and Mutual Funds" (FAQ). No page names a board, a
// segment or a kind of listed share or fund it does not sell, and none
// mentions OTC trading, so the catalogue is the whole US exchange book of
// the day (../wellstrade/usBook.mjs): every share, ADR, REIT, partnership
// unit, preferred, closed-end fund, ETF and ETN listed on Nasdaq, NYSE,
// NYSE American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less
// the lines with an open trade halt.
//
// Remarks, not removals: "Certain Equities, ETFs, and Mutual Funds may be
// held in your account, depending on your location. Based on your legal,
// mailing and residential address, there may be limitations on what types
// of investments you can make online" (FAQ), and the account is offered
// only to "existing eligible HSBC Bank USA, N.A. Premier customers". Both
// depend on the client.
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). International equities are sold only through the
// desk ("International equities cannot be executed online", 0.25% with a
// $65 minimum) and are not part of this place.
//
// The US is one NBBO market: one row per title, on its primary listing, in
// dollars.
//
//   https://www.us.hsbc.com/investments/products/self-directed-brokerage/
//   https://www.us.hsbc.com/investments/products/self-directed-brokerage/faq/
//
// Fees ($10.99 per online US equity or ETF trade, $35 through the Wealth
// Services Desk, 4% of principal maximum):
//   https://www.us.hsbc.com/content/dam/hsbc/us/en_us/investments/disclosures/hsbc-fee-schedule-investments.pdf
//
//   node brokers/hsbcus/hsbcus_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://www.us.hsbc.com/investments/products/self-directed-brokerage/";

// The product page still says what the header quotes, or the run stops.
const response = await fetch(PAGE, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`${response.status} ${PAGE}`);
const page = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");
for (const pattern of [/Trade U\.S\. domestic equities and ETFs at a fee of only \$10\.99 per trade/i, /Trade stocks, ETFs/i]) {
  if (!pattern.test(page)) throw new Error(`${PAGE} no longer says ${pattern}`);
}

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("hsbcus-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (rows.length < book.length) console.error(`${book.length - rows.length} bonds left out`);
