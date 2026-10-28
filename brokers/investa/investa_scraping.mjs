// What Investa (Investa Markets Ltd, London, FCA FRN 1037289) sells in
// shares and exchange-traded products, with no login. Investa is a UK app
// for US shares and US options; it passes orders to Interactive Brokers
// (U.K.): "The purpose of the Investa App is to receive and transmit your
// orders in financial instruments (namely shares, ETFs and options) to
// Interactive Brokers (U.K.) Limited" (terms, clause 1.1). The home page
// offers "A universe of US stocks & ETFs", "Trade a universe of your
// favourite US stocks", and names NVDA, TSLA, SPY and QQQ. It names no
// other market, so the only place is the United States.
//
//   https://www.investa.co.uk/
//   https://www.investa.co.uk/terms-of-service
//
// No page names a list, a segment or a kind of US line it does not take
// (the FAQ and glossary were read too; the glossary explains ADRs), so the
// book is the whole US exchange book of the day, read by
// ../wellstrade/usBook.mjs (shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX
// and the Texas Stock Exchange; warrants, rights, units, when-issued lines,
// listed notes and halted lines are left out there). The US is one NBBO
// market: one row per title on its primary listing, in dollars. OTC lines
// are not offered on the pages (the pricing table only repeats the CAT
// fee rate for OTC equities among third-party fees) and are not in the
// book. US-domiciled ETFs are kept: Investa's pages offer US ETFs and name
// SPY and QQQ, and say nothing of a KID rule.
//
// Remarks, not removals (they depend on the client): "Our service is only
// available to UK persons who have been onboarded as a client by IBKR"
// (terms, clause 4.1); clients are treated as retail clients.
//
// Fees (pricing table on the home page, terms clause 8): "£0 Trading
// Commissions", "£0 Securities Custody", currency conversion 0.99% (IBKR's
// fee), rebated on share trades up to "a cumulative trade value of
// £250,000; 50 trades; or 5,000 shares traded" a year; third-party fees
// (TAF, SEC, CAT) passed on.
//
//   https://www.investa.co.uk/pricing   (redirects to /#pricing)
//
//   node brokers/investa/investa_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const HOME = "https://www.investa.co.uk/pricing";
const TERMS = "https://www.investa.co.uk/terms-of-service";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const plain = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|‍/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&#x27;|[‘’]/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ");

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = plain(await response.text());
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(HOME, [
  /A universe of US stocks & ETFs/i,
  /Trade a universe of your favourite US stocks/i,
  /£0 Trading Commissions/i,
  /Currency Conversion 0\.99%/i,
]);
await sleep(1000);
await evidence(TERMS, [
  /namely shares, ETFs and options\) to Interactive Brokers \(U\.K\.\)/i,
  /only available to UK persons/i,
]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
for (const ticker of ["NVDA", "TSLA", "SPY", "QQQ", "BRK.B"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("investa-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
