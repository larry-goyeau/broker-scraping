// What Yuh sells in shares and ETFs, with no login. Yuh does not trade
// whole exchanges: it sells a list picked by hand. Its invest pages say
// so ("more than 250 shares, hand-picked by our experts", "70+ ETFs
// hand-picked by our experts", and the FAQ: "We favour stocks with high
// market capitalisation (blue chips)"). That list is the book. The
// broker-list "curated selection" note is this list, not a filter on
// top of it.
//
// The pages print the list as TradingView market-quote widgets: one
// group of shares, one of ETFs, one of bond ETFs and one of themes, each
// line a TradingView symbol such as "SIX:VWRL" or "SIX:SAUS.AUD". The
// symbol names the place and the trading line, so each title has one
// place and one currency, and no row is copied to other places or
// currencies. The invest page and the stocks page each print the full
// share list and differ by a line or two, so the lists are joined.
//
// TradingView's symbol search gives each line its ISIN, currency, kind
// and, for Euronext, the book (Paris, Amsterdam, Brussels). A share, a
// preferred share and a depositary receipt are kept as STOCK; a fund
// TradingView marks as an ETF is kept as ETF. Crypto groups and the
// physical bitcoin, ether and crypto-index products in the ETF group
// are crypto and stay out. The Leonteq and Swissquote tracker
// certificates among the themes and commodities are structured
// products, not funds, and stay out. A share code that points at a
// fund is a typo on Yuh's page and stays out; an American code with no
// American line left (a delisted company) stays out too.
//
// Yuh types the codes by hand, so a share code can point at another
// company than the one Yuh names. Each share line's Yuh labels (the
// invest and stocks pages can label one code differently) are matched
// against TradingView's company name: a shared word, the name's
// initials (P&G) or a known short name below (Inditex, TSMC, Munich
// Re...). A line no label matches is a different company and stays
// out. NYSE:MSGE is named "Madison Square Garden Sports" by Yuh but is
// Madison Square Garden Entertainment (Sports is NYSE:MSGS); which one
// the app trades cannot be told without a login, so it stays out while
// Yuh's label says Sports. Every line left out is printed, with one
// count per reason.
//
//   https://www.yuh.com/en/app/invest/
//   https://www.yuh.com/en/app/invest/stocks/
//   https://www.yuh.com/en/app/invest/etfs/
//   https://www.yuh.com/en/pricing/
//   https://symbol-search.tradingview.com/symbol_search/v3/?text=VWRL&exchange=SIX&lang=en&domain=production&search_type=
//
//   node brokers/yuh/yuh_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const PAGES = [
  "https://www.yuh.com/en/app/invest/",
  "https://www.yuh.com/en/app/invest/stocks/",
  "https://www.yuh.com/en/app/invest/etfs/",
];
const SEARCH = "https://symbol-search.tradingview.com/symbol_search/v3/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const KEPT_GROUPS = new Set(["Shares", "ETFs", "Bonds (ETF)", "Themes"]);
const CRYPTO_GROUPS = /^cryptos?$/i;
// Least lines per full group, a little under what the pages print today.
const LEAST = { Shares: 350, ETFs: 50, "Bonds (ETF)": 8, Themes: 12 };
const CRYPTO = /\b(bitcoin|ethereum|ether|solana|crypto|coindesk)\b/i;
const US = new Set(["NYSE", "NASDAQ", "AMEX"]);
// Block's code changed from SQ to XYZ in January 2025; Yuh's page still
// prints SQ.
const RENAMED = { "NYSE:SQ": "XYZ" };
// Yuh's short or former names that share no word with TradingView's
// company name: code -> what TradingView's name must say.
const NAME_ALIASES = {
  "BME:ITX": /industria de diseno textil/i, // Inditex
  "EURONEXT:UMG": /universal music/i, // UMG
  "LSE:BP.": /^bp\b/i, // British Petroleum
  "LSE:GSK": /^gsk\b/i, // GlaxoSmithKline
  "NASDAQ:MSTR": /^strategy\b/i, // MicroStrategy, renamed Strategy in 2025
  "NYSE:TSM": /taiwan semiconductor/i, // TSMC
  "XETR:DHL": /^dhl\b/i, // Deutsche Post, renamed DHL Group
  "XETR:MUV2": /munchener ruck/i, // Munich Re
};
// Codes whose line is a sibling of the company Yuh names: left out
// while Yuh's label still says the other company.
const MISLABELLED = { "NYSE:MSGE": /garden sports/i };
const NAME_STOP = new Set(
  "the and of inc corp corporation co company companies plc ag sa se nv spa ltd limited holding holdings group class shs ord adr ads sponsored common stock shares registered reg new de del".split(" ")
);

// TradingView prefix -> place. Euronext is several books; TradingView's
// own exchange name picks the one.
const PLACES = {
  NASDAQ: { exchange: "Nasdaq", mic: "XNAS" },
  NYSE: { exchange: "NYSE", mic: "XNYS" },
  AMEX: { exchange: "NYSE American", mic: "XASE" },
  SIX: { exchange: "SIX Swiss Exchange", mic: "XSWX" },
  XETR: { exchange: "Xetra", mic: "XETR" },
  LSE: { exchange: "London Stock Exchange", mic: "XLON" },
  // The LSE International Order Book (Samsung's GDR).
  LSIN: { exchange: "LSE IOB", mic: "XLON" },
  MIL: { exchange: "Borsa Italiana", mic: "XMIL" },
  BME: { exchange: "Bolsa de Madrid", mic: "XMAD" },
};
const EURONEXT = {
  "Euronext Paris": "XPAR",
  "Euronext Amsterdam": "XAMS",
  "Euronext Brussels": "XBRU",
  "Euronext Lisbon": "XLIS",
  "Euronext Dublin": "XMSM",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function isinOf(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function nameWords(value) {
  return normalize(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word && !NAME_STOP.has(word));
}

// Whether one Yuh label names the company TradingView calls `name`.
// The label and each part in brackets ("Inditex (Zara)") are tried.
function labelMatches(label, name) {
  const theirs = nameWords(name);
  const joined = theirs.join("");
  const initials = theirs.map((word) => word[0]).join("");
  const parts = [label.replace(/\([^)]*\)/g, " "), ...[...label.matchAll(/\(([^)]*)\)/g)].map((match) => match[1])];
  return parts.some((part) => {
    const ours = nameWords(part);
    if (!ours.length) return false;
    const together = ours.join("");
    if (ours.some((word) => theirs.some((other) => word === other || (word.length >= 3 && other.startsWith(word)) || (other.length >= 3 && word.startsWith(other))))) return true;
    if (together.length >= 3 && joined.includes(together)) return true;
    return together.length >= 2 && initials.startsWith(together);
  });
}

async function getText(url, headers = {}) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return await response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(600 * (attempt + 1));
  }
  throw new Error(last);
}

function widgetGroups(html, url) {
  const groups = [];
  const pattern = /embed-widget-market-quotes\.js"[^>]*>([\s\S]*?)<\/script>/g;
  for (const match of html.matchAll(pattern)) {
    const config = JSON.parse(match[1]);
    if (!Array.isArray(config.symbolsGroups)) throw new Error(`${url}: a quote widget has no symbol groups`);
    for (const group of config.symbolsGroups) {
      if (!Array.isArray(group.symbols)) throw new Error(`${url}: group ${group.name} has no symbols`);
      groups.push({ name: normalize(group.name), symbols: group.symbols });
    }
  }
  if (!groups.length) throw new Error(`${url}: no TradingView quote widget`);
  return groups;
}

// Every line of the kept groups. The invest page and the stocks page
// each print the full share list, and the two differ by a line or two
// (one has Pepsico as PEP, the other as PEPS and adds EssilorLuxottica),
// so the lists are joined. A bare code in a short "top" group must be
// one of the full lines.
async function yuhList() {
  const byName = new Map();
  for (const url of PAGES) {
    for (const group of widgetGroups(await getText(url), url)) {
      if (CRYPTO_GROUPS.test(group.name)) continue;
      if (!KEPT_GROUPS.has(group.name)) throw new Error(`${url}: unknown group "${group.name}"`);
      if (!byName.has(group.name)) byName.set(group.name, []);
      byName.get(group.name).push(group.symbols);
    }
  }
  const lines = new Map();
  const bare = [];
  for (const name of KEPT_GROUPS) {
    const lists = byName.get(name) || [];
    const longest = Math.max(0, ...lists.map((list) => list.length));
    if (longest < LEAST[name]) throw new Error(`Yuh printed ${longest} lines in ${name}`);
    for (const symbol of lists.flat()) {
      const code = normalize(symbol.name).toUpperCase();
      if (/^[A-Z0-9.]+$/.test(code)) {
        bare.push(code);
        continue;
      }
      if (!/^[A-Z]+:[A-Z0-9.]+$/.test(code)) throw new Error(`unreadable symbol ${JSON.stringify(symbol.name)}`);
      const label = normalize(symbol.displayName);
      if (!lines.has(code)) lines.set(code, { code, group: name, label, labels: [] });
      const line = lines.get(code);
      if (label && !line.labels.includes(label)) line.labels.push(label);
    }
  }
  for (const code of bare) {
    if (![...lines.keys()].some((line) => line.endsWith(`:${code}`))) throw new Error(`top line ${code} is not in the full lists`);
  }
  return [...lines.values()];
}

async function tvSearch(text, prefix) {
  const url = `${SEARCH}?text=${encodeURIComponent(text)}&exchange=${prefix}&lang=en&domain=production&search_type=`;
  const body = JSON.parse(await getText(url, { Origin: "https://www.tradingview.com" }));
  if (!Array.isArray(body.symbols)) throw new Error(`TradingView answered no list for ${prefix}:${text}`);
  return body.symbols;
}

async function exact(symbol, prefix) {
  const tries = [symbol];
  // A search for "SAUS.AUD" can miss; the bare code then finds it.
  if (symbol.includes(".") && !symbol.startsWith(".")) tries.push(symbol.slice(0, symbol.indexOf(".")));
  for (const text of tries) {
    const hit = (await tvSearch(text, prefix)).find(
      (line) =>
        normalize(line.symbol).toUpperCase() === symbol &&
        (!prefix || normalize(line.source_id || line.exchange).toUpperCase() === prefix)
    );
    if (hit) return hit;
  }
  return null;
}

// The TradingView line of one Yuh symbol, or why there is none.
// An American code TradingView now files on the other American board
// (Kraft Heinz) is the same NBBO line; the board comes from TradingView.
// A code with no American line left is no longer listed. Milan ETF
// lines are missing from TradingView's MIL board; the same code
// elsewhere gives the ISIN, and the place stays Yuh's.
async function tvLine(item) {
  const [prefix, given] = item.code.split(":");
  const symbol = RENAMED[item.code] || given;
  const own = await exact(symbol, prefix);
  if (own) return { line: own, prefix };
  if (US.has(prefix)) {
    for (const other of [...US].filter((board) => board !== prefix)) {
      const line = await exact(symbol, other);
      if (line) return { line, prefix: other };
    }
    return { gone: `${item.code} has no American line any more: ${item.label}` };
  }
  if (prefix === "MIL") {
    const line = await exact(symbol, "");
    if (line && normalize(line.currency_code).toUpperCase() === "EUR") return { line, prefix, borrowed: true };
  }
  if (item.group === "Themes" && prefix === "SIX" && /(LK|SQ)$/.test(symbol)) {
    return { gone: `${item.code} Leonteq or Swissquote tracker certificate: ${item.label}` };
  }
  throw new Error(`TradingView has no line ${item.code}`);
}

async function mapLimit(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]);
      await sleep(150);
    }
  }
  await Promise.all(Array.from({ length: limit }, runner));
  return results;
}

const listed = await yuhList();
const leftOut = [];
const leftOutWhy = new Map();
function leaveOut(why, text) {
  leftOut.push(text);
  leftOutWhy.set(why, (leftOutWhy.get(why) || 0) + 1);
}
for (const code of Object.keys({ ...NAME_ALIASES, ...MISLABELLED })) {
  if (!listed.some((item) => item.code === code)) throw new Error(`${code} is no longer on Yuh's pages; drop it from the name lists`);
}
const rows = [];
const found = await mapLimit(listed, 4, tvLine);

for (const [index, item] of listed.entries()) {
  const { line, prefix, borrowed, gone } = found[index];
  if (gone) {
    leaveOut(/tracker/.test(gone) ? "tracker certificate" : "no American line", gone);
    continue;
  }
  const symbol = normalize(line.symbol).toUpperCase();
  const kind = normalize(line.type).toLowerCase();
  const specs = Array.isArray(line.typespecs) ? line.typespecs : [];
  const name = normalize(line.description) || item.label;
  const share = item.group === "Shares";
  let type = "";
  if (share && (kind === "stock" || kind === "dr")) type = "STOCK";
  else if (!share && kind === "fund" && specs.includes("etf")) type = "ETF";
  else if (!share && kind === "structured") {
    leaveOut("structured product", `${item.code} structured product: ${name}`);
    continue;
  } else if (share && kind === "fund") {
    // Yuh's code points at a fund while Yuh names a company: a typo on
    // the page (PEPS for Pepsico, whose PEP line is also listed).
    leaveOut("share code is a fund", `${item.code} is the fund "${name}", not Yuh's "${item.label}"`);
    continue;
  } else throw new Error(`${item.code} in ${item.group} is ${kind} ${specs.join(",")}`);
  if (share) {
    const sibling = MISLABELLED[item.code];
    if (sibling) {
      if (!item.labels.some((label) => sibling.test(label))) throw new Error(`${item.code}: Yuh now labels it ${JSON.stringify(item.labels)}; recheck it`);
      leaveOut("other company than Yuh's label", `${item.code} is "${name}", not Yuh's "${item.labels.join('" / "')}"`);
      continue;
    }
    const alias = NAME_ALIASES[item.code];
    if (alias && !alias.test(name)) throw new Error(`${item.code}: TradingView now names it "${name}"; recheck the alias`);
    if (!alias && !item.labels.some((label) => labelMatches(label, name))) {
      leaveOut("other company than Yuh's label", `${item.code} is "${name}", not Yuh's "${item.labels.join('" / "')}"`);
      continue;
    }
  }
  if (type === "ETF" && /\bleonteq\b/i.test(`${name} ${item.label}`)) {
    leaveOut("Leonteq product", `${item.code} Leonteq exchange-traded product: ${item.label}`);
    continue;
  }
  if (type === "ETF" && (CRYPTO.test(name) || CRYPTO.test(item.label))) {
    leaveOut("crypto", `${item.code} crypto product: ${name}`);
    continue;
  }

  let place = PLACES[prefix];
  if (prefix === "EURONEXT") {
    const book = normalize(line.exchange);
    if (!EURONEXT[book]) throw new Error(`${item.code} is on an unknown Euronext book "${book}"`);
    place = { exchange: book, mic: EURONEXT[book] };
  }
  if (!place) throw new Error(`${item.code} is on an unknown place`);

  const currency = normalize(line.currency_code).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`${item.code} has no currency`);
  // A SIX line with a suffix is that currency's line; one without is the franc line.
  const suffix = prefix === "SIX" && symbol.includes(".") ? symbol.slice(symbol.indexOf(".") + 1) : "";
  if (prefix === "SIX" && currency !== (suffix || "CHF")) throw new Error(`${item.code} trades in ${currency}`);
  const ticker = suffix ? symbol.slice(0, symbol.indexOf(".")) : symbol;
  const isin = isinOf(line.isin);
  const row = { query: ticker, ticker, name, exchange: place.exchange, currency, type };
  if (isin) row.isin = isin;
  row.mic = place.mic;
  row.raw = [item.code, item.label, item.group, name, place.exchange, currency, isin, type, borrowed ? "ISIN from another board" : ""]
    .filter(Boolean)
    .join(" ");
  rows.push(row);
}

if (leftOut.length > 30) throw new Error(`${leftOut.length} lines were left out`);
const seen = new Set();
for (const row of rows) {
  const key = `${row.mic} ${row.ticker} ${row.currency}`;
  if (seen.has(key)) throw new Error(`repeated line ${key}`);
  seen.add(key);
}
const noIsin = rows.filter((row) => !row.isin);
if (noIsin.length > 5) throw new Error(`${noIsin.length} lines have no ISIN`);
if (rows.filter((row) => row.type === "STOCK").length < 350) throw new Error("too few shares");
if (rows.filter((row) => row.type === "ETF").length < 65) throw new Error("too few ETFs");

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("yuh-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

if (leftOut.length) {
  console.error(`${leftOut.length} lines left out:\n${leftOut.join("\n")}`);
  console.error(`left out: ${[...leftOutWhy].map(([why, count]) => `${count} ${why}`).join(", ")}`);
}
const byBook = new Map();
for (const row of kept) {
  const key = `${row.exchange} ${row.type}`;
  byBook.set(key, (byBook.get(key) || 0) + 1);
}
console.error(
  `${kept.length} listings (${kept.filter((row) => row.type === "STOCK").length} STOCK, ${kept.filter((row) => row.type === "ETF").length} ETF; ` +
    `${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})`
);
