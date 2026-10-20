// What Slovenská sporiteľňa (Erste Group, Slovakia) sells online in George:
// shares, ETFs and ETCs/ETPs, with no login.
//
// The bank's public lists are the "Zoznam akcií" page with the filter
// "Obchodovateľné v Georgeovi" (tradable in George) and the ETF page with the
// fund type ETF. Both pages are shells: the lists are Erste's market-data
// GraphQL API (migDataEndpoint in the page config), which answers without a
// login and is read here directly.
//
//   https://www.slsp.sk/sk/ludia/investovanie/investicna-zona/financne-trhy/zoznam-akcii?tradeable=true
//   https://www.slsp.sk/sk/ludia/investovanie/investicna-zona/financne-trhy/zoznam-etf-fondov?fundTypes=etf
//   https://mig.erstegroup.com/gql/sk-mdp/
//
// Shares are searchStocks(tradeable: true), the query the share page sends
// (about 900 lines). ETFs are searchFunds(tradeable: true, exchangeTradeable:
// true), what the ETF page sends with its pre-selected type "ETF" and the
// George filter (about 270 lines). The ETC/ETP list is the pair of tables
// under the "ETC/ETP" heading of the ETF page: their notation ids are in the
// page's own config, and each is read from the API. A line the API does not
// mark tradeable is left out. A line whose name says ETN is an ETN; ETC or
// ETP, or an ETC/ETP-table line, an ETC; the rest of the fund list are ETFs;
// the share list is STOCK.
//
// Place. George lets the client pick the market of an order and preselects
// the bank's "Best execution" market ("Niektoré akcie a ETF fondy sú
// obchodované na viacerých burzách. Klientovi predvolíme Best execution
// trh", the share page's FAQ). No public page says which markets George
// offers for one title, and the API's default quote is the data vendor's
// choice, not the order's market: it shows Polish banks on Frankfurt in EUR,
// Spanish shares on the LSE trade-reporting line and Norwegian ones on First
// North Stockholm or FINRA OTC, none of them a venue the bank uses. So the
// places are the venues the bank names for shares and exchange-traded
// products, in its execution policy and its investing conditions (the same
// list is in broker-list.json), and a title gets one row per listing it has
// on those venues:
//
//   https://www.slsp.sk/content/dam/sk/slsp/www_slsp_sk/documents/Ine/mifid-brozura-web.pdf (section 10)
//   https://www.slsp.sk/content/dam/sk/slsp/www_slsp_sk/documents/zverejnenia/podmienky-investovania-do-cennych-papierov.pdf
//
//   ASX, Bolsa de Madrid, Borsa Italiana, Berlin, Düsseldorf, Hannover,
//   München, Stuttgart, Budapest, Prague, Bratislava, Euronext Amsterdam,
//   Brussels, Oslo and Paris, Frankfurt, Hamburg, London, Nasdaq, Copenhagen,
//   Helsinki, Stockholm, NYSE, NYSE American, NYSE Arca, Toronto, TSX
//   Venture, Vienna, Warsaw, Xetra, SIX. ERSTE Smart (Erste's own market,
//   the only one for fractional buys) is no exchange and gets no row.
//
// The listings are the title's allNotations in the same API, each with its
// own symbol and currency. Notations on any other market (Tradegate,
// EuroTLX, gettex, LSE European Trade Reporting, First North, FINRA OTC,
// Stuttgart's technical platform, Mountain-View) are left out. The vendor
// carries no quote at all for some of the bank's venues (Madrid, Oslo,
// Warsaw, Toronto, TSX Venture, ASX, NYSE American this year): for a venue
// on which no title of the run has a single notation, the listing comes
// from the repository's listing files (assets/stocks.csv, assets/etfs.csv)
// by ISIN, in that venue's own currency, and `raw` says so. Those files put
// GPW GlobalConnect lines (Apple, SAP... in zloty) under GPW too; the bank
// names the Warsaw exchange, not GlobalConnect, so a Warsaw line whose ISIN
// is on GlobalConnect's company list is left out. Berlin has neither a
// vendor quote nor a listing file and gets no row.
//
//   https://gpwglobalconnect.pl/spolki
//
// US venues are one NBBO market: a US title is one row, on its US listing
// exchange (the default quote's when it is a US one), in USD. No
// broker-list.json restriction is applied: the bank's own pages state none,
// and its "tradeable in George" flag already says what it sells.
//
// Currency. Each notation has its own; GBp is written GBX. A venue's home
// currency line is always kept. Another currency line on the same venue
// (SIX in USD or EUR, London in USD, Xetra in USD) is kept only when it is a
// currency a George account can be held in: EUR, and the SPACE účet MINI
// in USD, CZK, GBP, HUF or PLN. The CHF and CAD SPOROžíro accounts are no
// longer sold. A trade in another currency is converted at the bank's rate.
//
//   https://www.slsp.sk/content/dam/sk/slsp/www_slsp_sk/documents/zverejnenia/zverejnenie-spotrebitel-ucty.pdf
//
//   node brokers/slsp/slsp_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";
import https from "node:https";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SITE = "https://www.slsp.sk";
const STOCK_PAGE = `${SITE}/sk/ludia/investovanie/investicna-zona/financne-trhy/zoznam-akcii?tradeable=true`;
const ETF_PAGE = `${SITE}/sk/ludia/investovanie/investicna-zona/financne-trhy/zoznam-etf-fondov?fundTypes=etf`;
const OUTPUT = new URL("slsp-parsed.json", import.meta.url);
const WORKERS = 4;
const BATCH = 20; // allNotations for more than about 20 titles is "too complex"
const PAGE = 100;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const ACCOUNT = new Set(["EUR", "USD", "CZK", "GBP", "HUF", "PLN"]);

// The vendor's market id -> the bank's venue: [exchange, MIC, home currency].
const MARKET = {
  1: ["Börse Xetra", "XETR", "EUR"],
  2: ["Börse Frankfurt", "XFRA", "EUR"],
  9: ["Börse Stuttgart", "XSTU", "EUR"],
  14: ["Börse Düsseldorf", "XQTX", "EUR"],
  15: ["Börse München", "XMUC", "EUR"],
  17: ["Börse Berlin", "XBER", "EUR"],
  19: ["Börse Hamburg", "XHAM", "EUR"],
  20: ["Börse Hannover", "XHAN", "EUR"],
  33: ["Euronext Paris", "XPAR", "EUR"],
  34: ["Euronext Amsterdam", "XAMS", "EUR"],
  35: ["Euronext Brussels", "XBRU", "EUR"],
  42: ["New York Stock Exchange", "XNYS", "USD"],
  46: ["NYSE American", "XASE", "USD"],
  72: ["London Stock Exchange", "XLON", "GBX"],
  74: ["Euronext Milan", "XMIL", "EUR"],
  78: ["Nasdaq", "XNAS", "USD"],
  86: ["Nasdaq Copenhagen", "XCSE", "DKK"],
  87: ["Nasdaq Helsinki", "XHEL", "EUR"],
  92: ["Nasdaq Stockholm", "XSTO", "SEK"],
  107: ["ASX", "XASX", "AUD"],
  138: ["Wiener Börse", "XWBO", "EUR"],
  139: ["Warsaw Stock Exchange", "XWAR", "PLN"],
  143: ["Toronto Stock Exchange", "XTSE", "CAD"],
  145: ["TSX Venture", "XTSX", "CAD"],
  176: ["Bolsa de Madrid", "XMAD", "EUR"],
  189: ["SIX Swiss Exchange", "XSWX", "CHF"],
  233: ["Bratislava Stock Exchange", "XBRA", "EUR"],
  235: ["Budapest Stock Exchange", "XBUD", "HUF"],
  336: ["Prague Stock Exchange", "XPRA", "CZK"],
};
// Vendor names for markets whose id is not in its own market list.
const MARKET_BY_NAME = {
  "nyse arca": ["NYSE Arca", "ARCX", "USD"],
  "euronext oslo": ["Oslo Børs", "XOSL", "NOK"],
  "oslo bors": ["Oslo Børs", "XOSL", "NOK"],
};
const US = new Set(["XNYS", "XNAS", "XASE", "ARCX"]);
// The listing-file exchange code for a bank venue, when the vendor has none.
const FILE_CODE = {
  XMAD: "BME",
  XOSL: "OSL",
  XWAR: "GPW",
  XTSE: "TSX",
  XTSX: "TSXV",
  XASX: "ASX",
  XASE: "AMEX",
};
const FILE_VENUE = {
  XASE: ["NYSE American", "XASE", "USD"],
  XMAD: ["Bolsa de Madrid", "XMAD", "EUR"],
  XOSL: ["Oslo Børs", "XOSL", "NOK"],
  XWAR: ["Warsaw Stock Exchange", "XWAR", "PLN"],
  XTSE: ["Toronto Stock Exchange", "XTSE", "CAD"],
  XTSX: ["TSX Venture", "XTSX", "CAD"],
  XASX: ["ASX", "XASX", "AUD"],
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(url, init = {}, tries = 5) {
  let last = "";
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "User-Agent": UA, "Accept-Language": "sk,en;q=0.8", ...(init.headers || {}) },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

let endpoint = "";
async function gql(query, variables = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const text = await request(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Origin: SITE, Referer: `${SITE}/` },
      body: JSON.stringify({ query, variables }),
    });
    const body = JSON.parse(text);
    if (!body.errors?.length && body.data) return body.data;
    last = JSON.stringify(body.errors).slice(0, 400);
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(`GraphQL: ${last}`);
}

async function pool(items, task) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      out[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));
  return out;
}

// The gem+json config blocks of a page.
function configs(html) {
  return [...html.matchAll(/<script type="application\/gem\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap((match) => {
    try {
      return [JSON.parse(match[1])];
    } catch {
      return [];
    }
  });
}

const STOCKS = `query Stocks($limit: Int!, $offset: Int!) {
  searchStocks(tradeable: true, language: SK, sort: [], limit: $limit, offset: $offset) {
    totalCount
    objects { isin name { custom } tradeable class { hierarchy { customSubclass } } notation { id } }
  }
}`;
const FUNDS = `query Funds($limit: Int!, $offset: Int!) {
  searchFunds(tradeable: true, exchangeTradeable: true, language: SK, limit: $limit, offset: $offset) {
    totalCount
    objects { isin name { custom } class { hierarchy { customSubclass } } notation { id } }
  }
}`;
const NOTATIONS = `query Notations($ids: [NotationId!]!) {
  instruments(notationIds: $ids, language: SK) {
    isin tradeable name { custom } class { hierarchy { customClass customSubclass } }
    notation { id market { id name } }
    allNotations { objects { id symbol market { id name } currency { code } } }
  }
}`;

async function search(query, field) {
  const lines = [];
  let total = Infinity;
  for (let offset = 0; offset < total; offset += PAGE) {
    const data = (await gql(query, { limit: PAGE, offset }))[field];
    total = data.totalCount;
    lines.push(...data.objects);
    if (!data.objects.length) break;
  }
  if (lines.length !== total) throw new Error(`${field} says ${total} lines, ${lines.length} read`);
  return lines;
}

async function details(ids) {
  const batches = [];
  for (let index = 0; index < ids.length; index += BATCH) batches.push(ids.slice(index, index + BATCH));
  const out = await pool(batches, async (batch) => (await gql(NOTATIONS, { ids: batch })).instruments);
  return out.flat();
}

function venueOf(market) {
  return MARKET[market?.id] || MARKET_BY_NAME[String(market?.name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")] || null;
}

// MMM-USA, SGLD.USD-SWX, 0QNY-, XVIE_<ISIN>, or the ISIN itself.
function tickerOf(symbol, isin) {
  let text = String(symbol || "").trim();
  if (!text || text.startsWith("XVIE_") || text.startsWith("XPRA_") || ISIN.test(text)) return isin;
  text = text.replace(/-[A-Z]{0,5}$/, "").replace(/\.(USD|EUR|GBP|GBX|CHF|JPY|SEK|SGD)$/, "");
  return text || isin;
}

function typeOf(name, list, subclass) {
  if (list === "stock") return "STOCK";
  if (/\bETN\b/i.test(name)) return "ETN";
  if (list === "etc" || /\b(ETC|ETP)\b/i.test(name) || subclass === "CERTIFICATE") return "ETC";
  return "ETF";
}

// assets/stocks.csv and assets/etfs.csv: "CODE|ISIN" -> [{ticker, name}].
function listingFiles() {
  const book = new Map();
  for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
    for (const line of fs.readFileSync(new URL(file, import.meta.url), "utf8").split(/\r?\n/)) {
      const cells = line.split(",");
      const code = String(cells[1] || "").trim().toUpperCase();
      const isin = String(cells[2] || "").trim().toUpperCase();
      if (!Object.values(FILE_CODE).includes(code) || !ISIN.test(isin)) continue;
      const key = `${code}|${isin}`;
      if (!book.has(key)) book.set(key, []);
      book.get(key).push({ ticker: String(cells[0] || "").split(":").slice(1).join(":").trim(), name: cells.slice(3).join(",").replace(/"/g, "") });
    }
  }
  return book;
}

// GlobalConnect's company list: the ISINs it quotes. GPW resets fetch's
// client; node's HTTP/1.1 request is the one it answers.
function globalConnectPost(body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "gpwglobalconnect.pl",
        path: "/ajaxindex.php",
        method: "POST",
        ALPNProtocols: ["http/1.1"],
        headers: {
          "User-Agent": UA,
          Accept: "text/html,*/*",
          "Accept-Language": "pl,en;q=0.8",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => (res.statusCode === 200 ? resolve(Buffer.concat(chunks).toString("utf8")) : reject(new Error(`GlobalConnect answered ${res.statusCode}`))));
      }
    );
    req.on("error", reject);
    req.setTimeout(40_000, () => req.destroy(new Error("timeout")));
    req.end(body);
  });
}

async function globalConnect() {
  const body = "format=html&lang=PL&offset=0&limit=500&action=GCCompany&start=listAjax&order=gls_nazwa&order_type=ASC&searchText=";
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const html = await globalConnectPost(body);
      const isins = new Set([...html.matchAll(/isin=([A-Z0-9]{12})/g)].map((match) => match[1]).filter((isin) => ISIN.test(isin)));
      if (isins.size >= 30) return isins;
      last = `GlobalConnect list has only ${isins.size} ISINs`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

const skipped = new Map();
function skip(reason, count = 1) {
  skipped.set(reason, (skipped.get(reason) || 0) + count);
}

// The pages: the API endpoint, the share list's George filter, and the
// ETC/ETP tables' notation ids.
const stockPage = await request(STOCK_PAGE, { headers: { Accept: "text/html" } });
const etfPage = await request(ETF_PAGE, { headers: { Accept: "text/html" } });
endpoint = stockPage.match(/"migDataEndpoint":"([^"]+)"/)?.[1] || "";
if (!/^https:\/\/mig\.erstegroup\.com\//.test(endpoint)) throw new Error(`the share page names no market-data endpoint (${endpoint})`);
const stockSearch = configs(stockPage).find((config) => config.filters?.tradableFilterLabel && config.searchResultsFields?.instrumentClass1 === "STOCK");
if (!stockSearch) throw new Error("the share page has no share search with a George filter");
const etfSearch = configs(etfPage).find((config) => config.filters?.preSelectedFundType === "ETF");
if (!etfSearch?.filters?.tradableFilterLabel) throw new Error("the ETF page has no ETF search with a George filter");
const etcIds = configs(etfPage)
  .filter((config) => config.type === "INSTRUMENT_MANAGER_LIST")
  .flatMap((config) => config.instruments?.primary || []);
if (etcIds.length < 5) throw new Error(`the ETF page lists only ${etcIds.length} ETC/ETP lines`);

const stockLines = await search(STOCKS, "searchStocks");
const fundLines = await search(FUNDS, "searchFunds");
if (stockLines.length < 800) throw new Error(`only ${stockLines.length} shares tradable in George`);
if (fundLines.length < 200) throw new Error(`only ${fundLines.length} ETFs tradable in George`);
console.error(`${stockLines.length} shares, ${fundLines.length} ETFs, ${etcIds.length} ETC/ETP lines`);

// One title per ISIN: the share list first, then the ETF list, then the ETC tables.
const titles = new Map();
for (const [list, lines] of [["stock", stockLines], ["etf", fundLines]]) {
  for (const line of lines) {
    if (titles.has(line.isin)) {
      skip("same ISIN in two lists");
      continue;
    }
    titles.set(line.isin, { list, isin: line.isin, name: line.name?.custom || line.isin, id: line.notation?.id });
  }
}
const titleList = [...titles.values()];
const byIsin = new Map();
for (const instrument of await details(titleList.map((title) => title.id))) {
  if (instrument?.isin) byIsin.set(instrument.isin, instrument);
}
for (const instrument of await details(etcIds)) {
  const isin = instrument?.isin;
  if (!isin) continue;
  if (titles.has(isin)) {
    skip("ETC/ETP line already in a list");
    continue;
  }
  const title = { list: "etc", isin, name: instrument.name?.custom || isin, id: instrument.notation?.id };
  titles.set(isin, title);
  titleList.push(title);
  byIsin.set(isin, instrument);
}

// Which of the bank's venues the vendor quotes at all in this run.
const quoted = new Set();
const otherMarkets = new Map();
for (const instrument of byIsin.values()) {
  for (const notation of instrument.allNotations?.objects || []) {
    const venue = venueOf(notation.market);
    if (venue) quoted.add(venue[1]);
    else otherMarkets.set(notation.market?.name, (otherMarkets.get(notation.market?.name) || 0) + 1);
  }
}
const blind = Object.keys(FILE_CODE).filter((mic) => !quoted.has(mic));
const files = blind.length ? listingFiles() : new Map();
const onGlobalConnect = blind.includes("XWAR") ? await globalConnect() : new Set();
console.error(`venues the vendor does not quote, read from the listing files: ${blind.join(", ") || "none"}`);

const rows = [];
const seen = new Set();
const fromFiles = {};
function push(title, type, [exchange, mic, home], { ticker, currency, extra }) {
  if (currency !== home && !ACCOUNT.has(currency)) return skip(`${mic} line in ${currency}, not an account currency`);
  const key = `${title.isin}|${US.has(mic) ? "US" : mic}|${currency}`;
  if (seen.has(key)) return skip("same place and currency twice");
  seen.add(key);
  rows.push({
    query: title.isin,
    ticker,
    name: title.name,
    exchange,
    mic,
    currency,
    type,
    isin: title.isin,
    raw: [title.name, title.isin, ...extra].filter(Boolean).join(" | "),
  });
  return true;
}

for (const title of titleList) {
  const instrument = byIsin.get(title.isin);
  if (!instrument) {
    skip("notation the API does not return");
    continue;
  }
  if (!instrument.tradeable) {
    skip("not tradeable in George");
    continue;
  }
  const type = typeOf(title.name, title.list, instrument.class?.hierarchy?.customSubclass);
  const notations = [...(instrument.allNotations?.objects || [])];
  // The default quote first, so a US title keeps the default's exchange.
  notations.sort((left, right) => (right.id === instrument.notation?.id) - (left.id === instrument.notation?.id));
  let placed = 0;
  let usDone = false;
  for (const notation of notations) {
    const venue = venueOf(notation.market);
    if (!venue) continue;
    if (US.has(venue[1])) {
      if (usDone) continue;
      usDone = true;
    }
    const currency = notation.currency?.code === "GBp" ? "GBX" : String(notation.currency?.code || "").toUpperCase();
    const ok = push(title, type, venue, {
      ticker: tickerOf(notation.symbol, title.isin),
      currency,
      extra: [notation.market?.name, notation.symbol, notation.currency?.code, notation.id, notation.id === instrument.notation?.id ? "default quote" : ""],
    });
    if (ok) placed += 1;
  }
  for (const mic of blind) {
    for (const hit of files.get(`${FILE_CODE[mic]}|${title.isin}`) || []) {
      if (mic === "XWAR" && onGlobalConnect.has(title.isin)) {
        skip("GPW GlobalConnect line in the listing file");
        continue;
      }
      // The listing files file NYSE Arca's exchange-traded products under AMEX.
      const venue = mic === "XASE" && type !== "STOCK" ? ["NYSE Arca", "ARCX", "USD"] : FILE_VENUE[mic];
      if (push(title, type, venue, { ticker: hit.ticker, currency: venue[2], extra: [`listing file ${FILE_CODE[mic]}:${hit.ticker}`, hit.name] })) {
        placed += 1;
        fromFiles[mic] = (fromFiles[mic] || 0) + 1;
      }
    }
  }
  if (!placed) {
    skip("no listing on a venue the bank uses");
    console.error(`unplaced: ${title.isin} ${title.name} (${notations.map((n) => `${n.market?.name} ${n.currency?.code}`).join(", ")})`);
  }
}

// Every place must be one the venue registry knows, under the same MIC.
const unresolved = new Map();
for (const row of rows) {
  const { venue } = resolveVenue(row);
  if (!venue || venue.mic !== row.mic) {
    const key = `${row.exchange} ${row.mic} ${row.currency} -> ${venue?.mic || "none"}`;
    unresolved.set(key, (unresolved.get(key) || 0) + 1);
  }
}

const has = (isin, mic) => rows.some((row) => row.isin === isin && row.mic === mic);
if (!has("US0378331005", "XNAS")) throw new Error("Apple on Nasdaq is missing");
if (!has("DE0007164600", "XETR")) throw new Error("SAP on Xetra is missing");
if (!rows.some((row) => row.type === "ETF" && row.mic === "XETR")) throw new Error("no Xetra ETF");
if (!rows.some((row) => row.type === "ETC")) throw new Error("no ETC");

rows.sort((left, right) => left.name.localeCompare(right.name) || left.exchange.localeCompare(right.exchange) || left.currency.localeCompare(right.currency));
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) {
  const key = `${row.exchange} ${row.mic} ${row.type} ${row.currency}`;
  counts[key] = (counts[key] || 0) + 1;
}
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
console.error(`markets left out: ${[...otherMarkets].sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name} ${count}`).join(", ")}`);
console.error(`rows from the listing files: ${JSON.stringify(fromFiles)}`);
console.error(`left out: ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}`);
console.error(`unresolved venues: ${[...unresolved].map(([key, count]) => `${key} (${count})`).join(", ") || "none"}`);
console.error(`${rows.length - kept.length} rows dropped by withoutObligations`);
console.error(`${kept.length} rows for ${new Set(kept.map((row) => row.isin)).size} titles, ${kept.filter((row) => ISIN.test(row.isin)).length} with an ISIN`);
