// What Acorns (Acorns Securities, LLC) lets a client pick, with no login.
// Acorns invests in preset ETF portfolios; a client chooses titles only in
// a Custom Portfolio ("Add individual stocks and ETFs to your already
// diversified portfolio", a "Gold subscription exclusive" on the pricing
// page). The help centre prints the full list of what a Custom Portfolio
// can hold: "Here's a full list of what's available as of 2/20/2024", in
// three tables (Base Portfolio ETFs, Custom Portfolio ETFs, Custom
// Portfolio Stocks). Another article says "You can pick from around 100
// stocks of the largest U.S. companies that are individually valued at $75
// billion or more". The book is the two Custom Portfolio tables:
//
// - Custom Portfolio Stocks (about 100) and Custom Portfolio ETFs (13).
// - Base Portfolio ETFs are left out: they are the funds Acorns puts in its
//   preset portfolios by risk level, not titles a client can buy one by
//   one.
// - A ticker the company has changed since the list's date is read under
//   its new code (RENAMED: Marsh McLennan's MMC is MRSH, same ISIN
//   US5717481023). A ticker that is no longer on a US exchange today is
//   left out and printed.
//
// Remarks, not removals: Custom Portfolios need the Gold plan, and the
// share of the Invest account they may take is capped by the client's risk
// level ("Aggressive 50%" down to "Conservative 10%").
//
// Lines take venue, name and ISIN from the US exchange book of the day
// (../wellstrade/usBook.mjs). The US is one NBBO market: one row per title
// on its primary listing, in dollars.
//
//   https://help.acorns.com/hc/en-us/articles/Can-I-see-a-list-of-Base-ETFs-Custom-Portfolio-ETFs-and-Custom-Portfolio-stocks-I-can-choose-from
//   https://help.acorns.com/hc/en-us/articles/Which-stocks-can-I-choose-from-for-Custom-Portfolios
//   https://help.acorns.com/hc/en-us/articles/What-is-a-customization-limit-for-Custom-Portfolios
//
// Fees: subscriptions of $4, $8 and $12 a month (Bronze, Silver, Gold),
// "No hidden costs or transaction fees":
//   https://www.acorns.com/pricing/
//
//   node brokers/acorns/acorns_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LIST = "https://help.acorns.com/hc/en-us/articles/Can-I-see-a-list-of-Base-ETFs-Custom-Portfolio-ETFs-and-Custom-Portfolio-stocks-I-can-choose-from";
const RENAMED = { MMC: "MRSH" };
const TABLES = { "Custom Portfolio ETFs": "ETF", "Custom Portfolio Stocks": "STOCK" };

async function text(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
  }
  throw new Error(last);
}

const clean = (value) =>
  String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;|\s+/g, " ")
    .trim();

// The article is rendered client side; its body sits in __NEXT_DATA__.
const html = await text(LIST);
const data = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if (!data) throw new Error(`${LIST}: no __NEXT_DATA__`);
const body = JSON.parse(data[1]).props?.pageProps?.articleData?.body || "";
if (!/full list of what's available/i.test(clean(body))) throw new Error(`${LIST} no longer gives the full list`);

const picks = [];
for (const part of body.split(/<h2[^>]*>/).slice(1)) {
  const heading = clean(part.split("</h2>")[0]);
  const type = TABLES[heading];
  if (!type) continue;
  const cells = [...part.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => clean(match[1]));
  for (let i = 0; i + 1 < cells.length; i += 2) {
    if (/^Ticker/i.test(cells[i])) continue;
    picks.push({ ticker: cells[i].toUpperCase().replace(/\//g, "."), label: cells[i + 1], type, table: heading });
  }
}
const byTable = (table) => picks.filter((pick) => pick.table === table).length;
if (byTable("Custom Portfolio Stocks") < 80 || byTable("Custom Portfolio ETFs") < 8) {
  throw new Error(`short list: ${byTable("Custom Portfolio Stocks")} stocks, ${byTable("Custom Portfolio ETFs")} ETFs`);
}

const book = await usBook();
const lines = new Map(book.map((row) => [row.ticker, row]));
const kept = [];
const gone = [];
const seen = new Set();
for (const pick of picks) {
  const row = lines.get(RENAMED[pick.ticker] || pick.ticker);
  if (!row) {
    gone.push(`${pick.ticker} (${pick.label})`);
    continue;
  }
  if (seen.has(row.ticker)) continue;
  seen.add(row.ticker);
  if (row.type !== pick.type && !(pick.type === "ETF" && row.type === "ETN")) {
    console.error(`${pick.ticker}: Acorns lists it as ${pick.type}, the book has ${row.type}; book type kept`);
  }
  kept.push({ ...row, raw: `${row.raw} | Acorns ${pick.table}: ${pick.label}` });
}

const rows = stampRows(withoutObligations(kept));
fs.writeFileSync(new URL("acorns-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows of ${picks.length} listed`, counts);
if (gone.length) console.error(`not on a US exchange today, left out: ${gone.join("; ")}`);
