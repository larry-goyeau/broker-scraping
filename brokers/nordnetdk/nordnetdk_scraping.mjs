// Nordnet Danmark publishes every share and every ETF it sells, with no
// login, on the same platform as nordnet.se (brokers/nordnetse). The JSON
// search answers 401 without a session, so the lists are read from the
// pages that already contain them (2000 rows a page, sorted by name).
// Funds, warrants, certificates and bonds are other searches and stay
// out. A row with is_tradable false is not for sale. The page gives an
// ISIN and a quote currency on every line; both are kept as they are.
//
// The address suffix is not the book. On London, Zurich, Milan, Madrid
// and Vienna the page shows the CBOE Europe quote. A liquid order is
// more likely filled on the national book, which the instrument record
// names, and that is the place stored here. Nordnet's three US markets
// (17 NYSE, 18 NYSE American/Arca, 19 Nasdaq) are one NBBO tape: each
// title is listed once, on the market Nordnet files it under. OTC is
// not that tape. Trading halts are a status of the moment, not a
// delisting, and are kept. Places of broker-list.json that no line
// names (Cboe Europe, Turquoise, Aquis, phone-only markets) get no rows.
//
//   https://www.nordnet.dk/aktier/kurser?limit=2000
//   https://www.nordnet.dk/etf/liste?limit=2000
//
//   node brokers/nordnetdk/nordnetdk_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const FOLDER = "nordnetdk";
const SITE = "https://www.nordnet.dk";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LIMIT = 2000;
const LISTS = [
  { id: "stocklist", page: `${SITE}/aktier/kurser`, type: "STOCK", floor: 11000 },
  { id: "etflist", page: `${SITE}/etf/liste`, type: "ETF", floor: 2000 },
];

// Market id and address suffix, then the book an order is most likely to
// hit. Xetra's three suffixes are one book. The CBOE Europe quote on
// chix and ceux is not stored: the record names the national book.
const BOOK = {
  "4|xeta": ["Börse Xetra", "XETR"],
  "4|xetb": ["Börse Xetra", "XETR"],
  "4|xets": ["Börse Xetra", "XETR"],
  "11|xsto": ["Nasdaq Stockholm", "XSTO"],
  "11|ssme": ["First North Stockholm", "SSME"],
  "13|xngm": ["Nordic Growth Market", "XNGM"],
  "13|nsme": ["Nordic SME", "NSME"],
  "14|xcse": ["Nasdaq Copenhagen", "XCSE"],
  "14|dsme": ["First North Denmark", "DSME"],
  "15|xosl": ["Oslo Børs", "XOSL"],
  "15|xoas": ["Euronext Expand Oslo", "XOAS"],
  "17|xnas": ["New York Stock Exchange", "XNYS"],
  "18|xnas": ["NYSE American", "XASE"],
  "19|xnas": ["Nasdaq", "XNAS"],
  "21|xotc": ["OTC Markets", "OTCM"],
  "24|xhel": ["Nasdaq Helsinki", "XHEL"],
  "24|fsme": ["First North Helsinki", "FSME"],
  "25|xtse": ["Toronto Stock Exchange", "XTSE"],
  "26|xtsx": ["TSX Venture", "XTSX"],
  "26|xtnx": ["NEX", "XTNX"],
  "49|merk": ["Euronext Growth Oslo", "MERK"],
  "52|xsat": ["Spotlight Stock Market", "XSAT"],
  "55|dsme": ["First North Denmark", "DSME"],
  "67|spdk": ["Spotlight Stock Market", "XSAT"],
  "68|spno": ["Spotlight Stock Market", "XSAT"],
  "70|chix": ["London Stock Exchange", "XLON"],
  "72|xpar": ["Euronext Paris", "XPAR"],
  "73|xlis": ["Euronext Lisbon", "XLIS"],
  "74|xams": ["Euronext Amsterdam", "XAMS"],
  "75|xbru": ["Euronext Brussels", "XBRU"],
  "76|xdub": ["Euronext Dublin", "XMSM"],
  "77|ceux": ["Euronext Milan", "XMIL"],
  "81|ceux": ["Wiener Börse", "XWBO"],
  "82|ceux": ["Bolsa de Madrid", "XMAD"],
  "83|chix": ["SIX Swiss Exchange", "XSWX"],
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
        signal: AbortSignal.timeout(90_000),
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

// A page now and then arrives cut short; it is fetched again.
async function readPage(url, id) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return readList(await getHtml(url), id);
    } catch (error) {
      last = String(error.message || error);
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error(last);
}

// The default order is by live activity, so rows move between pages
// while they are read. Sorting by name keeps the pages still; a read that
// still comes back short is started over.
async function loadOnce(list) {
  const found = new Map();
  let total = 0;
  for (let page = 1; found.size < (total || Infinity); page += 1) {
    if (page > 40) throw new Error(`${list.id} did not end`);
    const body = await readPage(`${list.page}?limit=${LIMIT}&page=${page}&sortField=name&sortOrder=asc`, list.id);
    if (!total) total = body.total;
    if (body.total !== total) throw new Error(`${list.id} changed from ${total} to ${body.total} mid-read`);
    const before = found.size;
    for (const raw of body.results) found.set(String(raw.instrument_info?.instrument_id), { raw, list });
    if (found.size === before) throw new Error(`${list.id} page ${page} repeated`);
    if (body.results.length < LIMIT && found.size !== total) {
      throw new Error(`${list.id} ended at ${found.size} distinct of ${total}`);
    }
    await sleep(500);
  }
  if (found.size !== total) throw new Error(`${list.id} announced ${total} and returned ${found.size}`);
  return [...found.values()];
}

async function load(list) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await loadOnce(list);
    } catch (error) {
      last = String(error.message || error);
      console.error(`${list.id}: ${last}, reading again`);
      await sleep(5000);
    }
  }
  throw new Error(last);
}

function pairOf(raw) {
  const slug = normalize(raw.nnx_info?.display_slug).toLowerCase();
  const suffix = slug.slice(slug.lastIndexOf("-") + 1);
  return { slug, suffix, id: raw.market_info?.market_id };
}

const held = [];
const announced = new Map();
for (const list of LISTS) {
  const items = await load(list);
  announced.set(list.id, items.length);
  held.push(...items);
}

const unknown = new Map();
function note(key, name) {
  const prior = unknown.get(key) || [];
  if (prior.length < 3) prior.push(name);
  unknown.set(key, prior);
}

const merged = new Map();
const withheld = new Map();
function withhold(reason) {
  withheld.set(reason, (withheld.get(reason) || 0) + 1);
}
const addedByList = new Map();

for (const { raw, list } of held) {
  const info = raw.instrument_info || {};
  const { slug, suffix, id } = pairOf(raw);
  const book = BOOK[`${id}|${suffix}`];
  if (!book) {
    note(`${id}|${suffix || "blank"}`, normalize(info.symbol) || slug || "?");
    continue;
  }
  if (info.is_tradable !== true) {
    if (info.is_tradable !== false) throw new Error(`${info.symbol || list.id} tradable is ${info.is_tradable}`);
    withhold("not for sale");
    continue;
  }
  const [exchange, mic] = book;
  const isin = normalize(info.isin).toUpperCase();
  const ticker = normalize(info.symbol).toUpperCase();
  const name = normalize(info.long_name || info.name);
  const currency = normalize(info.currency).toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`${ticker || list.id} has no ISIN`);
  if (!ticker || !name) throw new Error(`${isin} has no ticker or name`);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`${ticker} is quoted ${currency || "nowhere"}`);
  const group = normalize(info.instrument_group_type).toUpperCase();
  const kind = normalize(info.instrument_type).toUpperCase();
  const type = list.type === "STOCK" ? (group === "EQ" ? "STOCK" : "") : kind === "UETF" || kind === "KETF" ? "ETF" : kind === "ETC" ? "ETC" : "";
  if (!type) {
    note(list.type === "STOCK" ? group || "blank" : kind || "blank", ticker || isin);
    continue;
  }
  const key = `${isin}|${mic}|${currency}`;
  const prior = merged.get(key);
  if (prior) {
    if (prior.ticker !== ticker || prior.type !== type) {
      throw new Error(`${isin} is both ${prior.ticker} ${prior.exchange} ${prior.type} and ${ticker} ${exchange} ${type}`);
    }
    continue;
  }
  merged.set(key, { ticker, name, isin, currency, exchange, mic, type, line: [ticker, name, isin, currency, slug, `market ${id}`, kind].join(" | ") });
  addedByList.set(list.id, (addedByList.get(list.id) || 0) + 1);
}

if (unknown.size) {
  const listed = [...unknown].map(([key, names]) => `${key} (${names.join(", ")})`).join("; ");
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
  mic: row.mic,
  currency: row.currency,
  type: row.type,
  isin: row.isin,
  raw: row.line,
}));

rows.sort((left, right) => left.type.localeCompare(right.type) || left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));

const must = [
  ["US0378331005", "XNAS", "USD", "Apple on Nasdaq"],
  ["US46625H1005", "XNYS", "USD", "JPMorgan on the NYSE"],
  ["DK0062498333", "XCSE", "DKK", "Novo Nordisk B on Copenhagen"],
  ["SE0015811963", "XSTO", "SEK", "Investor B on Stockholm"],
  ["NO0010096985", "XOSL", "NOK", "Equinor on Oslo"],
  ["FI0009000681", "XHEL", "EUR", "Nokia on Helsinki"],
  ["DE0007164600", "XETR", "EUR", "SAP on Xetra"],
  ["GB00BP6MXD84", "XLON", "GBP", "Shell on London"],
  ["CH0038863350", "XSWX", "CHF", "Nestlé on SIX"],
  ["CA7800871021", "XTSE", "CAD", "Royal Bank of Canada on Toronto"],
  ["IE00B4L5Y983", "XETR", "EUR", "iShares Core MSCI World on Xetra"],
];
for (const [isin, mic, currency, label] of must) {
  if (!rows.some((row) => row.isin === isin && row.mic === mic && row.currency === currency)) throw new Error(`${label} is missing`);
}

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL(`${FOLDER}-parsed.json`, import.meta.url), JSON.stringify(kept, null, 2));

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
