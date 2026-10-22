// What Neway ESX sells, with no login. Neway is the trading app of the
// Ethiopian Securities Exchange itself. An investor signs up in the app
// and trades the ESX book through a trading member. So the book is the
// ESX equity list: the listed companies page, Main and Growth markets.
// Every row is an ordinary share, quoted in birr. ESX lists no ETF yet.
// Bonds, bills and the OTC (unlisted) platform stay out.
//
// The list page prints name, symbol and sector. Each company page says
// its market and security type, so the scraper reads it too. No page
// prints an ISIN. The list is filtered by market as well, and the two
// counts must add up to the full list.
//
// broker-list.json carries no restriction for this place.
//
// The fees are the ESX Fees Schedule (December 2024, amended May 2026):
// a 0.36% exchange transaction fee and a 1.6% cap on the member's
// brokerage commission for equities.
//
//   https://esx.et/equity-market/listed-companies/
//   https://esx.et/equity-market/invest/
//   https://esx.et/news-and-resources/regulatory-framework/
//   https://esx.et/wp-content/uploads/2025/09/ESX-Fees.pdf
//   https://apps.apple.com/us/app/neway-esx/id6753160438
//
//   node brokers/neway/neway_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const exec = promisify(execFile);
const LIST = "https://esx.et/equity-market/listed-companies/";
const MARKETS = { "main-market": "Main Market", "growth-market": "Growth Market" };
const EXCHANGE = "Ethiopian Securities Exchange";
const MIN_ROWS = 7;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const { stdout } = await exec("curl", ["-fsSL", "--max-time", "45", "-A", UA, url], { maxBuffer: 8_000_000, encoding: "utf8" });
      return stdout;
    } catch (error) {
      last = String(error.stderr || error.message || error).trim();
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last || url);
}

function text(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The table is server-side; "-1" is the page's own "Show All" option.
function listedCompanies(html) {
  const table = html.match(/<table[^>]*>\s*<thead[^>]*>(.*?)<\/thead>\s*<tbody[^>]*>(.*?)<\/tbody>/s);
  if (!table) throw new Error("ESX listed companies page has no table");
  const head = [...table[1].matchAll(/<th[^>]*>(.*?)<\/th>/gs)].map((cell) => text(cell[1]));
  if (head.join("|") !== "Name|Symbol|Sector|Date Listed|Date Incorporated") throw new Error(`ESX table columns changed: ${head.join("|")}`);
  const companies = [];
  for (const row of table[2].matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)) {
    const cells = [...row[1].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((cell) => cell[1]);
    // An empty market (Growth, today) prints one "No listings found." cell.
    if (cells.length === 1 && text(cells[0]) === "No listings found.") continue;
    if (cells.length !== 5) throw new Error(`ESX row has ${cells.length} cells`);
    const link = cells[0].match(/href="(https:\/\/esx\.et\/directory\/[^"]+)"/)?.[1];
    const name = text(cells[0]);
    const ticker = text(cells[1]).toUpperCase();
    if (!link || !name || !/^[A-Z0-9]{2,10}$/.test(ticker)) throw new Error(`unreadable ESX row ${text(row[1])}`);
    companies.push({ ticker, name, sector: text(cells[2]), listed: text(cells[3]), link });
  }
  return companies;
}

const all = listedCompanies(await getText(`${LIST}?dt_per_page=-1`));
if (all.length < MIN_ROWS) throw new Error(`ESX printed ${all.length} listed companies`);
if (new Set(all.map((company) => company.ticker)).size !== all.length) throw new Error("repeated ESX symbol");

const marketOf = new Map();
for (const [slug, label] of Object.entries(MARKETS)) {
  for (const company of listedCompanies(await getText(`${LIST}?dt_per_page=-1&dt_market=${slug}`))) {
    if (marketOf.has(company.ticker)) throw new Error(`${company.ticker} is on two ESX markets`);
    marketOf.set(company.ticker, label);
  }
}
if (marketOf.size !== all.length) throw new Error(`ESX markets hold ${marketOf.size} companies, the full list ${all.length}`);

const rows = [];
for (const company of all) {
  const page = text(await getText(company.link));
  const market = marketOf.get(company.ticker);
  if (!market) throw new Error(`${company.ticker} has no ESX market`);
  if (!page.includes(market)) throw new Error(`${company.ticker} page does not say ${market}`);
  const symbol = page.match(/Symbol ([A-Z0-9]+)/)?.[1];
  if (symbol !== company.ticker) throw new Error(`${company.ticker} page prints symbol ${symbol}`);
  const kind = page.match(/Security Type (\w+)/)?.[1];
  if (kind !== "Equity") throw new Error(`${company.ticker} is ${kind || "unmarked"}, not a share`);
  rows.push({
    query: company.ticker,
    ticker: company.ticker,
    name: company.name,
    exchange: EXCHANGE,
    currency: "ETB",
    type: "STOCK",
    raw: [company.ticker, company.name, EXCHANGE, market, company.sector, `listed ${company.listed}`, "STOCK"].join(" "),
  });
}

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("neway-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const byMarket = Object.values(MARKETS).map((label) => `${label} ${[...marketOf.values()].filter((value) => value === label).length}`).join(", ");
console.error(`${rows.length} listings (${rows.length} STOCK) on ${EXCHANGE}: ${byMarket}`);
