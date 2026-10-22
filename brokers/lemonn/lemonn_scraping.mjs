// What Lemonn sells in shares and exchange-traded funds, with no login.
// Lemonn is the CoinSwitch share broker for the NSE and the BSE. The
// stock sitemap is the book: one page per order line, about 6,400 pages
// (a symbol with "&", such as M&M, has a short slug, /stocks/m-m).
// Each page carries the order line as data (symbol, ISIN, NSE series or
// BSE group, sector) with two flags that say whether the name is open on
// the NSE, on the BSE, or on both. A name on both is two rows with the
// same symbol, which is the BSE trading symbol too. The page is read in
// its short React form (RSC header), about 14 KB instead of 300 KB.
//
// A few ETF pages print no order line, because the page looks the name
// up by a word of its slug ("energy"). Those are read through the
// website search, which returns the same line and slug but no BSE flag,
// so they are written on their own exchange only. A page the search does
// not find either has no order line in the app and is not written
// (Hindustan Photo Films and Arunjyoti Bio Ventures in October 2026).
// Many ETFs listed on both exchanges are flagged NSE only; that is
// Lemonn's book and is kept as printed. A name can be in the app search
// before it gets a page and is then missed (Focus Lighting on the NSE in
// October 2026); against the NSE lists that was the only gap.
//
// Shares, REITs, InvITs, partly paid shares (E1, IN9 ISIN) and DVRs are
// STOCK. An ETF is a line in the ETF sector, or a fund ISIN (INF) on the
// NSE. A fund ISIN in a BSE group with no ETF sector is a closed-end
// scheme (Aditya Birla RIF, ICICI value series) and stays out. Names
// under surveillance, including those only open in call auction, stay
// in: Lemonn takes the order with a warning. Fees: delivery and
// intraday orders cost Rs 20 or 0.05% of order value, whichever is lower
// (open-delivery-trading-account page). Everything is in rupees.
//
// Lemonn keeps a page with the BSE flag on for scrips the BSE has
// suspended (Jet Airways, Future Retail, Gitanjali Gems, companies in
// liquidation or struck for non-compliance, the Tata Steel partly paid
// line after conversion): the order line has no suspension field and
// shows the last frozen price. So each BSE row is checked against the
// BSE's own scrip status list (bseStatus.mjs); a line whose ISIN is
// Suspended or Delisted there, and on no Active scrip, is not written.
// The NSE rows need no such check: every one was in the NSE list of
// securities available for trading in October 2026.
//
//   https://lemonn.co.in/stocks.xml
//   https://lemonn.co.in/stocks/<slug>-share-price-today
//   https://lemonn.co.in/api/search-stocks
//   https://lemonn.co.in/open-delivery-trading-account
//   https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?segment=Equity&status=Suspended
//
//   node brokers/lemonn/lemonn_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bseClosed } from "./bseStatus.mjs";
import fs from "node:fs";

const SITEMAP = "https://lemonn.co.in/stocks.xml";
const SEARCH = "https://lemonn.co.in/api/search-stocks";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const MIC = { NSE: "XNSE", BSE: "XBOM" };
const WORKERS = 6;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The site answers 429 when pages come too fast. It is waited out.
async function getText(url, init = {}) {
  let last = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, headers: { "User-Agent": UA, ...init.headers } });
      if (response.ok) return await response.text();
      last = `${url} answered ${response.status}`;
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

async function stockPages() {
  const xml = await getText(SITEMAP);
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1]);
  if (urls.length < 5000) throw new Error(`Lemonn stock sitemap lists ${urls.length} pages`);
  for (const url of urls) {
    if (!/^https:\/\/lemonn\.co\.in\/stocks\/[a-z0-9-]+$/.test(url)) throw new Error(`unexpected sitemap page ${url}`);
  }
  return [...new Set(urls)];
}

// The order line is a flat object, so the first {...} after the key is it.
function orderLine(text, url) {
  const match = text.match(/"initialStockDetails":(null|\{[^{}]*\})/);
  if (!match) throw new Error(`${url} has no stock details`);
  return JSON.parse(match[1]);
}

async function searchLine(url) {
  const slug = url.split("/").pop();
  const words = slug.replace(/-share-price-today$/, "").replace(/-/g, " ");
  const body = { request: { data: { searchString: words, isBseEnabled: "true", isBfoEnabled: "true", filters: { inst_name: "stocks" }, checkOptions: "true" } } };
  const answer = JSON.parse(await getText(SEARCH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const list = answer?.data?.response?.data?.stockInfoList;
  if (!Array.isArray(list)) throw new Error(`Lemonn search for ${slug} changed shape`);
  const hit = list.find((item) => item.slug === slug);
  if (!hit?.symObj) return null;
  const line = hit.symObj;
  return { ...line, nseFlag: line.exch === "NSE", bseFlag: line.exch === "BSE" };
}

async function readLines(urls) {
  const lines = [];
  const unread = [];
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const url = urls[next++];
      const line = orderLine(await getText(url, { headers: { RSC: "1" } }), url);
      if (line) lines.push({ url, line });
      else unread.push(url);
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));
  if (unread.length > 40) throw new Error(`${unread.length} Lemonn pages print no order line`);
  const lost = [];
  for (const url of unread) {
    const line = await searchLine(url);
    if (line) lines.push({ url, line, searched: true });
    else lost.push(url);
  }
  if (lost.length > 5) throw new Error(`Lemonn search misses ${lost.length} pages: ${lost.join(" ")}`);
  return { lines, searched: unread.length - lost.length, lost };
}

function typeOf(line, isin) {
  if (String(line.sectorName || "").trim().toUpperCase() === "ETF") return "ETF";
  if (isin.startsWith("INF")) return line.exch === "NSE" ? "ETF" : null;
  return "STOCK";
}

function rowsOf(lines) {
  const rows = [];
  const seen = new Set();
  let closedEnd = 0;
  for (const { url, line } of lines) {
    const ticker = String(line.symbol || "").trim().toUpperCase();
    const name = String(line.compName || "").replace(/\s+/g, " ").trim();
    const home = String(line.exch || "").trim().toUpperCase();
    const series = String(line.series || "").trim().toUpperCase();
    if (!ticker || !name) throw new Error(`unreadable line on ${url}`);
    if (line.assetClass !== "Cash" || line.instName !== "EQUITIES") throw new Error(`${ticker} is ${line.assetClass} ${line.instName}, not cash equity`);
    if (home !== "NSE" && home !== "BSE") throw new Error(`${ticker} is on ${home}`);
    if (typeof line.nseFlag !== "boolean" || typeof line.bseFlag !== "boolean") throw new Error(`${ticker} has no exchange flags`);
    if (!(home === "NSE" ? line.nseFlag : line.bseFlag)) throw new Error(`${ticker} is closed on its own exchange ${home}`);
    const isin = /^IN[A-Z0-9]{10}$/.test(String(line.isin || "").trim().toUpperCase()) ? line.isin.trim().toUpperCase() : "";
    const type = typeOf(line, isin);
    if (!type) {
      closedEnd += 1;
      continue;
    }
    const places = ["NSE", "BSE"].filter((place) => (place === "NSE" ? line.nseFlag : line.bseFlag));
    for (const exchange of places) {
      const key = `${exchange}|${isin || ticker}`;
      if (seen.has(key)) throw new Error(`repeated ${key}`);
      seen.add(key);
      const row = { query: ticker, ticker, name, exchange, currency: "INR", type };
      if (isin) row.isin = isin;
      row.mic = MIC[exchange];
      row.raw = [ticker, name, exchange, exchange === home ? series : "", isin, type].filter(Boolean).join(" ");
      rows.push(row);
    }
  }
  return { rows, closedEnd };
}

// The BSE list is read first, so a change there stops the run before the
// long page crawl.
const bse = await bseClosed();
const urls = await stockPages();
const { lines, searched, lost } = await readLines(urls);
const { rows: allRows, closedEnd } = rowsOf(lines);
const dropped = { suspended: [], delisted: [] };
const rows = allRows.filter((row) => {
  if (row.exchange !== "BSE") return true;
  const status = bse.statusOf(row.isin, row.ticker);
  if (!status) return true;
  dropped[status].push(row.ticker);
  return false;
});
// About 440 BSE rows were suspended in October 2026; many more means the
// list or the ISINs went wrong, not that the BSE closed a third of its book.
if (dropped.suspended.length + dropped.delisted.length > 1200) throw new Error(`${dropped.suspended.length} suspended and ${dropped.delisted.length} delisted BSE rows`);
if (rows.length < 8000) throw new Error(`only ${rows.length} Lemonn rows`);
rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("lemonn-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const count = (place, type) => rows.filter((row) => row.exchange === place && row.type === type).length;
console.error(
  `${rows.length} listings from ${urls.length} pages (NSE ${count("NSE", "STOCK")} STOCK ${count("NSE", "ETF")} ETF, BSE ${count("BSE", "STOCK")} STOCK ${count("BSE", "ETF")} ETF; ${searched} read through search, ${lost.length} unread, ${closedEnd} closed-end funds left out; BSE status list ${bse.counts.active} active ${bse.counts.suspended} suspended ${bse.counts.delisted} delisted: ${dropped.suspended.length} suspended and ${dropped.delisted.length} delisted BSE rows dropped)`,
);
