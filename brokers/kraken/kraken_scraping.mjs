// What Kraken sells in stocks, ETFs and coins, with no login. Two lists.
//
// Stocks and ETFs come from the markets page. A line is kept when it is
// tradable, enabled and active. Halted, sell-only and delisted lines are not
// for sale. The place is `exchange`. Kraken writes AMEX for NYSE American and
// ARCA for NYSE Arca, so AMEX is stored as XASE: the shared venue list reads
// a bare "AMEX" as Arca. A line with no place is left out. So is a right, a
// warrant, a SPAC unit and a note. An ETN stays. Kraken prints no ISIN, so
// the stock and ETF lists supply it, matched on the ticker and the place. A
// namesake on another exchange is not that line. The trading currency is the
// dollar.
//
// A French account on kraken.com/c does not get the US ETFs. Every ETF, ETC
// and ETN in this list is US-listed, so those lines are marked nonEuResident.
// Stocks are Kraken Securities. The page of 18 August 2026 offers them to
// US clients, Maine and New York aside, and to the EEA. The picker has no
// US state, so the US stays. The UK is not on that list, nor is anyone else.
//
// The same account can buy the token, IEMGx, which is not that ETF. Tokens
// come from the consumer catalogue (`tokenized_asset`). The ticker keeps the
// x. The ISIN is the underlying share's, so a search by ISIN still finds it.
// They are closed to the US, the UK, Canada and Australia. An EEA client
// passes a questionnaire first; that is not a ban, so France stays.
//
// Coins come from the public asset pairs. Only a pair whose status is online
// can be bought. Cancel-only and post-only cannot. EUR/USD and the other
// fiat pairs are not coins. Kraken still calls bitcoin XBT and dogecoin XDG.
//
//   https://iapi.kraken.com/api/internal/markets/all/equities
//   https://iapi.kraken.com/api/internal/consumer/search
//   https://api.kraken.com/0/public/AssetPairs
//   https://www.kraken.com/stocks
//   https://support.kraken.com/articles/getting-started-with-equities
//   https://support.kraken.com/articles/xstocks-availability
//
//   node brokers/kraken/kraken_scraping.mjs

import { accepts, COUNTRY_NAMES, EEA, stampRows } from "../../accepted.mjs";
import fs from "node:fs";

const EQUITIES = "https://iapi.kraken.com/api/internal/markets/all/equities";
const SEARCH = "https://iapi.kraken.com/api/internal/consumer/search?preferred_asset_name=new";
const PAIRS = "https://api.kraken.com/0/public/AssetPairs";
// One page. A smaller page leaves `exchange` blank on later pages, so those
// lines look unplaced when the full list names NASDAQ, NYSE, Arca or BATS.
const PAGE = 20000;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

// Kraken's own labels, then the MIC the venue list already knows.
const VENUES = {
  NASDAQ: "XNAS",
  XNAS: "XNAS",
  NYSE: "XNYS",
  XNYS: "XNYS",
  ARCA: "ARCX",
  ARCX: "ARCX",
  BATS: "BATS",
  AMEX: "XASE",
  XASE: "XASE",
  OTC: "OTC",
};

// The two names Kraken never adopted. Everything else is already the ticker.
const COIN_NAMES = { XBT: "BTC", XDG: "DOGE" };

const FIAT = new Set(["USD", "EUR", "GBP", "AUD", "CAD", "JPY", "CHF"]);

// Article of 18 June 2026. The English body does not name Belgium.
// A French sidebar does; a French account can still open IEMGx.
const XSTOCK_CLOSED = new Set(["US", "AU", "CA", "GB"]);
// Getting started with stocks, 18 August 2026. US plus the EEA. Not the UK.
const STOCK_COUNTRIES = ["US", ...EEA].sort();
const XSTOCK_COUNTRIES = Object.keys(COUNTRY_NAMES)
  .filter((code) => !XSTOCK_CLOSED.has(code) && accepts("kraken", code))
  .sort();

function coinTicker(code) {
  const text = String(code || "").trim().toUpperCase();
  return COIN_NAMES[text] || text;
}

// A right or a warrant titled as such. "the right to receive twenty shares"
// is an ADR, and stays. A unit that bundles a share with a right is not the share.
function aside(name, symbol) {
  const text = String(name || "");
  if (/\bWarrants?\b/i.test(text) || /\.WS$/i.test(symbol)) return "warrant";
  if (/Units, each consisting of/i.test(text)) return "unit";
  // "Rights to receive" is the right itself. "the right to receive twenty shares" is an ADR.
  if (/\.RT/i.test(symbol) || /\bRights?\s*[.,]?$/i.test(text) || /\bRights?\s*,/i.test(text)) return "right";
  if (/\bRights?\s+(?:to|that|each)\b/i.test(text) && !/representing the right to receive/i.test(text)) return "right";
  if (/\b(?:Senior |Junior |Subordinated |Secured )?(?:Notes?|Debentures?) due\b/i.test(text)) return "note";
  return "";
}

function listingType(row) {
  const name = String(row.name || "");
  if (row.subclass === "etf") {
    if (/\bETNs?\b/i.test(name)) return "ETN";
    if (/\bETCs?\b/i.test(name)) return "ETC";
    return "ETF";
  }
  if (row.subclass === "stock") return "STOCK";
  return "";
}

// The lists file Arca and NYSE American under AMEX, and Cboe BZX under CBOE.
const CSV_VENUES = {
  XNAS: ["NASDAQ"],
  XNYS: ["NYSE"],
  ARCX: ["AMEX"],
  BATS: ["CBOE", "AMEX"],
  XASE: ["AMEX"],
  OTC: ["OTC"],
};

const GENERIC_TOKENS = new Set([
  "LTD", "LIMITED", "PLC", "INC", "CORP", "CORPORATION", "LLC", "GMBH",
  "THE", "CO", "TRUST", "ETF", "SHARES", "CLASS", "COMMON", "STOCK",
]);

function toIsin(value) {
  const text = String(value || "").trim().toUpperCase();
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

// The lists write a preferred as ABR/PD. Kraken writes ABR.PRD.
function listTicker(value) {
  const text = String(value || "").trim().toUpperCase().split(":").pop();
  const preferred = text.match(/^([A-Z0-9]+)\/P([A-Z])$/);
  if (preferred) return `${preferred[1]}.PR${preferred[2]}`;
  return text;
}

function nameTokens(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token));
}

function tokensMatch(left, right) {
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 2 && longer.startsWith(shorter);
}

function nameScore(scraped, candidate) {
  const left = nameTokens(scraped);
  const right = nameTokens(candidate);
  if (left.length === 0 || right.length === 0) return 0;
  const used = new Set();
  let matched = 0;
  for (const token of left) {
    const index = right.findIndex((other, position) => !used.has(position) && tokensMatch(token, other));
    if (index >= 0) {
      used.add(index);
      matched += 1;
    }
  }
  return matched / Math.max(left.length, right.length);
}

function loadIsins(csvPath, into) {
  if (!fs.existsSync(csvPath)) return into;
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const ticker = listTicker(columns[0]);
    const isin = toIsin(columns[2]) || columns.map(toIsin).find(Boolean) || "";
    if (!ticker || !isin) continue;
    const exchange = String(columns[1] || "").trim().toUpperCase();
    const name = columns.slice(3).join(",").trim();
    const bucket = into.get(ticker) || [];
    const existing = bucket.find((row) => row.isin === isin);
    if (existing) {
      if (exchange) existing.exchanges.add(exchange);
      if (name && !existing.names.includes(name)) existing.names.push(name);
    } else {
      bucket.push({
        isin,
        names: name ? [name] : [],
        exchanges: new Set(exchange ? [exchange] : []),
      });
      into.set(ticker, bucket);
    }
  }
  return into;
}

const US_LISTED = new Set(["NASDAQ", "NYSE", "AMEX", "CBOE"]);

function pickIsin(rows, name, minScore, acceptSole) {
  if (rows.length === 0) return "";
  const isins = [...new Set(rows.map((row) => row.isin))];
  if (acceptSole && isins.length === 1) return isins[0];
  const scored = rows.map((row) => ({
    isin: row.isin,
    venues: row.exchanges.size,
    score: Math.max(0, ...row.names.map((candidate) => nameScore(name, candidate))),
  }));
  const best = Math.max(...scored.map((row) => row.score));
  if (!(best >= minScore)) return "";
  const byIsin = new Map();
  for (const row of scored) {
    if (row.score !== best) continue;
    const prev = byIsin.get(row.isin);
    if (!prev || row.venues > prev.venues) byIsin.set(row.isin, row);
  }
  const winners = [...byIsin.values()];
  if (winners.length === 1) return winners[0].isin;
  // The lists keep an old CUSIP beside the current one. The current ISIN
  // is the one repeated on the other venues.
  const most = Math.max(...winners.map((row) => row.venues));
  const popular = winners.filter((row) => row.venues === most);
  return popular.length === 1 ? popular[0].isin : "";
}

// One listing on this place is that ISIN. Several, and the name has to pick
// one. A ticker that the lists file on another American place still counts
// when the name is the same and there is only one such ISIN. A namesake
// abroad does not.
function resolveIsin(index, ticker, name, mic) {
  const candidates = index.get(ticker) || [];
  const allowed = new Set(CSV_VENUES[mic] || []);
  const sameVenue = candidates.filter((row) => [...row.exchanges].some((exchange) => allowed.has(exchange)));
  const onVenue = pickIsin(sameVenue, name, 0.5, true);
  if (onVenue) return onVenue;
  const american = candidates.filter((row) => [...row.exchanges].some((exchange) => US_LISTED.has(exchange)));
  return pickIsin(american, name, 0.8, false);
}

// Names for the coins the project already lists. A coin Kraken sells that is
// not in the file keeps its ticker as its name.
function loadCoinNames() {
  const names = new Map();
  const file = new URL("../../assets/cryptos.csv", import.meta.url);
  if (!fs.existsSync(file)) return names;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const ticker = coinTicker(columns[0]);
    const name = columns.slice(3).join(",").trim();
    if (ticker && name && !names.has(ticker)) names.set(ticker, name);
  }
  return names;
}

async function getJson(url, headers) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", ...headers },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

function unplaced(rows) {
  return rows.filter((row) => row.tradable && row.status === "active" && !row.exchange).length;
}

// The same call sometimes comes back with the place wiped on rows that have
// one. Keep the copy that leaves the fewest of those.
async function loadEquities() {
  let best = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const body = await getJson(
      `${EQUITIES}?page=0&page_size=${PAGE}&sort_by=market_cap&sort_order=descending&delayed=true`,
      { Referer: "https://www.kraken.com/", "X-Kraken-Asset-Name": "new" }
    );
    if (body.errors?.length) throw new Error(`Kraken equities: ${JSON.stringify(body.errors)}`);
    const data = body.result?.data;
    if (!Array.isArray(data)) throw new Error("Kraken equities returned no list");
    const total = body.result.total_results ?? data.length;
    if (data.length < total) {
      throw new Error(`Kraken returned ${data.length} of ${total} equities; raise PAGE`);
    }
    const blank = unplaced(data);
    if (!best || blank < best.blank) best = { data, blank };
    if (blank <= 160) break;
  }
  return best.data;
}

async function postJson(url, payload) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          "Content-Type": "application/json",
          Referer: "https://www.kraken.com/",
          "x-handler-environment": "stable",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

// The token shelf. One page is enough today; page until the catalogue says
// it has nothing left.
async function loadXstocks() {
  const docs = [];
  for (let page = 1; page <= 20; page += 1) {
    const body = await postJson(SEARCH, {
      collection: "acs_assets",
      search_params: {
        q: "*",
        query_by: "name",
        filter_by: "category:=tokenized_asset",
        include_fields: "symbol,full_name,subcategory,trading_status,linked_asset_symbol",
        per_page: 250,
        page,
      },
    });
    if (body.errors?.length) throw new Error(`Kraken xStocks: ${JSON.stringify(body.errors)}`);
    const hits = body.result?.hits || [];
    for (const hit of hits) if (hit.document) docs.push(hit.document);
    const found = body.result?.found ?? docs.length;
    if (docs.length >= found || hits.length === 0) break;
  }
  return docs;
}

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

const isins = loadIsins(new URL("../../assets/etfs.csv", import.meta.url), new Map());
loadIsins(new URL("../../assets/stocks.csv", import.meta.url), isins);

const seen = new Set();
const results = [];

function unsold(row) {
  if (row.instrument_status === "delisted") return "delisted";
  if (row.instrument_status === "sell_only") return "sell-only";
  if (row.status === "halted") return "halted";
  return "not for sale";
}

for (const row of await loadEquities()) {
  if (!row.tradable || row.instrument_status !== "enabled" || row.status !== "active") {
    skip(unsold(row));
    continue;
  }
  const symbol = String(row.symbol || "").trim().toUpperCase();
  if (!symbol) {
    skip("no ticker");
    continue;
  }
  const reason = aside(row.name, symbol);
  if (reason) {
    skip(reason);
    continue;
  }
  const type = listingType(row);
  if (!type) {
    skip("not a stock or ETF");
    continue;
  }
  const exchange = VENUES[String(row.exchange || "").trim().toUpperCase()];
  if (!exchange) {
    skip("no venue");
    continue;
  }
  const name = String(row.name || "").replace(/\s+/g, " ").trim() || symbol;
  const isin = resolveIsin(isins, symbol, name, exchange);
  const id = `${isin || symbol}:${exchange}:USD:${type}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const line = {
    query: symbol,
    ticker: symbol,
    name,
    exchange,
    currency: "USD",
    type,
    raw: [symbol, name, exchange, "USD", isin].filter(Boolean).join(" "),
    isin,
  };
  if (type === "ETF" || type === "ETC" || type === "ETN") line.nonEuResident = true;
  if (type === "STOCK") line.supportedCountries = STOCK_COUNTRIES;
  results.push(line);
}

const equityByTicker = new Map(results.map((line) => [line.ticker, line]));

for (const row of await loadXstocks()) {
  if (row.trading_status !== "tradable") {
    skip(row.trading_status || "token closed");
    continue;
  }
  const symbol = String(row.symbol || "").trim().toUpperCase();
  const linked = String(row.linked_asset_symbol || "").trim().toUpperCase();
  const type = row.subcategory === "etf" ? "ETF" : row.subcategory === "stock" ? "STOCK" : "";
  if (!symbol || !type) {
    skip("not an xStock");
    continue;
  }
  const underlying = equityByTicker.get(linked);
  const name = String(row.full_name || underlying?.name || symbol).replace(/\s+/g, " ").trim();
  const isin = underlying?.isin || "";
  const id = `${isin || symbol}:XSTOCK:USD:${type}`;
  if (seen.has(id)) continue;
  seen.add(id);
  results.push({
    query: symbol,
    ticker: symbol,
    name,
    exchange: "xStock",
    currency: "USD",
    type,
    raw: [symbol, name, "xStock", "USD", isin].filter(Boolean).join(" "),
    isin,
    xstock: true,
    nonUkResident: true,
    supportedCountries: XSTOCK_COUNTRIES,
  });
}

const coinNames = loadCoinNames();
const pairs = await getJson(PAIRS);
if (pairs.error?.length) throw new Error(`Kraken pairs: ${JSON.stringify(pairs.error)}`);
for (const pair of Object.values(pairs.result || {})) {
  if (pair.status !== "online") {
    skip(pair.status || "pair closed");
    continue;
  }
  const [baseRaw, quoteRaw] = String(pair.wsname || "").split("/");
  const base = coinTicker(baseRaw);
  const quote = coinTicker(quoteRaw);
  if (!base || !quote) {
    skip("no pair");
    continue;
  }
  if (FIAT.has(base)) {
    skip("forex");
    continue;
  }
  const id = `${base}:CRYPTO:${quote}:CRYPTO`;
  if (seen.has(id)) continue;
  seen.add(id);
  const name = coinNames.get(base) || base;
  results.push({
    query: base,
    ticker: base,
    name,
    exchange: "CRYPTO",
    currency: quote,
    type: "CRYPTO",
    raw: [pair.wsname, name, quote].filter(Boolean).join(" "),
    isin: "",
  });
}

results.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  const byTicker = left.ticker.localeCompare(right.ticker);
  if (byTicker !== 0) return byTicker;
  return left.currency.localeCompare(right.currency);
});

fs.writeFileSync(
  new URL("kraken-parsed.json", import.meta.url),
  JSON.stringify(stampRows(results), null, 2)
);

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const equities = results.filter((row) => row.type !== "CRYPTO");
const named = equities.filter((row) => row.isin).length;
console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    `, ISIN on ${named} of ${equities.length} stocks and ETFs` +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
