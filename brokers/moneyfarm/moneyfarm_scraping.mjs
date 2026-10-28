// What Moneyfarm (UK) sells through its DIY "Share Investing" account on the
// London Stock Exchange, with no login.
//
// Moneyfarm's FAQ says "You can invest in UK Stocks and ETFs" and calls the
// service one "to invest in UK single name stocks, shares and ETFs"; the
// pricing table charges "£3.95" a trade on "US and UK Shares, ETFs & Mutual
// Funds" and lists the London Stock Exchange's stamp duty and PTM levy.
//
//   https://www.moneyfarm.com/uk/share-investing/   (fees)
//   https://www.moneyfarm.com/uk/pricing/
//   https://www.moneyfarm.com/uk/contact-us/        (FAQ)
//
// ETFs: Moneyfarm publishes its own list, "Browse the full list of ETFs
// available to trade on Moneyfarm" (about 500 lines, all embedded in the
// page). Each line has an id "<isin>-<mic>-<currency>", e.g.
// "ie000519m2u5-xlon-gbp". Only the XLON lines are kept: the two MTAA
// (Borsa Italiana) lines are another place. Each one is matched to the LSE
// book on its ISIN and currency ("gbp" is the sterling line, GBX or GBP as
// the LSE quotes it; "usd" the dollar line), which gives the TIDM and the
// type (an iShares or WisdomTree gold line on the list is an ETC on the
// LSE). A list line with no open LSE line of that ISIN and currency is
// left out and printed.
//
//   https://www.moneyfarm.com/uk/trading/etf/
//   https://www.moneyfarm.com/uk/sitemap.xml        (count check)
//
// Shares: Moneyfarm publishes no share list (the site has no stock pages
// and its universe is only given as "1,000+ individual stocks, ETFs, bonds,
// and mutual funds"). So, by the house rule for a single-place broker, the
// shares are the whole LSE share book (Main Market, AIM, ATT), restricted
// to what Moneyfarm names, "UK Stocks". Moneyfarm deals in sterling, so a
// share keeps its sterling line (GBX/GBP) and drops its USD/EUR twin
// (PSHD, TFG...). A share the LSE quotes only in another currency is kept
// in that currency when the issuer is British, Irish or from the Crown
// Dependencies (ISIN GB, IE, JE, GG, IM): Compass Group and IHG now trade
// in USD only. Left out: other foreign shares with no sterling line
// (Jardine, BBVA, TotalEnergies, Rule 144A GDRs, the Diageo ADR...),
// International Order Book depositary receipts (segments IOBE / IOBU /
// IOBS) and the Professional Securities Market (foreign GDRs).
// Investment trusts, VCTs, REITs and preference shares are ordinary listed
// shares and stay. Bonds and mutual funds are not exchange-traded shares
// and are not read.
//
// The LSE book is shared with First Direct and Shareview Dealing (see
// lseBook.mjs next to this file): today's price-explorer lines, typed by
// the LSE Instrument List, without suspended, halted, never-traded lines
// and warrants.
//
//   node brokers/moneyfarm/moneyfarm_scraping.mjs

import { lseBook, EXCHANGE, AIM } from "./lseBook.mjs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ETF_LIST = "https://www.moneyfarm.com/uk/trading/etf/";
const SITEMAP = "https://www.moneyfarm.com/uk/sitemap.xml";
const STERLING = new Set(["GBX", "GBP"]);
const FOREIGN_SEGMENTS = new Set(["IOBE", "IOBU", "IOBS"]);
const HOME_ISIN = /^(GB|IE|JE|GG|IM)/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xml" }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      if (attempt >= 3) throw new Error(`${url}: ${error.message}`);
      await sleep(3000 * attempt);
    }
  }
}

const unescape = (value) =>
  value
    .replace(/\\\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\+"/g, '"')
    .replace(/\\+/g, "")
    .trim();

// The list page embeds every line in its React payload, with escaped quotes:
// {\"id\":\"ie000519m2u5-xlon-gbp\",\"name\":\"...\",\"issuer\":\"Allianz\",\"isin\":\"IE000519M2U5\",...,\"currency\":\"GBP\",...,\"exchange\":\"XLON\",...}
function parseEtfList(html) {
  const lines = new Map();
  const item = /\{\\+"id\\+":\\+"([a-z0-9]{12})-([a-z]{4})-([a-z]{3})\\+",\\+"name\\+":\\+"(.*?)\\+",\\+"issuer\\+":\\+"(.*?)\\+",\\+"isin\\+":\\+"([A-Z0-9]{12})\\+"/g;
  for (const match of html.matchAll(item)) {
    const [, idIsin, mic, currency, name, issuer, isin] = match;
    if (idIsin.toUpperCase() !== isin) continue;
    const id = `${idIsin}-${mic}-${currency}`;
    if (!lines.has(id)) lines.set(id, { id, isin, mic: mic.toUpperCase(), currency: currency.toUpperCase(), name: unescape(name), issuer: unescape(issuer) });
  }
  return [...lines.values()];
}

const { rows: book, report } = await lseBook();
console.error(`LSE book: ${book.length} lines (${report.instrumentListAsAt} instrument list, built ${report.built})`);

const html = await get(ETF_LIST);
const listed = parseEtfList(html);
await sleep(1000);
const sitemap = await get(SITEMAP);
const sitemapIds = new Set([...sitemap.matchAll(/\/uk\/trading\/etf\/([a-z0-9]{12}-[a-z]{4}-[a-z]{3})\//g)].map((match) => match[1]));
const missingFromPage = [...sitemapIds].filter((id) => !listed.some((line) => line.id === id));
console.error(`Moneyfarm ETF list: ${listed.length} lines on the page, ${sitemapIds.size} in the sitemap`);
if (listed.length < 400) throw new Error(`only ${listed.length} ETF lines parsed from ${ETF_LIST}`);
if (missingFromPage.length > 10) throw new Error(`${missingFromPage.length} sitemap ETFs not on the list page: ${missingFromPage.slice(0, 10).join(", ")}`);

const byIsin = new Map();
for (const row of book) {
  if (!byIsin.has(row.isin)) byIsin.set(row.isin, []);
  byIsin.get(row.isin).push(row);
}

const results = [];
const otherPlace = [];
const notOnLse = [];
for (const line of listed) {
  if (line.mic !== "XLON") {
    otherPlace.push(`${line.name} (${line.isin}, ${line.mic})`);
    continue;
  }
  const lines = (byIsin.get(line.isin) || []).filter((row) => (line.currency === "GBP" ? STERLING.has(row.currency) : row.currency === line.currency));
  if (!lines.length) {
    notOnLse.push(`${line.name} (${line.isin} ${line.currency})`);
    continue;
  }
  for (const row of lines) results.push({ ...row, raw: `${row.raw} | moneyfarm: ${line.id} ${line.name} (${line.issuer})` });
}
const etfRows = results.length;

const notSterling = [];
const sterlingIsins = new Set(book.filter((row) => row.type === "STOCK" && STERLING.has(row.currency)).map((row) => row.isin));
let foreignSegment = 0;
let psm = 0;
for (const row of book) {
  if (row.type !== "STOCK") continue;
  const parts = row.raw.split(" | ");
  const market = parts[4];
  const segment = parts[7];
  if (market === "PSM") { psm++; continue; }
  if (FOREIGN_SEGMENTS.has(segment)) { foreignSegment++; continue; }
  if (!STERLING.has(row.currency) && (sterlingIsins.has(row.isin) || !HOME_ISIN.test(row.isin))) { notSterling.push(`${row.ticker} ${row.currency}`); continue; }
  results.push(row);
}

const seen = new Set();
const unique = results.filter((row) => {
  const key = `${row.ticker}|${row.currency}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
unique.sort((left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name));

const count = (rows, field) => [...rows.reduce((map, row) => map.set(row[field], (map.get(row[field]) || 0) + 1), new Map())].map(([key, value]) => `${value} ${key}`).join(", ");
console.error(`${unique.length} rows (${count(unique, "type")}; ${count(unique, "exchange")})`);
console.error(`ETFs: ${etfRows} rows from ${listed.length - otherPlace.length} XLON list lines`);
if (otherPlace.length) console.error(`left out, another place: ${otherPlace.join("; ")}`);
if (notOnLse.length) console.error(`left out, no open LSE line of that ISIN and currency: ${notOnLse.join("; ")}`);
console.error(`shares left out: ${foreignSegment} International Order Book lines, ${psm} PSM lines, ${notSterling.length} non-sterling lines with a sterling twin or a foreign issuer (${notSterling.join(", ")})`);

const want = [
  ["GB00BP6MXD84", "Shell"],
  ["GB00B1YW4409", "3i Group"],
  ["GB00BHJYC057", "InterContinental Hotels Group (USD only)"],
  ["IE00B3XXRP09", "Vanguard S&P 500 UCITS ETF"],
];
for (const [isin, label] of want) {
  if (!unique.some((row) => row.isin === isin)) throw new Error(`${label} (${isin}) missing`);
}
if (!unique.some((row) => row.exchange === AIM) || !unique.some((row) => row.exchange === EXCHANGE)) throw new Error("AIM or Main Market missing");
if (etfRows < 400) throw new Error(`only ${etfRows} ETF rows matched on the LSE`);
if (notOnLse.length > 40) throw new Error(`${notOnLse.length} Moneyfarm ETFs with no LSE line`);

fs.writeFileSync(new URL("moneyfarm-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(unique)), null, 2));
