// What Webull Securities (Australia) Pty Ltd (webull.com.au, AFSL 536980)
// sells to its Australian clients: US-listed shares and ETFs, ASX and Cboe
// Australia shares and ETFs, Hong Kong shares and ETFs, and China Connect
// A-shares.
//
// The US, Hong Kong and China Connect lines come from the frozen Webull
// catalogue (../webull/webull-base.json, read from Webull Singapore's
// OpenAPI). The Australian lines come from Webull's own public screener
// (quotes-gw.webullfintech.com, app "au", region 18), which serves shares
// only, and from the exchanges' own ETF lists.
//
// Rules, each checked on webull.com.au (pages read 2026-10-21):
//
//   Markets. "Trade CHESS-Sponsored shares, ETFs, and warrants on ASX and
//   CBOE." "Trade Hong Kong Stocks and China Stock Connect with $0 brokerage
//   for all shares and ETFs." "ASX and Global ETFs include listed
//   exchange-traded funds in Australia, US, Hong Kong and China Connect
//   available on the Webull platform."
//     https://www.webull.com.au/
//   US: "Currently US-listed stocks, ETFs, and Options can be traded on the
//   Webull App."
//     https://www.webull.com.au/help/faq/1343-What-type-of-investment-products-can-be-traded-on-the-US-market
//
//   No OTC: "We can only support liquidation of OTC stocks if you have
//   positions of OTC symbols". OTC rows stay out (sell-only).
//     https://www.webull.com.au/help/faq/1460-Does-Webull-support-OTC-trading
//
//   No US warrants: "We currently do not support the trading of US
//   Warrants. [...] we do not support new purchases." The base already
//   leaves Webull's WARRANT, UNITS and RIGHT lines out; a name that still
//   says warrant is dropped here.
//     https://www.webull.com.au/help/faq/2036-Can-I-trade-US-Warrants
//
//   ASX and Cboe Australia, one row per place: Webull Securities "is a
//   Market Participant of ASX Limited and Cboe Australia Pty Limited", and
//   an order "is sent through our advanced smart order routing technology
//   to the relevant exchanges, such as ASX or CBOE, in search of the best
//   available price." So an ASX-listed title that Cboe Australia trades
//   (the Cboe tradable securities list) gets an ASX row and a Cboe
//   Australia row; a Cboe-listed ETF (the Cboe listed securities list,
//   record F) gets a Cboe Australia row.
//     https://www.webull.com.au/help/faq/1439-Why-is-my-order-not-being-filled
//     https://www.tmxaustralia.com/equities/support/reference-data
//       (PROD_CXATSL_<date>.txt tradable list, PROD_CXALSL_<date>.txt listed list)
//   ASX shares: the Webull screener, common stock (secType 61) and listed
//   trusts / stapled securities (63) with listStatus 1. Options (66),
//   rights (67) and hybrids, convertible notes and preference lines (64)
//   stay out. Warrants are on Webull AU but are not in the catalogues.
//   ASX ETFs: the ASX investment-products monthly report, sheet "Spotlight
//   ETP List", types ETF, Active and Complex (as ETF) and SP (physical
//   metal products, as ETC); the Index lines are benchmarks.
//     https://www.asx.com.au/issuers/investment-products/asx-investment-products-monthly-report
//   ISIN: the Cboe tradable list, else assets/stocks.csv / etfs.csv.
//
//   China Connect: "ChiNEXT and STAR symbols are currently not available
//   for trading on Webull." Shanghai 688/689 and Shenzhen 300/301/302 stay
//   out (the base already had 688, 300 and 301 out). A-shares trade in CNH
//   only: "Renminbi (CNH) is the only supported currency for trading
//   A-shares on Webull."
//     https://www.webull.com.au/help/faq/1547-What-are-the-trading-rules-for-A-shares
//     https://www.webull.com.au/help/faq/1548-What-is-the-supported-currency-to-trade-A-shares
//
//   Deposit currencies: AUD and USD. AUD: "Choose "AUD" as the deposit
//   currency" (PayTo). USD: "Choose "USD" as the deposit currency [...]
//   Webull will automatically withdraw the equivalent AUD from your linked
//   Australian bank account, convert it to USD, and deposit the USD directly
//   into your trading account". CNH is not one: "We do not accept funding or
//   withdrawal of Renminbi (CNH) on Webull." HKD is held, not deposited:
//   "You can convert your Australian Dollars (AUD) to United States Dollars
//   (USD), Hong Kong Dollars (HKD) or Renminbi (CNH)". No webull.com.au page
//   says HKD can be deposited, so it is left out.
//     https://www.webull.com.au/help/faq/1553-How-do-I-AUD-deposit-using-PayTo
//     https://www.webull.com.au/help/faq/1987-How-do-I-deposit-USD-using-PayTo
//     https://www.webull.com.au/help/faq/1570-Can-I-trade-in-the-US-HK-or-CN-markets-with-Australian-Dollars
//   Hong Kong currency lines: a title quoted in several currencies keeps
//   its HKD line (the market's own currency) and its USD line (a deposit
//   currency); a CNH counter of a title that also has an HKD line stays
//   out. A title quoted only in CNH or only in USD keeps that line.
//
//   Crypto stays out: it is Webull Pay Australia's service, "not provided
//   by Webull Securities and not provided under its AFSL", and the base's
//   coins are another entity's list.
//
//   node brokers/webullau/webullau_scraping.mjs

import fs from "node:fs";
import { inflateRawSync } from "node:zlib";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { addDepositCurrencies, loadCurrencyEvidence } from "../N26/N26_scraping.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";

const DEPOSIT = new Set(["AUD", "USD"]);
const US_PLACES = new Set(["NYSE", "NASDAQ", "AMEX", "CBOE"]);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SCREENER = "https://quotes-gw.webullfintech.com/api/wlas/screener/ng/query";
const WEBULL_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": UA,
  app: "au",
  appid: "wb_web_au",
  "app-group": "broker",
  platform: "web",
  "device-type": "Web",
  hl: "en",
  os: "web",
  ver: "1.0.0",
};
const CBOE_REFERENCE = "https://www.tmxaustralia.com/equities/support/reference-data";
const ASX_PRODUCTS = "https://www.asx.com.au/issuers/investment-products/asx-investment-products-monthly-report.html";

// Webull secType of an ASX line: 61 common stock, 63 listed trust or
// stapled security. 64 (hybrids, convertible notes, preference lines),
// 66 (options) and 67 (rights) stay out.
const ASX_SHARE_TYPES = new Set([61, 63]);
const ASX_ETP_TYPES = { ETF: "ETF", Active: "ETF", Complex: "ETF", SP: "ETC" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function fetchWith(url, options = {}, kind = "text", tries = 5) {
  let last = "";
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "User-Agent": UA, ...(options.headers || {}) },
        signal: AbortSignal.timeout(90_000),
      });
      if (response.ok) {
        if (kind === "bytes") return Buffer.from(await response.arrayBuffer());
        if (kind === "json") return await response.json();
        return await response.text();
      }
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = String(error?.message || error);
    }
    // The Webull gateway and webull.com.au answer 403 / 429 for a while
    // after a burst, so the wait grows.
    if (attempt < tries - 1) await sleep(5000 * 2 ** attempt);
  }
  throw new Error(last);
}

// ---------- Webull's ASX screener ----------

async function screen(low, high) {
  const body = {
    fetch: 500,
    rules: {
      "wlas.screener.rule.region": "securities.region.name.18",
      "wlas.screener.rule.price": `gte=${low}&lte=${high}`,
    },
    sort: { rule: "wlas.screener.rule.price", desc: true },
    attach: { hkexPrivilege: true },
  };
  await sleep(1500);
  const data = await fetchWith(SCREENER, { method: "POST", headers: WEBULL_HEADERS, body: JSON.stringify(body) }, "json", 6);
  if (!Number.isInteger(data?.total)) throw new Error(`the screener answered ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

// At most 500 lines a call, so the price range is halved until each band
// fits. A full read is saved to webullau-asx-screener.json; when the
// gateway keeps refusing, that saved read is used and the run says so.
const SCREENER_CACHE = new URL("webullau-asx-screener.json", import.meta.url);

async function asxScreener() {
  try {
    const lines = await asxScreenerLive();
    const kept = lines.map(({ tickerId, symbol, name, regionId, exchangeCode, currencyCode, secType2, listStatus }) => ({ tickerId, symbol, name, regionId, exchangeCode, currencyCode, secType2, listStatus }));
    fs.writeFileSync(SCREENER_CACHE, JSON.stringify({ read: new Date().toISOString(), lines: kept }, null, 1));
    return lines;
  } catch (error) {
    if (!fs.existsSync(SCREENER_CACHE)) throw error;
    const saved = JSON.parse(fs.readFileSync(SCREENER_CACHE, "utf8"));
    console.error(`ASX screener unavailable (${error.message}); using the read of ${saved.read}: ${saved.lines.length} lines`);
    return saved.lines;
  }
}

async function asxScreenerLive() {
  const found = new Map();
  const walk = async (low, high) => {
    const data = await screen(low, high);
    if (data.total > 500 && high - low > 1e-6) {
      const middle = Number(((low + high) / 2).toFixed(6));
      await walk(low, middle);
      await walk(middle, high);
      return;
    }
    for (const item of data.items || []) found.set(item.ticker.tickerId, item.ticker);
  };
  const announced = (await screen(0, 1_000_000)).total;
  await walk(0, 1_000_000);
  const lines = [...found.values()];
  if (lines.length < announced * 0.99) throw new Error(`the screener announced ${announced} and returned ${lines.length}`);
  console.error(`ASX screener: ${lines.length} of ${announced} lines`);
  return lines;
}

// ---------- Cboe Australia reference files ----------

function pipeTable(text, record) {
  const lines = text.split(/\r?\n/);
  const header = lines.find((line) => line.startsWith("H|"))?.split("|").slice(1);
  if (!header) throw new Error("a Cboe file has no header");
  const at = Object.fromEntries(header.map((name, index) => [name, index]));
  return lines
    .filter((line) => record.test(line))
    .map((line) => {
      const cells = line.split("|").slice(1);
      return Object.fromEntries(Object.entries(at).map(([name, index]) => [name, normalize(cells[index])]));
    });
}

async function cboeLists() {
  const page = await fetchWith(CBOE_REFERENCE);
  const link = (code) => {
    const found = [...new Set(page.match(new RegExp(`https://cdn\\.cboe\\.com/data/au/equities/${code.toLowerCase()}/cxa/PROD_${code}_[0-9_]+\\.txt`, "g")) || [])];
    if (found.length !== 1) throw new Error(`the Cboe reference page links ${found.length} ${code} files`);
    return found[0];
  };
  const tradable = pipeTable(await fetchWith(link("CXATSL")), /^D\|/);
  const listed = pipeTable(await fetchWith(link("CXALSL")), /^F\|/);
  if (tradable.length < 2000) throw new Error(`the Cboe tradable list has ${tradable.length} lines`);
  if (listed.length < 10) throw new Error(`the Cboe listed list has ${listed.length} funds`);
  return { tradable, listed };
}

// ---------- ASX investment-products report (xlsx) ----------

function zipFiles(bytes) {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("not a zip archive");
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const files = new Map();
  for (let index = 0; index < count; index += 1) {
    const method = bytes.readUInt16LE(offset + 10);
    const size = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const stored = bytes.subarray(start, start + size);
    files.set(name, method === 0 ? stored : inflateRawSync(stored));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function unescapeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

function columnIndex(ref) {
  let n = 0;
  for (const char of ref) n = n * 26 + char.charCodeAt(0) - 64;
  return n - 1;
}

function sheetRows(bytes, sheetName) {
  const files = zipFiles(bytes);
  const shared = [];
  const sharedXml = files.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  for (const item of sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    shared.push([...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((node) => node[1]).join(""));
  }
  const workbook = files.get("xl/workbook.xml")?.toString("utf8") || "";
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") || "";
  const entry = [...workbook.matchAll(/<sheet\b[^>]*>/g)].find((node) => unescapeXml(node[0].match(/\bname="([^"]*)"/)?.[1] || "") === sheetName);
  const id = entry?.[0].match(/\br:id="([^"]+)"/)?.[1];
  const rel = id && [...rels.matchAll(/<Relationship\b[^>]*>/g)].find((node) => node[0].includes(`Id="${id}"`));
  const target = rel?.[0].match(/\bTarget="([^"]+)"/)?.[1];
  if (!target) throw new Error(`the workbook has no sheet "${sheetName}"`);
  const sheet = files.get(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  const rows = [];
  for (const row of sheet.toString("utf8").matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const values = [];
    for (const cell of row[1].matchAll(/<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      if (cell[3] === undefined) continue;
      const ref = cell[2].match(/\br="([A-Z]+)\d+"/)?.[1] || "A";
      const type = cell[2].match(/\bt="([^"]+)"/)?.[1] || "";
      const raw = cell[3].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const inline = [...cell[3].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((node) => node[1]).join("");
      values[columnIndex(ref)] = unescapeXml(type === "s" ? shared[Number(raw)] ?? "" : type === "inlineStr" ? inline : raw);
    }
    rows.push(values);
  }
  return rows;
}

const MONTH = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

async function asxProducts() {
  const page = await fetchWith(ASX_PRODUCTS);
  let best = null;
  for (const match of page.matchAll(/\/content\/dam\/asx\/issuers\/asx-investment-products-reports\/(\d{4})\/excel\/asx-investment-products-([a-z]+)-\d{4}-abs\.xlsx/g)) {
    const month = MONTH[match[2].slice(0, 3)];
    if (!month) continue;
    const rank = Number(match[1]) * 12 + month;
    if (!best || rank > best.rank) best = { rank, url: `https://www.asx.com.au${match[0]}` };
  }
  if (!best) throw new Error("the ASX investment-products page links no workbook");
  const table = sheetRows(await fetchWith(best.url, {}, "bytes"), "Spotlight ETP List");
  const header = table.findIndex((row) => /^ASX\s*Code$/i.test(normalize(row[1])) && normalize(row[2]) === "Type");
  if (header < 0) throw new Error("the ASX ETP list has no header");
  const products = new Map();
  for (const row of table.slice(header + 1)) {
    const code = normalize(row[1]).toUpperCase();
    const type = ASX_ETP_TYPES[normalize(row[2])];
    if (/^[A-Z0-9]{3,6}$/.test(code) && type && !products.has(code)) {
      products.set(code, { name: normalize(row[4]) || code, type });
    }
  }
  if (products.size < 400) throw new Error(`the ASX ETP list has ${products.size} codes`);
  console.error(`ASX ETP list: ${products.size} products (${best.url.split("/").pop()})`);
  return products;
}

// ---------- ISINs kept in the repository ----------

function csvIsins(file, exchange) {
  const map = new Map();
  const target = new URL(file, import.meta.url);
  if (!fs.existsSync(target)) return map;
  for (const line of fs.readFileSync(target, "utf8").split(/\r?\n/)) {
    const cells = line.split(",");
    if (normalize(cells[1]).toUpperCase() !== exchange) continue;
    const code = normalize(cells[0]).split(":").pop().toUpperCase();
    const isin = normalize(cells[2]).toUpperCase();
    if (code && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) && !map.has(code)) map.set(code, isin);
  }
  return map;
}

function rowOf({ ticker, name, exchange, currency, type, isin, source }) {
  return {
    query: ticker,
    ticker,
    name: name || ticker,
    exchange,
    currency,
    type,
    raw: [ticker, name, exchange, currency, source].filter(Boolean).join(" "),
    isin: isin || "",
  };
}

// ---------- build ----------

const base = JSON.parse(fs.readFileSync(new URL("../webull/webull-base.json", import.meta.url), "utf8"));
const dropped = new Map();
const drop = (reason) => dropped.set(reason, (dropped.get(reason) || 0) + 1);

const rows = [];

// US: the listed rows, no OTC, no warrants.
for (const row of base) {
  if (row.exchange === "OTC") {
    drop("US OTC (liquidation only)");
    continue;
  }
  if (!US_PLACES.has(row.exchange)) continue;
  if (/\bwarrants?\b/i.test(row.name) || /\bwts?\b/i.test(row.name)) {
    drop("US warrant");
    continue;
  }
  rows.push({ ...row });
}

// China Connect: no STAR (688, 689), no ChiNext (300, 301, 302).
for (const row of base) {
  if (row.exchange !== "Shanghai" && row.exchange !== "Shenzhen") continue;
  const code = String(row.ticker).padStart(6, "0");
  if ((row.exchange === "Shanghai" && /^68[89]/.test(code)) || (row.exchange === "Shenzhen" && /^30[0-2]/.test(code))) {
    drop("China Connect STAR / ChiNext");
    continue;
  }
  rows.push({ ...row });
}

// Hong Kong: HKD line, plus the USD line where there is one; a CNH counter
// only when the title has no HKD line.
const hkGroups = new Map();
for (const row of base) {
  if (row.exchange !== "HKEX") continue;
  const key = row.isin || `ticker:${row.ticker}`;
  if (!hkGroups.has(key)) hkGroups.set(key, []);
  hkGroups.get(key).push(row);
}
// The base also carries a counter's code in another currency (82800 in
// HKD next to 02800); one row per currency is kept, under the HKD
// counter's code where there is one.
const counterRank = (row) => (/^8\d{4}$/.test(row.ticker) ? 1 : 0) * 10 + String(row.ticker).length / 10;
for (const group of hkGroups.values()) {
  const currencies = new Set(group.map((row) => row.currency));
  const kept = new Map();
  for (const row of group) {
    if (currencies.size > 1 && row.currency !== "HKD" && !DEPOSIT.has(row.currency)) {
      drop(`HKEX ${row.currency} counter of a title with an HKD line`);
      continue;
    }
    const other = kept.get(row.currency);
    if (other) drop("HKEX second code for the same title and currency");
    if (!other || counterRank(row) < counterRank(other)) kept.set(row.currency, row);
  }
  for (const row of kept.values()) rows.push({ ...row });
}

if (base.some((row) => row.exchange === "CRYPTO")) drop("crypto (Webull Pay Australia, another entity)");

// Australia.
const [screener, cboe, etps] = [await asxScreener(), await cboeLists(), await asxProducts()];
const cboeTradable = new Map(cboe.tradable.filter((line) => line.ALLOWONMKT === "1").map((line) => [line.CXACODE, line]));
const stockIsins = csvIsins("../../assets/stocks.csv", "ASX");
const etfIsins = csvIsins("../../assets/etfs.csv", "ASX");
const isinOf = (code) => {
  const isin = cboeTradable.get(code)?.ISIN || "";
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : stockIsins.get(code) || etfIsins.get(code) || "";
};

const asxSeen = new Set();
const addAustralian = (ticker, name, type, source) => {
  if (asxSeen.has(ticker)) return;
  asxSeen.add(ticker);
  const isin = isinOf(ticker);
  rows.push(rowOf({ ticker, name, exchange: "ASX", currency: "AUD", type, isin, source }));
  const onCboe = cboeTradable.get(ticker);
  if (onCboe && onCboe.MIC === "XASX" && onCboe.CURR === "AUD") {
    rows.push(rowOf({ ticker, name, exchange: "Cboe Australia", currency: "AUD", type, isin, source: `${source}, Cboe tradable list` }));
  }
};

for (const line of screener) {
  if (line.regionId !== 18 || line.exchangeCode !== "XASX" || line.currencyCode !== "AUD") {
    drop("ASX screener line off the ASX");
    continue;
  }
  if (!ASX_SHARE_TYPES.has(line.secType2)) {
    drop(`ASX screener secType ${line.secType2}`);
    continue;
  }
  if (line.listStatus !== 1) {
    drop("ASX screener line not listed (listStatus)");
    continue;
  }
  addAustralian(normalize(line.symbol).toUpperCase(), normalize(line.name), "STOCK", "Webull AU screener");
}

for (const [code, product] of etps) addAustralian(code, product.name, product.type, "ASX ETP list");

// Cboe-listed funds (record F of the listed list, listed on Cboe).
for (const fund of cboe.listed) {
  if (fund.MIC !== "CHIA" || fund.CURR !== "AUD") continue;
  const isin = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(fund.ISIN) ? fund.ISIN : "";
  rows.push(rowOf({ ticker: fund.CXACODE.toUpperCase(), name: fund.DESC, exchange: "Cboe Australia", currency: "AUD", type: "ETF", isin, source: "Cboe listed list" }));
}

// ---------- currencies, as the Webull scraper does ----------

function baseCurrency(exchange) {
  if (exchange === "HKEX") return "HKD";
  if (exchange === "ASX" || exchange === "Cboe Australia") return "AUD";
  if (exchange === "Shanghai" || exchange === "Shenzhen") return "CNH";
  return "USD";
}

function keepDistinctCurrencies(list) {
  const groups = new Map();
  for (const row of list) {
    const key = `${row.exchange}|${row.ticker}|${String(row.isin || "").toUpperCase()}|${row.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const out = [];
  for (const group of groups.values()) {
    const first = group.find((row) => row.currency === baseCurrency(row.exchange)) || group[0];
    const mic = resolveVenue({ exchange: first.exchange, currency: first.currency, isin: first.isin }).venue?.mic;
    const keptLeaves = [];
    for (const row of [first, ...group.filter((item) => item !== first)]) {
      const leaf = mic ? spreads[String(row.isin || "").toUpperCase()]?.[mic]?.[row.currency] : null;
      if (row !== first && leaf?.url && keptLeaves.includes(leaf.url)) continue;
      if (leaf?.url) keptLeaves.push(leaf.url);
      out.push(row);
    }
  }
  return out;
}

const evidence = loadCurrencyEvidence("webullau");
const expanded = keepDistinctCurrencies(addDepositCurrencies(rows, evidence.listed, evidence.books, DEPOSIT));

const unresolved = new Set();
for (const row of expanded) {
  if (!resolveVenue({ exchange: row.exchange, currency: row.currency, isin: row.isin }).venue?.mic) {
    unresolved.add(`${row.exchange}|${row.currency}`);
  }
}
if (unresolved.size) throw new Error(`places that do not resolve: ${[...unresolved].join(", ")}`);

expanded.sort(
  (left, right) =>
    String(left.type).localeCompare(right.type) ||
    String(left.exchange).localeCompare(right.exchange) ||
    String(left.ticker).localeCompare(right.ticker) ||
    String(left.currency).localeCompare(right.currency)
);

const output = stampRows(withoutObligations(expanded));
fs.writeFileSync(new URL("webullau-parsed.json", import.meta.url), JSON.stringify(output, null, 2));

const counts = {};
for (const row of output) {
  const key = `${row.exchange} ${row.type} ${row.currency}`;
  counts[key] = (counts[key] || 0) + 1;
}
console.error(`${output.length} rows, ${output.filter((row) => row.isin).length} with ISIN`);
console.table(counts);
console.error("left out", Object.fromEntries(dropped));
