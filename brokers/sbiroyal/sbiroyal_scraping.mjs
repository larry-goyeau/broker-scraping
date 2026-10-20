// SBI Royal Securities is a member of the Cambodia Securities Exchange
// (CSX) and trades its listed shares. Its market-data pages carry one page
// per CSX stock, but they lag the exchange: Picasso City Garden (PCG,
// listed December 2025) has no page. So the list kept is the CSX's own
// list of listed companies (symbol, ISIN, name, listing date), and the
// broker's page is the check: every stock it shows must be on it.
//
//   https://sbiroyal.com.kh/pestech
//   https://csx.com.kh/api/v1/website/company/stock/list-companies
//
// The broker writes DBD and CAMGSM for the CSX symbols DBDE and CGSM.
// CSX shares are quoted in riel (KHR). Bonds are another CSX list and stay
// out.
//
//   node brokers/sbiroyal/sbiroyal_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BROKER = "https://sbiroyal.com.kh/pestech";
const CSX = "https://csx.com.kh/api/v1/website/company/stock/list-companies";
const BROKER_ALIAS = { DBD: "DBDE", CAMGSM: "CGSM" };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url, accept) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

const listing = JSON.parse(await get(CSX, "application/json"));
const companies = listing.data || [];
if (companies.length !== listing.totalRecords) throw new Error(`CSX announced ${listing.totalRecords}, sent ${companies.length}`);
if (companies.length < 11) throw new Error(`CSX list has ${companies.length} companies`);

const rows = companies.map((company) => ({
  query: company.symbolEn,
  ticker: company.symbolEn,
  name: company.nameEn,
  exchange: "Cambodia Securities Exchange",
  mic: "XCSX",
  currency: "KHR",
  type: "STOCK",
  isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(company.icode || "") ? company.icode : "",
  raw: [company.symbolEn, company.icode, company.nameEn, `listed ${company.date}`].join(" | "),
}));

// The broker page: the stock it is about, then "SYMBOL (date) View More" for the others.
await sleep(400);
const page = await get(BROKER, "text/html");
const text = page.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const named = [...text.matchAll(/\b([A-Z]{2,7}) \(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\)/g)].map((m) => m[1]);
const current = text.match(/Daily Closing Price ([A-Z]{2,7}) From/)?.[1];
if (current) named.push(current);
if (named.length < 10) throw new Error(`broker page shows only ${named.length} stocks`);
const tickers = new Set(rows.map((row) => row.ticker));
const unknown = named.map((ticker) => BROKER_ALIAS[ticker] || ticker).filter((ticker) => !tickers.has(ticker));
if (unknown.length) throw new Error(`broker page shows stocks not on the CSX list: ${unknown.join(" ")}`);
const extra = [...tickers].filter((ticker) => !named.some((name) => (BROKER_ALIAS[name] || name) === ticker));
if (extra.length) console.error(`on the CSX list, not yet on the broker page: ${extra.join(" ")}`);

for (const ticker of ["ABC", "PWSA", "PPAP"]) {
  if (!tickers.has(ticker)) throw new Error(`${ticker} missing`);
}

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("sbiroyal-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(counts);
