// Webull Securities (Singapore) Pte. Ltd. — webull.com.sg
//
// Sources: the frozen Webull OpenAPI rows (brokers/webull/webull-base.json,
// read from Webull Singapore's own OpenAPI), Webull's public quote host for
// the SG app (quotes-gw.webullfintech.com, `app: sg`), and SGX's public
// securities list and ISIN file. Checked on webull.com.sg on 2026-10-21.
//
// US market
//   https://www.webull.com.sg/help/faq/1069-What-type-of-investment-products-can-be-traded-on-the-US-market
//   "Currently, US-listed stocks, ETFs, and Options can be traded on the
//   Webull App. All US warrants are not tradable; only liquidation is allowed."
//   → US warrants are dropped (Webull secType 66). The base already had none.
//
//   https://www.webull.com.sg/help/faq/1333-Does-Webull-support-trading-of-US-Publicly-Traded-Partnership-PTP-securities
//   "Starting 1st December 2025, Webull will no longer support the trading or
//   holding of US PTP securities."
//   → a US/OTC row is dropped when Webull's own `isPTP` flag is 1 (US stock
//   screener, then the ticker search for the rest, both with `app: sg`).
//
//   https://www.webull.com.sg/help/faq/1443-How-can-I-trade-OTC-stocks
//   "To enable trading in US OTC stocks, you must agree and sign the OTC
//   Trading Disclosure." FAQ 1442: "Only limit day orders are supported."
//   → OTC is bought online in the app: the base OTC rows stay.
//   FAQ 1446 bars opening a position under US$0.01. That moves with the
//   price every day, so it is not applied here.
//
// Crypto
//   webull.com.sg sells no crypto: the product menu is US Stocks, US Options,
//   SG Stocks, A-Shares, HK Shares, Futures, and FAQ 1069 above lists the US
//   products without it. → the base crypto rows are dropped.
//
// Hong Kong
//   https://www.webull.com.sg/help/faq/1063-Can-I-trade-in-the-US-or-HK-markets-with-Singapore-Dollars
//   "Overseas securities such as US or HK stocks must be settled in their
//   domestic currencies. You can convert your Singapore Dollars (SGD) to
//   United States Dollars (USD) or Hong Kong Dollars (HKD)". → base HKEX rows.
//
// China Connect
//   https://www.webull.com.sg/help/faq/1354-What-is-the-supported-currency-to-trade-A-shares
//   "Renminbi (CNH) is the only supported currency to trade A-shares on Webull."
//   https://www.webull.com.sg/help/faq/1353-What-are-the-trading-rules-for-A-shares
//   "ChiNEXT and STAR symbols are currently not available for trading on Webull."
//   → base Shanghai/Shenzhen rows (CNH), which already leave out 688/300/301.
//
// Singapore (SGX)
//   https://www.webull.com.sg/help/faq/1388-What-type-of-investment-products-can-be-traded-on-the-SG-Market
//   "Currently, Stocks, REITs, ETFs, Warrants, Leveraged and Inverse Products
//   (L&I), and Daily Leveraged Certificates (DLCs) can be traded on the Webull App."
//   https://www.webull.com.sg/sgx — "Trade stocks listed on SGX plus REITs, DLC and ETFs."
//   → Webull's SGX tickers come from the SG ranking (regionId=13, stocks
//   quoted that day only) plus a walk of the SGX ticker-id block through the
//   batch quote call, which also returns REITs, business trusts, SDRs, ETFs
//   and L&I products the ranking does not. A ticker is kept when SGX's own
//   securities list (api.sgx.com/securities/v1.1) still carries the code as a
//   stock, REIT, business trust, SDR, ETF, L&I product or fund. The ISIN is
//   the one in SGX's ISIN file (links.sgx.com/1.0.0/isin/1/<date>), the
//   currency the one SGX quotes the counter in. Warrants, DLCs and structured
//   warrants are not catalogue types and stay out.
//
// Deposit currencies
//   https://www.webull.com.sg/blog/1 — "Telegraphic Transfer (TT) – SGD, USD, HKD"
//   (eDDA, FAST and PayNow are SGD only: FAQ 1057, 1517). CNH cannot be
//   deposited (FAQ 1354). → SGD, USD, HKD.
//
// Flags: `--fresh` is accepted for symmetry and ignored (every run rebuilds).
import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { addDepositCurrencies, loadCurrencyEvidence } from "../N26/N26_scraping.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";

const DEPOSIT = new Set(["SGD", "USD", "HKD"]);
const US_PLACES = new Set(["NYSE", "NASDAQ", "AMEX", "CBOE", "OTC"]);

const HEADERS = {
  app: "sg",
  appid: "wb_web_sg",
  "app-group": "broker",
  platform: "web",
  "device-type": "Web",
  hl: "en",
  os: "web",
  ver: "1.0.0",
};
const QUOTES = "https://quotes-gw.webullfintech.com";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, options = {}, tries = 5) {
  let last;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(45000) });
      if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      last = error;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw new Error(`${url}: ${last}`);
}

async function fetchText(url, tries = 4) {
  let last;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", Origin: "https://www.sgx.com", Referer: "https://www.sgx.com/" },
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      last = error;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error(`${url}: ${last}`);
}

async function pool(items, width, work) {
  let next = 0;
  const workers = Array.from({ length: width }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await work(items[index]);
    }
  });
  await Promise.all(workers);
}

const symbolKey = (value) => String(value || "").toUpperCase().replace(/[\s/-]+/g, ".").trim();

function toIsin(value) {
  const match = String(value || "").toUpperCase().match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function catalogueIsins(file) {
  const set = new Set();
  const url = new URL(file, import.meta.url);
  if (!fs.existsSync(url)) return set;
  for (const line of fs.readFileSync(url, "utf8").split(/\r?\n/)) {
    const isin = toIsin(line.split(",")[2]);
    if (isin) set.add(isin);
  }
  return set;
}

const stockIsins = catalogueIsins("../../assets/stocks.csv");
const etfIsins = catalogueIsins("../../assets/etfs.csv");

const baseRows = JSON.parse(fs.readFileSync(new URL("../webull/webull-base.json", import.meta.url), "utf8"));
const rawCurrency = (row) => String(row.raw || "").trim().split(/\s+/).pop().toUpperCase();

const dropped = new Map();
const drop = (reason) => dropped.set(reason, (dropped.get(reason) || 0) + 1);

// The base rows the OpenAPI gave, without the extra currency lines the old
// all-entity run added for deposit currencies Webull SG does not take. Those
// lines are worked out again below with this entity's list.
let rows = [];
for (const row of baseRows) {
  if (row.type === "CRYPTO") {
    drop("crypto (not sold by Webull SG)");
    continue;
  }
  if (row.currency !== rawCurrency(row)) continue;
  rows.push({ ...row });
}

// ---- US: PTP and warrants --------------------------------------------------

async function screenerBand(low, high, found, depth = 0) {
  const body = {
    fetch: 500,
    rules: {
      "wlas.screener.rule.region": "securities.region.name.6",
      "wlas.screener.rule.price": `gte=${low}&lte=${high}`,
    },
    sort: { rule: "wlas.screener.rule.price", desc: true },
    attach: { hkexPrivilege: true },
  };
  const answer = await fetchJson(`${QUOTES}/api/wlas/screener/ng/query`, {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const items = answer.items || [];
  if (answer.total > items.length && high - low > 0.0001 && depth < 30) {
    const mid = Number(((low + high) / 2).toFixed(4));
    await screenerBand(low, mid, found, depth + 1);
    await screenerBand(Number((mid + 0.0001).toFixed(4)), high, found, depth + 1);
    return;
  }
  if (answer.total > items.length) console.error(`  screener band ${low}-${high} overflows`);
  for (const item of items) {
    const ticker = item.ticker || {};
    for (const symbol of [ticker.symbol, ticker.disSymbol]) {
      if (symbol) found.set(symbolKey(symbol), ticker);
    }
  }
}

const usFlags = new Map();
console.error("US screener (isPTP, secType)…");
await screenerBand(0, 2000000, usFlags);
console.error(`  ${usFlags.size} symbols`);

const unknownUs = [...new Set(rows.filter((row) => US_PLACES.has(row.exchange) && !usFlags.has(row.ticker)).map((row) => row.ticker))];
console.error(`US ticker search for ${unknownUs.length} symbols the screener does not carry…`);
let searchMisses = 0;
await pool(unknownUs, 6, async (ticker) => {
  const keyword = encodeURIComponent(ticker.replace(/\./g, " "));
  try {
    const answer = await fetchJson(`${QUOTES}/api/search/pc/tickers?keyword=${keyword}&pageIndex=1&pageSize=10`, { headers: HEADERS });
    const hits = (answer.data || []).filter(
      (hit) => hit.regionId === 6 && [symbolKey(hit.symbol), symbolKey(hit.disSymbol)].includes(ticker)
    );
    const live = hits.find((hit) => hit.listStatus === 1) || hits[0];
    if (live) usFlags.set(ticker, live);
    else searchMisses += 1;
  } catch {
    searchMisses += 1;
  }
});

rows = rows.filter((row) => {
  if (!US_PLACES.has(row.exchange)) return true;
  const flags = usFlags.get(row.ticker);
  if (!flags) return true;
  if (Number(flags.isPTP) === 1) {
    drop("US PTP (isPTP)");
    return false;
  }
  if ((flags.secType || []).includes(66)) {
    drop("US warrant");
    return false;
  }
  return true;
});

// ---- SGX -------------------------------------------------------------------

async function sgxRanking() {
  const found = new Map();
  for (const direction of ["rise", "fall"]) {
    for (let page = 1; page <= 25; page += 1) {
      const answer = await fetchJson(
        `${QUOTES}/api/wlas/ranking/v9/${direction}?regionId=13&rankType=1d&pageIndex=${page}&pageSize=100`,
        { headers: HEADERS }
      );
      for (const item of answer.data || []) found.set(item.ticker.tickerId, item.ticker);
      if (!answer.hasMore || !(answer.data || []).length) break;
    }
  }
  return found;
}

// SGX ticker ids sit in one block from 460000000. Walk it in batches of a
// hundred until five batches in a row past the last ranked id come back empty.
async function sgxBlock(found, highestKnown) {
  let empty = 0;
  for (let start = 460000000; start < 460100000; start += 100) {
    const ids = Array.from({ length: 100 }, (_, index) => start + index).join(",");
    const answer = await fetchJson(`${QUOTES}/api/bgw/quote/realtime?ids=${ids}&includeSecu=1&delay=0&more=1`, { headers: HEADERS });
    const list = Array.isArray(answer) ? answer : [];
    for (const ticker of list) found.set(ticker.tickerId, ticker);
    empty = list.length ? 0 : empty + 1;
    if (empty >= 5 && start > highestKnown) break;
  }
}

console.error("SGX: Webull ranking and ticker block…");
const sgxWebull = await sgxRanking();
const rankedStocks = sgxWebull.size;
await sgxBlock(sgxWebull, Math.max(460000000, ...sgxWebull.keys()));
console.error(`  ${rankedStocks} ranked, ${sgxWebull.size} in the block`);

console.error("SGX: securities list and ISIN file…");
const sgxList = JSON.parse(
  await fetchText(
    "https://api.sgx.com/securities/v1.1?excludetypes=bonds&params=nc,n,cur,type,adjusted-vwap,b,bv,p,c,change_vs_pc,change_vs_pc_percentage,cx,cn,dp,dpc,du,ed,fn,h,iiv,iopv,lt,l,o,p_,pv,ptd,s,sv,trading_time,v_,v,vl,vwap,vwap-currency"
  )
).data?.prices || [];
const sgxByCode = new Map(sgxList.map((line) => [String(line.nc || "").trim(), line]));
if (sgxByCode.size < 500) throw new Error(`SGX securities list came back with ${sgxByCode.size} lines`);

async function sgxIsinFile() {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let back = 0; back < 10; back += 1) {
    const day = new Date(Date.now() - back * 86400000);
    const label = `${String(day.getUTCDate()).padStart(2, "0")} ${months[day.getUTCMonth()]} ${day.getUTCFullYear()}`;
    const text = await fetchText(`https://links.sgx.com/1.0.0/isin/1/${encodeURIComponent(label)}`).catch(() => "");
    if (/ISIN CODE/.test(text) && text.split(/\r?\n/).length > 1000) return text;
  }
  throw new Error("SGX ISIN file not found for the last ten days");
}

const isinText = await sgxIsinFile();
const isinLines = isinText.split(/\r?\n/);
const header = isinLines[0];
const isinAt = header.indexOf("ISIN CODE");
const codeAt = header.indexOf("CODE", isinAt + "ISIN CODE".length);
const counterAt = header.indexOf("TRADING COUNTER NAME");
const sgxIsin = new Map();
for (const line of isinLines.slice(1)) {
  const isin = toIsin(line.slice(isinAt, codeAt));
  const code = line.slice(codeAt, counterAt).trim();
  if (isin && code) sgxIsin.set(code, isin);
}

const SGX_KEEP = new Set(["stocks", "reits", "businesstrusts", "adrs", "etfs", "liprod", "others"]);
const sgxRows = [];
for (const ticker of sgxWebull.values()) {
  if (ticker.regionId !== 13 || ticker.listStatus !== 1) {
    drop("SGX delisted on Webull (listStatus not 1)");
    continue;
  }
  if (!["stock", "etf"].includes(ticker.template)) continue; // indices
  const secType = ticker.secType || [];
  if (secType.includes(66) || secType.includes(67)) {
    drop("SGX warrant/right (not a catalogue type)");
    continue;
  }
  const code = String(ticker.symbol || "").trim();
  const line = sgxByCode.get(code);
  if (!line || !SGX_KEEP.has(line.type)) {
    drop("SGX code not on SGX's current list");
    continue;
  }
  const isin = sgxIsin.get(code) || "";
  if (!isin) {
    drop("SGX code without ISIN");
    continue;
  }
  const currency = String(line.cur || ticker.currencyCode || "SGD").toUpperCase();
  const type = etfIsins.has(isin)
    ? "ETF"
    : stockIsins.has(isin)
      ? "STOCK"
      : ticker.template === "etf" || ["etfs", "liprod"].includes(line.type)
        ? "ETF"
        : "STOCK";
  const name = String(ticker.name || line.n || code).replace(/\s+/g, " ").trim();
  sgxRows.push({
    query: code,
    ticker: code,
    name,
    exchange: "SGX",
    currency,
    type,
    raw: [code, name, "SGX", currency].join(" "),
    isin,
  });
}
console.error(`  ${sgxRows.length} SGX rows`);
rows.push(...sgxRows);

// ---- currencies ------------------------------------------------------------

function baseCurrency(exchange) {
  if (exchange === "HKEX") return "HKD";
  if (exchange === "SGX") return "SGD";
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
    const base = group.find((row) => row.currency === baseCurrency(row.exchange)) || group[0];
    const mic = resolveVenue({ exchange: base.exchange, currency: base.currency, isin: base.isin }).venue?.mic;
    const keptLeaves = [];
    for (const row of [base, ...group.filter((item) => item !== base)]) {
      const leaf = mic ? spreads[String(row.isin || "").toUpperCase()]?.[mic]?.[row.currency] : null;
      if (row !== base && leaf?.url && keptLeaves.some((url) => url === leaf.url)) continue;
      if (leaf?.url) keptLeaves.push(leaf.url);
      out.push(row);
    }
  }
  return out;
}

// A currency line added for a deposit currency is left out when the place
// already has a line for that ISIN in that currency: a counter of its own
// (02800 HKD beside 82800 CNH), or a line added from a sibling counter
// (02800 USD and 82800 USD are one book).
const ownLines = new Set(rows.map((row) => `${row.exchange}|${String(row.isin || "").toUpperCase()}|${row.currency}`));
const evidence = loadCurrencyEvidence("webullsg");
const originals = new Set(rows);
const withCurrencies = addDepositCurrencies(rows, evidence.listed, evidence.books, DEPOSIT).filter((row) => {
  if (originals.has(row) || !row.isin) return true;
  const key = `${row.exchange}|${String(row.isin).toUpperCase()}|${row.currency}`;
  if (ownLines.has(key)) return false;
  ownLines.add(key);
  return true;
});
const expanded = keepDistinctCurrencies(withCurrencies);

const unresolved = new Set();
for (const row of expanded) {
  if (!resolveVenue({ exchange: row.exchange, currency: row.currency, isin: row.isin }).venue?.mic) {
    unresolved.add(`${row.exchange}|${row.currency}`);
  }
}
if (unresolved.size) throw new Error(`places resolveVenue cannot place: ${[...unresolved].join(", ")}`);

expanded.sort((left, right) =>
  String(left.type).localeCompare(right.type) ||
  String(left.exchange).localeCompare(right.exchange) ||
  String(left.ticker).localeCompare(right.ticker) ||
  String(left.currency).localeCompare(right.currency)
);

const outputPath = new URL("webullsg-parsed.json", import.meta.url);
const final = stampRows(withoutObligations(expanded), import.meta.url);
fs.writeFileSync(outputPath, JSON.stringify(final, null, 2));

const tally = new Map();
for (const row of final) {
  const key = `${row.exchange} ${row.type} ${row.currency}`;
  tally.set(key, (tally.get(key) || 0) + 1);
}
console.error(`${final.length} rows written to ${outputPath.pathname}`);
for (const [key, count] of [...tally].sort()) console.error(`  ${key}: ${count}`);
console.error(`left out: ${[...dropped].map(([reason, count]) => `${count} ${reason}`).join(", ") || "none"}`);
if (searchMisses) console.error(`${searchMisses} US symbols Webull's search did not return (kept)`);
