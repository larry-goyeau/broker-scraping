// What Racional sells as shares and ETFs, with no login. Racional Stocks
// is a US account in the client's name, at Vector Capital, with "+10.000
// acciones de EE.UU."; Chilean shares are bought in pesos on the Bolsa de
// Santiago and held by Vector Capital. The portfolios are funds, not lines.
//
// The sitemap lists one /assets/<ticker> page per instrument the app can
// buy. Each page opens with a schema.org FinancialProduct: the ticker, the
// name, a category (Acción or ETF) and the price currency. A peso line is
// Santiago, and its description says "se transa en pesos en la Bolsa de
// Santiago". A dollar line is a US listing. Only the head of each page is
// read, up to the end of that block. The site answers 429 past roughly a
// hundred pages a minute, so a full read takes close to two hours.
//
// The page names no US venue and no ISIN. Both come from
// ../../assets/stocks.csv and etfs.csv on NASDAQ, NYSE, AMEX and CBOE,
// matched on the ticker (BRK.B, NLY.PRJ -> NLY/PJ). AMEX in those lists is
// NYSE American and NYSE Arca together, so that row keeps "AMEX" with no
// MIC. A US ticker the lists do not have keeps exchange "US". A Santiago
// ticker is matched on BCS, SQM-B as SQM_B. One ISIN on that place is
// kept, several stay on `matches`. No OTC name is on the
// sitemap. Warrants (.WS, or a name that says warrant), rights (a name
// that says right, not an ADS's "right to receive") and SPAC units (.U,
// or a five-letter code ending U named "Units") are left out. Preferred
// shares and LP common units stay as shares; notes listed as shares are
// dropped by withoutObligations.
//
//   https://racional.cl/stocks
//   https://racional.cl/sitemap.xml
//   https://racional.cl/assets/aapl
//
//   node brokers/racional/racional_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const SITEMAP = "https://racional.cl/sitemap.xml";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const WORKERS = 3;
const FLOOR = { US: 9000, BCS: 50 };
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);

// List place -> the row's exchange and MIC.
const US_PLACE = {
  NASDAQ: ["NASDAQ", "XNAS"],
  NYSE: ["NYSE", "XNYS"],
  AMEX: ["AMEX", ""],
  CBOE: ["Cboe BZX", "BATS"],
};
const TYPE = { "Acción": "STOCK", ETF: "ETF" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decode(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ticker -> place -> Set(ISIN)
function loadLists() {
  const index = new Map();
  for (const file of [STOCKS, ETFS]) {
    const table = parseCsv(fs.readFileSync(file, "utf8"));
    if (table[0]?.slice(0, 3).join(",") !== "ticker,exchange,isin") throw new Error(`${file.pathname} header ${table[0]}`);
    for (const [ticker, place, isin] of table.slice(1)) {
      if (place !== "BCS" && !US_PLACE[place]) continue;
      if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
      const code = ticker.split(":").pop().toUpperCase();
      if (!index.has(code)) index.set(code, new Map());
      const book = index.get(code);
      if (!book.has(place)) book.set(place, new Set());
      book.get(place).add(isin);
    }
  }
  return index;
}

// Racional writes NLY.PRJ; the lists write NLY/PJ.
function listCode(ticker, place) {
  if (place === "BCS") return ticker.replace(/-/g, "_");
  const preferred = ticker.match(/^(.+)\.PR([A-Z]?)$/);
  if (preferred) return preferred[2] ? `${preferred[1]}/P${preferred[2]}` : `${preferred[1]}/P`;
  return ticker;
}

async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(1000 * 2 ** attempt);
  }
  throw new Error(last);
}

// Reads the page until the first JSON-LD block closes, then drops the rest.
async function head(url) {
  let last = "";
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal });
      if (response.status === 404) return null;
      // The site answers 429 when read too fast; wait as long as it asks.
      if (response.status === 429) {
        const wait = Math.min(300, Number(response.headers.get("retry-after")) || 30);
        last = `429 ${url}`;
        console.error(`429 on ${url}, waiting ${wait}s`);
        controller.abort();
        await sleep(wait * 1000);
        continue;
      }
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        const start = text.indexOf('<script type="application/ld+json">');
        if (start >= 0 && text.indexOf("</script>", start) > 0) break;
      }
      controller.abort();
      const match = text.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (!match) throw new Error(`no JSON-LD on ${url}`);
      return JSON.parse(match[1]);
    } catch (error) {
      last = String(error.message || error);
    } finally {
      clearTimeout(timer);
    }
    await sleep(Math.min(60_000, 1000 * 2 ** attempt));
  }
  throw new Error(last);
}

const sitemap = await getText(SITEMAP);
const pages = [...new Set([...sitemap.matchAll(/<loc>(https:\/\/racional\.cl\/assets\/[^<]+)<\/loc>/g)].map((m) => decode(m[1])))];
if (pages.length < FLOOR.US + FLOOR.BCS) throw new Error(`sitemap lists ${pages.length} asset pages`);
console.error(`${pages.length} asset pages on the sitemap`);

const products = [];
const missing = [];
let next = 0;
let doneCount = 0;
async function worker() {
  while (next < pages.length) {
    const url = pages[next++];
    const blocks = await head(url);
    doneCount += 1;
    if (doneCount % 500 === 0) console.error(`${doneCount} pages read`);
    await sleep(150);
    const product = Array.isArray(blocks) ? blocks.find((b) => b["@type"] === "FinancialProduct") : null;
    if (!product) { missing.push(url); continue; }
    products.push({ url, product });
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker));
if (missing.length > 20) throw new Error(`${missing.length} pages without a product, first ${missing[0]}`);

const lists = loadLists();
const rows = [];
const skipped = {};
const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; };
const tally = { one: 0, several: 0, none: 0 };

for (const { product } of products) {
  const ticker = String(product.tickerSymbol || "").trim().toUpperCase();
  const name = decode(product.name).replace(new RegExp(`\\s*\\(${ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)\\s*$`), "").trim();
  const category = String(product.category || "");
  const currency = String(product.offers?.priceCurrency || "").toUpperCase();
  const type = TYPE[category];
  if (!ticker) { skip("no ticker"); continue; }
  if (!type) { skip(`category ${category || "none"}`); continue; }
  const santiago = currency === "CLP" || /Bolsa de Santiago/i.test(product.description || "");
  if (!santiago && currency !== "USD") { skip(`currency ${currency || "none"}`); continue; }
  if (/\.(WS|WT|RT|R)$/.test(ticker) || /\bwarrants?\b|\brights?\b(?!\s+to\s+receive)/i.test(name)) { skip("warrant or right"); continue; }
  if (/\.U$/.test(ticker) || (/^[A-Z]{4}U$/.test(ticker) && /\bunits?\b/i.test(name))) { skip("unit"); continue; }

  const places = santiago ? ["BCS"] : Object.keys(US_PLACE);
  const book = new Map();
  for (const place of places) {
    const ids = lists.get(listCode(ticker, place))?.get(place);
    if (ids?.size) book.set(place, ids);
  }
  let exchange = santiago ? "BCS" : "US";
  let mic = santiago ? "XSGO" : "";
  if (!santiago && book.size === 1) [exchange, mic] = US_PLACE[[...book.keys()][0]];
  // A US ticker found on two places: NASDAQ/NYSE beat the AMEX-or-Arca bucket.
  if (!santiago && book.size > 1) {
    const pick = ["NASDAQ", "NYSE", "CBOE", "AMEX"].find((place) => book.has(place));
    [exchange, mic] = US_PLACE[pick];
    for (const place of [...book.keys()]) if (place !== pick) book.delete(place);
  }

  const row = { query: ticker, ticker, name: name || ticker, exchange };
  if (mic) row.mic = mic;
  row.currency = santiago ? "CLP" : "USD";
  row.type = type;
  row.isin = "";
  row.raw = [ticker, name, category, row.currency, exchange].filter(Boolean).join(" ");
  const found = new Set();
  for (const ids of book.values()) for (const id of ids) found.add(id);
  if (found.size === 1) { row.isin = [...found][0]; tally.one += 1; }
  else if (found.size > 1) { stampIsinMatches(row, book, listCode(ticker, [...book.keys()][0])); tally.several += 1; }
  else tally.none += 1;
  rows.push(row);
}

const unique = new Map();
for (const row of rows) unique.set(`${row.exchange}|${row.ticker}`, row);
const sorted = [...unique.values()].sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker));

const us = sorted.filter((row) => row.currency === "USD").length;
const cl = sorted.filter((row) => row.exchange === "BCS").length;
if (us < FLOOR.US) throw new Error(`only ${us} US lines`);
if (cl < FLOOR.BCS) throw new Error(`only ${cl} Santiago lines`);

fs.writeFileSync(new URL("racional-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(sorted)), null, 2));

const counts = {};
for (const row of sorted) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
console.error(`${sorted.length} rows. ISIN ${tally.one}, several ${tally.several}, none ${tally.none}.`);
console.error("skipped", skipped, missing.length ? `pages without a product: ${missing.join(" ")}` : "");
