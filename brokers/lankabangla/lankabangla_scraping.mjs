// What LankaBangla sells in shares, with no login. iBroker and
// TradeXpress search a symbol after sign-in. They do not print the book.
// The pages name the Dhaka Stock Exchange and the Chittagong Stock
// Exchange. Each exchange prints its listed companies. A treasury bond,
// a corporate bond, a debenture and a mutual fund stay out: they are
// other products. No exchange-traded fund is listed. Every line here is
// quoted in taka. The same share on both boards is two lines.
//
//   https://www.lbsbd.com/AboutUs
//   https://www.dse.com.bd/companies
//   https://www.cse.com.bd/company/listedcompanies
//   https://www.cse.com.bd/sme/listedcompanies
//
//   node brokers/lankabangla/lankabangla_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DSE = "https://www.dse.com.bd/companies";
const CSE = "https://www.cse.com.bd/company/listedcompanies";
const CSE_SME = "https://www.cse.com.bd/sme/listedcompanies";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const OUTPUT = new URL("lankabangla-parsed.json", import.meta.url);
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);

const DROP_SECTOR = new Set(["treasury bond", "corporate bond", "debenture", "mutual funds"]);

function clean(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function otherProduct(name) {
  return /\b(mutual fund|bond|debenture|sukuk|treasury)\b/i.test(name || "");
}

async function page(url) {
  const { stdout } = await execFileAsync(
    "curl",
    ["-fsS", "--compressed", "-m", "40", "-A", UA, "-H", "Accept: text/html", url],
    { maxBuffer: 20 * 1024 * 1024 },
  );
  if (!stdout.includes("<")) throw new Error(`${url} did not return a page`);
  return stdout;
}

function dhaka(html) {
  const card =
    /class="block flex-1 min-w-0" href="\/company\/([^"]+)"[\s\S]{0,1600}?font-semibold tracking-tight">([^<]+)<\/span>[\s\S]{0,900}?text-muted\)">([^<]*)<span class="hidden md:inline"> · <!-- -->([^<]+)<\/span>/g;
  const rows = [];
  for (const match of html.matchAll(card)) {
    const ticker = clean(match[2]).toUpperCase();
    const name = clean(match[3]);
    const sector = clean(match[4]).toLowerCase();
    if (!ticker || !name) continue;
    if (DROP_SECTOR.has(sector) || otherProduct(name)) continue;
    rows.push({ ticker, name, exchange: "DSE" });
  }
  if (rows.length < 250) throw new Error(`Dhaka published ${rows.length} shares`);
  return rows;
}

function chittagongRows(html) {
  const rows = [];
  for (const match of html.matchAll(/<option value='([^'|]+)\|[^']*'>\s*[^<|]+?\|\s*([^<]+)<\/option>/g)) {
    const ticker = clean(match[1]).toUpperCase();
    const name = clean(match[2]);
    if (!ticker || !name || otherProduct(name) || otherProduct(ticker)) continue;
    rows.push({ ticker, name, exchange: "CSE" });
  }
  return rows;
}

function bdIsins() {
  const byTicker = new Map();
  const clashes = new Set();
  for (const file of [STOCKS, ETFS]) {
    const text = readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/).slice(1)) {
      if (!line) continue;
      const parts = line.split(",");
      if (parts.length < 4) continue;
      const isin = parts[2].trim().toUpperCase();
      const ticker = parts[0].split(":").pop().trim().toUpperCase();
      if (!isin.startsWith("BD") || !ticker) continue;
      const prev = byTicker.get(ticker);
      if (prev && prev !== isin) clashes.add(ticker);
      else byTicker.set(ticker, isin);
    }
  }
  for (const ticker of clashes) byTicker.delete(ticker);
  return byTicker;
}

const [dhakaHtml, cseHtml, smeHtml] = await Promise.all([page(DSE), page(CSE), page(CSE_SME)]);
const cse = chittagongRows(cseHtml);
const sme = chittagongRows(smeHtml);
if (cse.length < 200) throw new Error(`Chittagong published ${cse.length} shares`);
if (sme.length < 10) throw new Error(`Chittagong SME published ${sme.length} shares`);

const seen = new Set();
const unique = [];
for (const row of [...dhaka(dhakaHtml), ...cse, ...sme]) {
  const key = `${row.exchange}:${row.ticker}`;
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(row);
}
unique.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));

const isins = bdIsins();
const results = unique.map((row) => {
  const isin = isins.get(row.ticker) || "";
  return {
    query: isin || row.ticker,
    ticker: row.ticker,
    name: row.name,
    exchange: row.exchange,
    currency: "BDT",
    type: "STOCK",
    raw: [row.ticker, row.name, row.exchange, "BDT", "STOCK"].join(" "),
    isin,
  };
});

if (!results.some((row) => row.exchange === "DSE" && row.ticker === "GP")) {
  throw new Error("GP was not a Dhaka share");
}
if (!results.some((row) => row.exchange === "CSE" && row.ticker === "GP")) {
  throw new Error("GP was not a Chittagong share");
}
if (results.some((row) => row.ticker.startsWith("TB") || /mutual fund/i.test(row.name))) {
  throw new Error("a bond or a fund stayed in the file");
}

const stamped = stampRows(withoutObligations(results));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const withIsin = stamped.filter((row) => row.isin).length;
const dse = stamped.filter((row) => row.exchange === "DSE").length;
const chittagong = stamped.filter((row) => row.exchange === "CSE").length;
console.error(`${stamped.length} listings, ${withIsin} with an ISIN, ${dse} DSE, ${chittagong} CSE`);
