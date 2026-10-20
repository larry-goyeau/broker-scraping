// Handelsbanken (Sweden) sells shares online on the Nordic exchanges, in
// the US, and in France, the Netherlands and Germany (prislista
// värdepappershandel). Its public market pages, with no login, list every
// share per country, and the lists are its own: besides exchange and index
// lists, each foreign country has a Handelsbanken list ("SHB US Custom
// Selection", "SHB Germany", "SHB France", "SHB Netherlands", shown as
// "Övrigt"). The list page has a tradable column; every line tried from
// these lists reads tradable, and US, German and ETF lines left out of them
// (GameStop, SoFi, Snowflake, Heidelberger Druck, iShares Core MSCI World)
// read not tradable. The flag reads the same in SEB's session, so it may be
// Infront's rather than the bank's own.
//
// ETFs are the Stockholm ETF list, the XACT lists in Stockholm and
// Copenhagen, and the Amundi list, which Handelsbanken trades on
// Tradegate. Other foreign ETFs are flagged not tradable. The Danish
// investment-fund lists (feed 17669) carry no tradable flag and stay out.
// Rights (teckningsrätter) and Spotlight warrants stay out. No Iceland
// list is published, and the session has no Iceland feed.
//
// The lists are read over the Infront protocol the pages use (./infront.mjs)
// with the anonymous session token from /api/getsession. Lines carry the
// ISIN. German, French and Dutch lines are Cboe DXE quotes; the suffix of
// the code (d, p, a) names the home market, and the row is stored there
// (Xetra, Euronext Paris, Euronext Amsterdam), since the bank names the
// country, not the venue. US feed 2343 is Nasdaq; feed 2344 is NYSE, or
// NYSE American when ../../assets/stocks.csv has the code only there.
//
// The bank's execution-venue page lists Cboe Europe beside the Nordic
// exchanges for shares, and its order router may send a Nordic order
// there. The page does not say for which shares, so a Nordic share is
// written a second time on Cboe Europe when Cboe's own symbol file lists
// that ISIN and currency as live on DXE, the book of Cboe Europe B.V.
// that serves EEA shares (Handelsbanken is an EU firm). Nordic ETFs stay
// on their exchange: the page names Cboe Europe for shares. German,
// French and Dutch shares go through an outside broker and stay one row.
//
//   https://handelsbanken-marknadsinformation.se/app/market/all
//   https://handelsbanken-marknadsinformation.se/api/getsession
//   https://www.handelsbanken.se/sv/privat/spara/aktier-och-andra-vardepapper/handla-utlandska-aktier
//   https://www.handelsbanken.se/sv/om-oss/juridiska-dokument/prislistor-privat/prislista-spara/prislista-vardepappershandel
//   https://www.handelsbanken.se/sv/privat/spara/aktier-och-andra-vardepapper/handelsplatser
//   https://www.cboe.com/europe/equities/market_statistics/symbols_traded/csv/?mkt=dxe
//
//   node brokers/handelsbankense/handelsbankense_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { openChains } from "./infront.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SITE = "https://handelsbanken-marknadsinformation.se";
const STOCKS_CSV = new URL("../../assets/stocks.csv", import.meta.url);

const XSTO = ["Nasdaq Stockholm", "XSTO"];
const XCSE = ["Nasdaq Copenhagen", "XCSE"];
const XHEL = ["Nasdaq Helsinki", "XHEL"];
const XOSL = ["Oslo Børs", "XOSL"];
const SPOTLIGHT = ["Spotlight Stock Market", "XSAT"];

// [feed, list, provider, place, type, country] in the order a line is first placed.
const LISTS = [
  [17921, "10208", 0, XSTO, "STOCK", "SE"],
  [17921, "10210", 0, XSTO, "STOCK", "SE"],
  [17921, "10212", 0, XSTO, "STOCK", "SE"],
  [17921, "10150", 0, XSTO, "STOCK", "SE"],
  [17921, "FNO_STOCK", 0, ["First North Stockholm", "SSME"], "STOCK", "SE"],
  [17938, "EQST", 0, ["NGM Equity", "XNGM"], "STOCK", "SE"],
  [17938, "NSSE", 0, ["Nordic SME", "NSME"], "STOCK", "SE"],
  [17921, "AktieTorget-cotr", 0, SPOTLIGHT, "STOCK", "SE"],
  [17921, "SWEDISH_ALL_STOCKS", 0, null, "STOCK", "SE"],
  [17921, "10122", 0, XSTO, "ETF", "SE"],
  [17921, "INDEX_FUND_ISSUER_XACT", 0, XSTO, "ETF", "SE"],
  [17665, "10220", 0, XCSE, "STOCK", "DK"],
  [17665, "10222", 0, XCSE, "STOCK", "DK"],
  [17665, "10224", 0, XCSE, "STOCK", "DK"],
  [17665, "FNDK CPH", 0, ["First North Denmark", "DSME"], "STOCK", "DK"],
  [17692, "SPDK", 0, SPOTLIGHT, "STOCK", "DK"],
  [17665, "DKEQ FUI", 0, XCSE, "ETF", "DK"],
  [100, "10196", 0, XHEL, "STOCK", "FI"],
  [100, "10198", 0, XHEL, "STOCK", "FI"],
  [100, "10200", 0, XHEL, "STOCK", "FI"],
  [100, "SEMM FN HEL", 0, ["First North Helsinki", "FSME"], "STOCK", "FI"],
  [18177, "DEFAULT", 0, XOSL, "STOCK", "NO"],
  [18177, "MATCH", 0, XOSL, "STOCK", "NO"],
  [18177, "STANDARD", 0, XOSL, "STOCK", "NO"],
  [18177, "OAX", 0, ["Euronext Expand Oslo", "XOAS"], "STOCK", "NO"],
  [18177, "O9", 0, ["Euronext Growth Oslo", "MERK"], "STOCK", "NO"],
  [17695, "SPNO", 0, SPOTLIGHT, "STOCK", "NO"],
  [2343, "NDX", 0, null, "STOCK", "US"],
  [2343, "CELS", 0, null, "STOCK", "US"],
  [2344, "SHB US Custom Selection", 31, null, "STOCK", "US"],
  [5475, "BDE40P", 0, null, "STOCK", "DE"],
  [5475, "BDEM50P", 0, null, "STOCK", "DE"],
  [5475, "BDES50P", 0, null, "STOCK", "DE"],
  [5475, "SHB Germany", 31, null, "STOCK", "DE"],
  [5475, "BFR40P", 0, null, "STOCK", "FR"],
  [5475, "BFRM20P", 0, null, "STOCK", "FR"],
  [5475, "SHB France", 31, null, "STOCK", "FR"],
  [5475, "BNL25P", 0, null, "STOCK", "NL"],
  [5475, "BNLM25P", 0, null, "STOCK", "NL"],
  [5475, "SHB Netherlands", 31, null, "STOCK", "NL"],
  [2358, "Amundi", 31, ["Tradegate", "XGAT"], "ETF", "DE"],
];

// Places by feed, for lines of the all-shares list that no segment list holds.
const FEED_PLACE = { 17921: XSTO, 17938: ["NGM Equity", "XNGM"], 18051: SPOTLIGHT };
// Nordic places a share can also reach on Cboe Europe DXE.
const NORDIC = new Set(["XSTO", "SSME", "XCSE", "DSME", "XHEL", "FSME", "XOSL", "XOAS", "MERK", "XNGM", "NSME", "XSAT"]);
const DXE_SYMBOLS = "https://www.cboe.com/europe/equities/market_statistics/symbols_traded/csv/?mkt=dxe";
const CBOE_HOME = { d: ["Xetra", "XETR"], p: ["Euronext Paris", "XPAR"], a: ["Euronext Amsterdam", "XAMS"] };
const FLOOR = { "SE STOCK": 900, "SE ETF": 20, "DK STOCK": 100, "FI STOCK": 150, "NO STOCK": 250, "US STOCK": 450, "DE STOCK": 120, "FR STOCK": 50, "NL STOCK": 45, "DE ETF": 80 };

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function sessionToken() {
  const jar = new Map();
  async function get(url) {
    let next = url;
    for (let hop = 0; hop < 6; hop += 1) {
      const response = await fetch(next, {
        headers: { "User-Agent": UA, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
        redirect: "manual",
      });
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(";");
        const at = pair.indexOf("=");
        jar.set(pair.slice(0, at).trim(), pair.slice(at + 1));
      }
      if (response.status >= 300 && response.status < 400) { next = new URL(response.headers.get("location"), next).href; continue; }
      if (!response.ok) throw new Error(`${next} answered ${response.status}`);
      return response;
    }
    throw new Error(`${url}: too many redirects`);
  }
  await get(`${SITE}/app/market/all`);
  const session = await (await get(`${SITE}/api/getsession`)).json();
  if (!session.access_token) throw new Error("getsession gave no access token");
  return session.access_token;
}

// US codes listed on NYSE American only, per ../../assets/stocks.csv.
function americanOnly() {
  const places = new Map();
  for (const line of fs.readFileSync(STOCKS_CSV, "utf8").split("\n").slice(1)) {
    const [id, exchange] = line.split(",");
    if (exchange !== "NYSE" && exchange !== "AMEX") continue;
    const code = id.split(":").pop();
    if (!places.has(code)) places.set(code, new Set());
    places.get(code).add(exchange);
  }
  return new Set([...places].filter(([, set]) => set.has("AMEX") && !set.has("NYSE")).map(([code]) => code));
}

function placeOf(list, item, amex) {
  const [feed, name, , place, , country] = list;
  if (place) return { place, ticker: item.symbol };
  if (country === "US") {
    if (item.feed === 2343) return { place: ["Nasdaq", "XNAS"], ticker: item.symbol };
    if (item.feed === 2344) return { place: amex.has(item.symbol) ? ["NYSE American", "XASE"] : ["NYSE", "XNYS"], ticker: item.symbol };
    throw new Error(`US line on feed ${item.feed}: ${item.symbol}`);
  }
  if (feed === 5475) {
    const match = item.symbol.match(/^(.+?)([a-z])$/);
    const home = match && CBOE_HOME[match[2]];
    if (!home) throw new Error(`${name}: Cboe code ${item.symbol} has no known home suffix`);
    return { place: home, ticker: match[1] };
  }
  const byFeed = FEED_PLACE[item.feed];
  if (!byFeed) throw new Error(`${name}: no place for feed ${item.feed} (${item.symbol})`);
  return { place: byFeed, ticker: item.symbol };
}

// Cboe's DXE symbol file: one line per ISIN and currency, with a live flag.
// The first line is a stamp, the second the header. Returns "ISIN|CCY" keys.
async function dxeLive() {
  const response = await fetch(DXE_SYMBOLS, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Cboe DXE symbol file answered ${response.status}`);
  const lines = (await response.text()).split(/\r?\n/).slice(1).filter(Boolean);
  const cells = (line) => [...line.matchAll(/("([^"]|"")*"|[^,]*)(,|$)/g)].map((m) => m[1].replace(/^"|"$/g, "").replace(/""/g, '"')).slice(0, -1);
  const header = cells(lines[0]);
  const [isinAt, currencyAt, liveAt] = ["isin", "currency", "live"].map((name) => header.indexOf(name));
  if (isinAt < 0 || currencyAt < 0 || liveAt < 0) throw new Error("Cboe DXE symbol file header moved");
  const live = new Set();
  for (const line of lines.slice(1)) {
    const row = cells(line);
    if (row[liveAt] === "t") live.add(`${row[isinAt]}|${row[currencyAt]}`);
  }
  if (live.size < 3000) throw new Error(`Cboe DXE symbol file has only ${live.size} live lines`);
  return live;
}

const amex = americanOnly();
const token = await sessionToken();
const client = await openChains(token);
const rows = new Map();
const perList = [];
const skipped = {};
try {
  for (const list of LISTS) {
    const [feed, name, provider, , type, country] = list;
    const items = await client.chain(feed, name, provider || undefined);
    if (!items.length) throw new Error(`list ${name} on feed ${feed} came back empty`);
    perList.push(`${name} ${items.length}`);
    for (const item of items) {
      if (type === "STOCK" && item.symbolType !== 1) { skipped[`${name} type ${item.symbolType}`] = (skipped[`${name} type ${item.symbolType}`] || 0) + 1; continue; }
      if (type === "ETF" && item.symbolType !== 512 && item.symbolType !== 1) { skipped[`${name} type ${item.symbolType}`] = (skipped[`${name} type ${item.symbolType}`] || 0) + 1; continue; }
      const { place, ticker } = placeOf(list, item, amex);
      const [exchange, mic] = place;
      const key = `${item.feed}|${item.symbol}`;
      if (rows.has(key)) continue;
      const name_ = normalize(item.fullName) || ticker;
      const isin = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(item.isin) ? item.isin : "";
      rows.set(key, {
        query: isin || ticker,
        ticker,
        name: name_,
        exchange,
        mic,
        currency: normalize(item.currency).toUpperCase().replace(/^GBX$/, "GBp"),
        type,
        isin,
        raw: [item.symbol, name_, item.feed, name, item.currency, isin].filter(Boolean).join(" "),
        country,
      });
    }
  }
} finally {
  client.close();
}

const counts = {};
const byCountry = {};
for (const row of rows.values()) {
  counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
  byCountry[`${row.country} ${row.type}`] = (byCountry[`${row.country} ${row.type}`] || 0) + 1;
}
for (const [key, floor] of Object.entries(FLOOR)) {
  if ((byCountry[key] || 0) < floor) throw new Error(`${key}: ${byCountry[key] || 0} rows, expected at least ${floor}`);
}

const dxe = await dxeLive();
const onCboe = [];
for (const row of rows.values()) {
  if (row.type !== "STOCK" || !NORDIC.has(row.mic) || !dxe.has(`${row.isin}|${row.currency}`)) continue;
  onCboe.push({ ...row, exchange: "Cboe Europe DXE", mic: "CEUX", raw: `${row.raw} Cboe DXE` });
}
if (onCboe.length < 500) throw new Error(`only ${onCboe.length} Nordic shares found on Cboe DXE`);
for (const row of onCboe) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;

const sorted = [...rows.values(), ...onCboe]
  .map(({ country, ...row }) => row)
  .sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker));
fs.writeFileSync(new URL("handelsbankense-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(sorted)), null, 2));

console.error(perList.join(", "));
if (Object.keys(skipped).length) console.error("skipped", skipped);
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
console.error(`${sorted.length} rows, ${sorted.filter((row) => row.isin).length} with an ISIN`);
// The Infront servers do not answer the websocket close, which would keep
// Node waiting for a minute or two.
setTimeout(() => process.exit(0), 500).unref();
