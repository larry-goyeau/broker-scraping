// What Fundvest (Fundvest UAB, Vilnius, a Bank of Lithuania brokerage
// firm; app only) sells on the US place, with no login. Its best
// execution policy lists the products it may offer and who executes them:
// "Stocks (shares) of US companies; Fractional Stocks (shares) of US
// companies" through DriveWealth, LLC, and "European ETFs; Stocks (shares)
// of European companies" through Saxo Bank A/S. The invest page says "US
// Stocks: Invest in US stock exchange companies in different sectors". So
// on the US place Fundvest sells shares only: no US ETF, ETN or other
// fund is offered (its ETFs are the European ones bought through Saxo,
// which also matches broker-list's "No US-domiciled ETFs (PRIIPs/KID)").
// A US closed-end fund is a fund, not a company share, and is left out
// with the ETFs (usBook { closedEnd: false }).
//
//   https://fundvest.eu/best-execution-policy
//   https://fundvest.eu/invest/
//
// No list of titles is published (the help centre says the "Selection
// will be increasing constantly over time"), and no page names a board or
// a kind of share left out, so the catalogue is the shares of the whole US
// exchange book of the day (../wellstrade/usBook.mjs): common and ordinary
// shares, ADRs, REITs, partnership units and preferreds on Nasdaq, NYSE,
// NYSE American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt.
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: "US stock
// exchange companies". The US is one NBBO market: one row per title, on
// its primary listing, in dollars. The European shares and ETFs Fundvest
// sells through Saxo are other places, not in this file.
//
// Remark, not a removal: accounts are for people "18+ years old" with "an
// EU citizenship or residency" (help centre).
//
// Fees ("Commission fee per trade 0.35%", "Currency conversion fee 0.50%"
// on instruments not traded in euro; no custody fee; inactivity fee EUR 10
// a month):
//   https://fundvest.eu/fee-schedule/
//
//   node brokers/fundvest/fundvest_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#8211;|&ndash;/g, "–").replace(/&#39;|&rsquo;|&#8217;|’/g, "'").replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://fundvest.eu/best-execution-policy", [
  /European Exchange-traded funds \(ETFs\); Stocks \(shares\) of European companies; Stocks \(shares\) of US companies/i,
  /Saxo Bank A\/S .{0,60}European ETFs; Stocks \(shares\) of European companies/i,
  /DriveWealth, LLC .{0,60}Stocks \(shares\) of US companies/i,
]);
await pause();
await evidence("https://fundvest.eu/invest/", [/Invest in US stock exchange companies/i]);
await pause();
await evidence("https://fundvest.eu/fee-schedule/", [/Commission fee per trade 0\.35%/i, /Currency conversion fee 0\.50%/i]);

const book = await usBook({ closedEnd: false });
const shares = book.filter((row) => row.type === "STOCK");
const rows = stampRows(withoutObligations(shares));
if (rows.length < 5000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("fundvest-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
console.error(`left out ${book.length - shares.length} US ETFs and ETNs (European ETFs only)`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (rows.length < shares.length) console.error(`${shares.length - rows.length} bonds left out`);
