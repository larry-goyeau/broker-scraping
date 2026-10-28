// What Plum Money CY (Plum's Cyprus entity, CySEC licence 407/21) sells on
// the New York Stock Exchange, with no login. Its order handling policy,
// inside the terms, says: "you will be able to submit orders to US stocks
// listed on the New York Stock Exchange ("NYSE") and the Nasdaq Stock
// Market ("NASDAQ")", sent to Alpaca Securities LLC. The terms define the
// "Securities" only as "the financial instruments made available via the
// Plum App"; the stock page says "Choose from 3000 companies" and no page
// lists them or names a board, segment or kind of share left out. So the
// catalogue is the whole NYSE share book of the day, read by
// ../wellstrade/usBook.mjs and kept to MIC XNYS (shares, ADRs, REITs,
// preferreds, closed-end funds; warrants, rights, units, when-issued lines,
// listed notes and lines with an open trade halt are left out there).
// broker-list.json gives Plum Money CY the New York Stock Exchange only;
// the Nasdaq titles the same sentence names are a broker-list question,
// not added here.
//
// ETFs are left out. broker-list.json says "No US-domiciled ETFs
// (PRIIPs/KID)", and Plum's own pages bear it out: ETFs are a separate
// product, "An investment account dedicated to trading ETFs. We execute
// your orders via our execution venue, Upvest Securities GmbH" (costs and
// charges disclosure), and the ETF terms make the client confirm "you've
// read and understood the KID for the ETF you're investing in". The
// Alpaca account that reaches the NYSE is "Stock Investing (US Shares &
// Fractional)": "Invest in US-listed stocks". Every NYSE ETF of the book
// is US-domiciled (US ISIN), with no KID, so none stays.
//
// The US is one NBBO market: one row per title on its listing exchange, in
// dollars (Alpaca "commits to execute at the National Best Bid or Offer").
//
// Fees: trade fee EUR 1.00 Basic, 0.30 Pro, 0.05 Boost, 0 Premium and Max
// ("First 2 trades are free (lifetime)"), FX fee 0.25% / 0.25% / 0.12% /
// 0.10% / 0.10%, plus SEC, FINRA TAF and CAT fees passed at cost:
//   https://withplum.com/en-cy/legal/fees
//   https://withplum.com/api/files/file/EU%202026%20Costs%20and%20Charges.pdf
// Offer and exclusions:
//   https://withplum.com/en-cy/legal/terms
//   https://withplum.com/en-cy/stock-investing
//
//   node brokers/plummoneycy/plummoneycy_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The pages still say what the header quotes, or the run stops. The terms
// sit in the page's JSON as well as its HTML, so quotes are matched on the
// raw text with tags and escapes taken out.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<[^>]+>/g, " ")
    .replace(/\\+"/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://withplum.com/en-cy/legal/fees", [/Trade Fee/, /Your first 2 trades are free/i, /Costs (&|and) Charges/]);
await pause();
await evidence("https://withplum.com/en-cy/legal/terms", [
  /submit orders to US stocks listed on the New York Stock Exchange/i,
  /Alpaca Securities LLC/,
  /Upvest Securities GmbH/,
  /read and understood the KID for the ETF/i,
]);
await pause();

const book = await usBook();
const nyse = book.filter((row) => row.mic === "XNYS");
const etfs = nyse.filter((row) => row.type !== "STOCK");
const nonUs = etfs.filter((row) => !/^US/.test(row.isin || ""));
if (nonUs.length) throw new Error(`NYSE funds without a US ISIN, check the KID rule: ${nonUs.map((row) => row.ticker).join(" ")}`);

const rows = stampRows(withoutObligations(nyse.filter((row) => row.type === "STOCK")));
if (rows.length < 2000) throw new Error(`only ${rows.length} NYSE shares`);
for (const ticker of ["JPM", "KO", "BRK.B"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("plummoneycy-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

console.error(`${rows.length} NYSE shares, ${rows.filter((row) => row.isin).length} with an ISIN; ${etfs.length} US-domiciled ETFs/ETNs left out`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ") || "none"}`);
