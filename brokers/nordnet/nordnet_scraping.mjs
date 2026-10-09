// Nordnet publishes every share and every ETF it sells, with no login.
// The JSON search answers 401 without a session, so the lists are read
// from the pages that already contain them. Funds, warrants and
// certificates are other searches and stay out. A row with is_tradable
// false is not for sale.
//
// The address suffix is not the book. On London, Zurich, Milan, Madrid
// and Vienna the page shows the CBOE Europe quote. A liquid order is
// more likely filled on the national book, which the instrument record
// names, and that is the place stored here. A listed American name is
// the NBBO: Nasdaq, the NYSE and NYSE Arca are one tape, so the row
// stays "US". OTC is not that tape.
//
//   https://www.nordnet.se/aktier/kurser?limit=2000
//   https://www.nordnet.se/etf/lista?limit=2000
//
//   node brokers/nordnet/nordnet_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LIMIT = 2000;
const LISTS = [
  { id: "stocklist", page: "https://www.nordnet.se/aktier/kurser", path: "/aktier/kurser/", type: "STOCK", floor: 10000 },
  { id: "etflist", page: "https://www.nordnet.se/etf/lista", path: "/etf/lista/", type: "ETF", floor: 2000 },
];

// Market id, address suffix, then the book an order is most likely to
// hit. Xetra's three suffixes are one book. The CBOE Europe quote on
// chix and ceux is not stored: the record names the national book.
const BOOK = {
  "4|xeta": "XETR",
  "4|xetb": "XETR",
  "4|xets": "XETR",
  "11|xsto": "XSTO",
  "11|ssme": "SSME",
  "13|xngm": "XNGM",
  "13|nsme": "NSME",
  "14|xcse": "XCSE",
  "14|dsme": "DSME",
  "15|xosl": "XOSL",
  "15|xoas": "XOAS",
  "17|xnas": "US",
  "18|xnas": "US",
  "19|xnas": "US",
  "21|xotc": "OTCM",
  "24|xhel": "XHEL",
  "24|fsme": "FSME",
  "25|xtse": "XTSE",
  "26|xtsx": "XTSX",
  "26|xtnx": "XTNX",
  "49|merk": "MERK",
  "52|xsat": "XSAT",
  "55|dsme": "DSME",
  "67|spdk": "SPDK",
  "68|spno": "SPNO",
  "70|chix": "XLON",
  "72|xpar": "XPAR",
  "73|xlis": "XLIS",
  "74|xams": "XAMS",
  "75|xbru": "XBRU",
  "76|xdub": "XDUB",
  "77|ceux": "XMIL",
  "81|ceux": "XWBO",
  "82|ceux": "XMAD",
  "83|chix": "XSWX",
};

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unescapeJs(raw) {
  return raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\//g, "/")
    .replace(/\\\\/g, "\\");
}

async function getHtml(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
      if (response.status === 429) await sleep(2000 * (attempt + 1));
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

function readList(html, id) {
  const at = html.indexOf(`${id}?`);
  if (at < 0) throw new Error(`the page has no ${id}`);
  const start = html.indexOf('{\\"rows\\":', at);
  if (start < 0) throw new Error(`${id} has no rows`);
  let depth = 0;
  let end = -1;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error(`${id} rows did not close`);
  const body = JSON.parse(unescapeJs(html.slice(start, end)));
  if (!Array.isArray(body.results)) throw new Error(`${id} returned nothing`);
  const total = Number(body.total_hits);
  if (!Number.isInteger(total) || total < 1) throw new Error(`${id} announced ${body.total_hits}`);
  if (body.results.length !== Number(body.rows)) throw new Error(`${id} counted ${body.rows} and returned ${body.results.length}`);
  return { total, results: body.results };
}

async function readPage(url, id) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return readList(await getHtml(url), id);
    } catch (error) {
      last = String(error.message || error);
      await sleep(700 * (attempt + 1));
    }
  }
  throw new Error(last);
}

async function load(list) {
  const found = [];
  let total = 0;
  let seen = "";
  for (let page = 1; found.length < (total || Infinity); page += 1) {
    if (page > 40) throw new Error(`${list.id} did not end`);
    const body = await readPage(`${list.page}?limit=${LIMIT}&page=${page}`, list.id);
    if (!total) total = body.total;
    if (body.total !== total) throw new Error(`${list.id} changed from ${total} to ${body.total} mid-read`);
    const first = String(body.results[0]?.instrument_info?.instrument_id || "");
    if (!first || first === seen) throw new Error(`${list.id} page ${page} repeated`);
    seen = first;
    found.push(...body.results.map((raw) => ({ raw, list })));
    if (body.results.length < LIMIT && found.length !== total) {
      throw new Error(`${list.id} ended at ${found.length} of ${total}`);
    }
  }
  if (found.length !== total) throw new Error(`${list.id} announced ${total} and returned ${found.length}`);
  return found;
}

function pairOf(raw) {
  const slug = normalize(raw.nnx_info?.display_slug).toLowerCase();
  const suffix = slug.slice(slug.lastIndexOf("-") + 1);
  return { slug, suffix, id: raw.market_info?.market_id };
}

const held = [];
for (const list of LISTS) held.push(...(await load(list)));

const unknownBooks = new Map();
for (const item of held) {
  const { slug, suffix, id } = pairOf(item.raw);
  const book = BOOK[`${id}|${suffix}`];
  if (!book) {
    const name = normalize(item.raw.instrument_info?.symbol) || slug || "?";
    const key = `${id}|${suffix || "blank"}`;
    const prior = unknownBooks.get(key) || [];
    if (prior.length < 3) prior.push(name);
    unknownBooks.set(key, prior);
    continue;
  }
  item.exchange = book;
}

if (unknownBooks.size) {
  const listed = [...unknownBooks].map(([key, names]) => `${key} (${names.join(", ")})`).join("; ");
  throw new Error(`unknown books: ${listed}`);
}

const merged = new Map();
const withheld = new Map();
function withhold(reason) {
  withheld.set(reason, (withheld.get(reason) || 0) + 1);
}
const addedByList = new Map();

for (const item of held) {
  const { raw, list } = item;
  const info = raw.instrument_info || {};
  if (info.is_tradable !== true) {
    if (info.is_tradable !== false) throw new Error(`${info.symbol || list.id} tradable is ${info.is_tradable}`);
    withhold("not for sale");
    continue;
  }
  const isin = normalize(info.isin).toUpperCase();
  const ticker = normalize(info.symbol).toUpperCase();
  const name = normalize(info.long_name || info.name);
  const currency = normalize(info.currency).toUpperCase();
  const exchange = item.exchange || "";
  if (!exchange) continue;
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`${ticker || list.id} has no ISIN`);
  if (!ticker || !name) throw new Error(`${isin} has no ticker or name`);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`${ticker} is quoted ${currency || "nowhere"}`);
  const group = normalize(info.instrument_group_type).toUpperCase();
  const kind = normalize(info.instrument_type).toUpperCase();
  const type = list.type === "STOCK" ? (group === "EQ" ? "STOCK" : "") : kind === "UETF" || kind === "KETF" ? "ETF" : kind === "ETC" ? "ETC" : "";
  if (!type) {
    const label = list.type === "STOCK" ? group || "blank" : kind || "blank";
    const prior = unknownBooks.get(label) || [];
    if (prior.length < 3) prior.push(ticker || isin);
    unknownBooks.set(label, prior);
    continue;
  }
  const key = `${isin}|${exchange}|${currency}`;
  const prior = merged.get(key);
  if (prior) {
    if (prior.ticker !== ticker || prior.type !== type) {
      throw new Error(`${isin} is both ${prior.ticker} ${prior.exchange} ${prior.type} and ${ticker} ${exchange} ${type}`);
    }
    continue;
  }
  merged.set(key, { ticker, name, isin, currency, exchange, type });
  addedByList.set(list.id, (addedByList.get(list.id) || 0) + 1);
}

if (unknownBooks.size) {
  const listed = [...unknownBooks].map(([key, names]) => `${key} (${names.join(", ")})`).join("; ");
  throw new Error(`unmapped: ${listed}`);
}
for (const list of LISTS) {
  if ((addedByList.get(list.id) || 0) < list.floor) throw new Error(`only ${addedByList.get(list.id) || 0} ${list.type} rows`);
}

const rows = [...merged.values()].map((row) => ({
  query: row.ticker,
  ticker: row.ticker,
  name: row.name,
  exchange: row.exchange,
  currency: row.currency,
  type: row.type,
  isin: row.isin,
  raw: [row.ticker, row.name, row.exchange, row.currency, row.isin, row.type].join(" "),
}));

rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

const apple = rows.find((row) => row.isin === "US0378331005" && row.exchange === "US" && row.currency === "USD");
if (!apple) throw new Error("Apple is not on the US tape");
const jpm = rows.find((row) => row.isin === "US46625H1005" && row.exchange === "US" && row.currency === "USD");
if (!jpm) throw new Error("JPMorgan is not on the US tape");
const nokia = rows.find((row) => row.isin === "FI0009000681" && row.exchange === "XHEL");
if (!nokia) throw new Error("Nokia is not on Helsinki");
const investor = rows.find((row) => row.ticker === "INVE B" && row.exchange === "XSTO" && row.currency === "SEK");
if (!investor) throw new Error("Investor B is not on Stockholm");
const shell = rows.find((row) => row.isin === "GB00BP6MXD84" && row.exchange === "XLON" && row.currency === "GBP");
if (!shell) throw new Error("Shell is not on London");
const nestle = rows.find((row) => row.isin === "CH0038863350" && row.exchange === "XSWX");
if (!nestle) throw new Error("Nestlé is not on SIX");

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("nordnet-parsed.json", import.meta.url), `${JSON.stringify(kept, null, 2)}\n`);

const byBook = new Map();
for (const row of kept) {
  const key = `${row.exchange} ${row.type}`;
  byBook.set(key, (byBook.get(key) || 0) + 1);
}
console.error(
  `${kept.length} listings over ${new Set(kept.map((row) => row.isin)).size} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})`
);
if (withheld.size) console.error(`left out ${[...withheld].map(([reason, count]) => `${count} ${reason}`).join(", ")}`);
if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
