import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function csvTicker(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  return (afterExchange || "").split("/")[0].trim();
}

// eToro appends a venue to symbols that would otherwise collide — T.US is AT&T,
// 1810.HK is Xiaomi, VUSA.NV is the Amsterdam line of VUSA. Class shares keep
// the dot (BRK.B) because B is not a venue.
const VENUE_SUFFIXES = new Set([
  "L",
  "DE",
  "PA",
  "ASX",
  "ST",
  "OL",
  "HK",
  "US",
  "T",
  "MI",
  "HE",
  "CO",
  "NV",
  "BR",
  "ZU",
  "MC",
  "VI",
  "DH",
  "AE",
  "LS",
  "LSB",
  "IM",
  "AS",
]);

const SKIP_SUFFIXES = new Set(["RTH", "CVR", "OLD", "TEST", "24-7", "EUR", "WS", "PFD", "MOEX", "THS"]);

// .CH is eToro's marker for a US-listed Chinese ADR, not a venue; the price
// source still names NASDAQ.
const COSMETIC_SUFFIXES = new Set(["CH"]);

function listingTicker(symbol) {
  const text = csvTicker(symbol);
  if (!text) return { ticker: "", suffix: "" };

  const parts = text.split(".");
  if (parts.length < 2) return { ticker: text, suffix: "" };

  const suffix = parts[parts.length - 1];
  if (VENUE_SUFFIXES.has(suffix) || COSMETIC_SUFFIXES.has(suffix)) {
    return { ticker: parts.slice(0, -1).join("."), suffix: VENUE_SUFFIXES.has(suffix) ? suffix : "" };
  }
  return { ticker: text, suffix: "" };
}

// LSE files some tickers with a trailing dot (BP.), Nordic class shares use an
// underscore (ELUX_B) where eToro writes a hyphen or concatenates the letter,
// and Hong Kong drops the leading zero.
function tickerAliases(ticker) {
  const aliases = new Set([ticker]);
  if (ticker && !ticker.endsWith(".")) aliases.add(`${ticker}.`);
  if (ticker.includes("-")) aliases.add(ticker.replace(/-/g, "_"));
  if (ticker.includes("_")) aliases.add(ticker.replace(/_/g, "-"));
  if (/^0+\d+$/.test(ticker)) aliases.add(ticker.replace(/^0+/, ""));
  const classShare = ticker.match(/^([A-Z]{2,})([ABC])$/);
  if (classShare) aliases.add(`${classShare[1]}_${classShare[2]}`);
  return [...aliases];
}

function pathArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return fallback ? new URL(fallback, import.meta.url) : "";
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

// The CSV rows are `ticker,exchange,isin,name`; one ISIN recurs across venues
// under differently worded names, so every spelling and venue is kept and the
// closest wording decides a match. Crypto rows often have no ISIN.
function loadTickerCandidatesFromCsv(csvPath, kind) {
  const map = new Map();
  if (!csvPath || !fs.existsSync(csvPath)) return map;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const ticker = csvTicker(columns[0]);
    if (!ticker) continue;

    const isin = toIsin(columns[2]) || columns.map(toIsin).find(Boolean) || "";
    if (!isin && kind !== "CRYPTO") continue;

    const exchange = normalize(columns[1]).toUpperCase();
    const name = normalize(columns.slice(3).join(",")) || ticker;

    const candidates = map.get(ticker) || [];
    map.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
      if (exchange) existing.exchanges.add(exchange);
    } else {
      candidates.push({
        isin,
        kind,
        names: [name],
        exchanges: new Set(exchange ? [exchange] : []),
      });
    }
  }

  return map;
}

// Legal-entity suffixes are shared by unrelated funds, so counting them would
// let a same-ticker instrument pass for the one being looked up.
const GENERIC_TOKENS = new Set([
  "LTD",
  "LIMITED",
  "PLC",
  "INC",
  "CORP",
  "CORPORATION",
  "LLC",
  "GMBH",
  "THE",
  "CO",
  "TRUST",
]);

function nameTokens(value) {
  return normalize(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token));
}

// Fund names are shortened inconsistently between sources ("Small Cap" against
// "Small-Ca"), so tokens are compared by prefix rather than equality.
function tokensMatch(left, right) {
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 2 && longer.startsWith(shorter);
}

function nameScore(scrapedName, candidateName) {
  const scraped = nameTokens(scrapedName);
  const candidate = nameTokens(candidateName);
  if (scraped.length === 0 || candidate.length === 0) return 0;

  const used = new Set();
  let matched = 0;
  for (const token of scraped) {
    const index = candidate.findIndex(
      (other, position) => !used.has(position) && tokensMatch(token, other)
    );
    if (index >= 0) {
      used.add(index);
      matched += 1;
    }
  }
  return matched / Math.max(scraped.length, candidate.length);
}

function scoreCandidate(scrapedName, candidate) {
  let best = { score: 0, name: candidate.names[0] || "" };
  for (const name of candidate.names) {
    const score = nameScore(scrapedName, name);
    if (score > best.score) best = { score, name };
  }
  return best;
}

const MIN_NAME_SCORE = 0.5;

// eToro prices every US listing off "NASDAQ" and lumps European ones by
// operator, so each price source expands to the CSV venue codes it can cover;
// the fund's own listing then narrows it down. A suffix on the symbol, when
// present, is the tighter of the two.
const PRICE_SOURCE_VENUES = {
  NASDAQ: ["NASDAQ", "AMEX", "NYSE", "CBOE", "OTC"],
  "OTC Markets": ["OTC", "NASDAQ", "AMEX", "NYSE"],
  eToro: ["NASDAQ", "AMEX", "NYSE", "CBOE", "OTC"],
  Xetra: ["XETR"],
  "LSE PLC": ["LSE", "LSIN"],
  Euronext: ["EURONEXT"],
  "CBOE EU": ["EURONEXT", "XETR", "LSE", "SIX", "MIL", "BME", "VIE"],
  "CBOE AUS": ["ASX"],
  HKEX: ["HKEX"],
  ADX: ["ADX"],
  DFM: ["DFM"],
  Tokyo: ["TSE"],
  "Nasdaq Nordic": ["OMXSTO", "OMXHEX", "OMXCOP", "OMXTSE", "OSL"],
};

const SUFFIX_VENUES = {
  L: ["LSE", "LSIN"],
  DE: ["XETR"],
  PA: ["EURONEXT"],
  ASX: ["ASX"],
  ST: ["OMXSTO"],
  OL: ["OSL"],
  HK: ["HKEX"],
  US: ["NASDAQ", "AMEX", "NYSE", "CBOE", "OTC"],
  T: ["TSE"],
  MI: ["MIL"],
  HE: ["OMXHEX"],
  CO: ["OMXCOP"],
  NV: ["EURONEXT"],
  BR: ["EURONEXT"],
  ZU: ["SIX"],
  MC: ["BME"],
  VI: ["VIE"],
  DH: ["ADX"],
  AE: ["DFM"],
  LS: ["EURONEXT"],
  LSB: ["EURONEXT"],
  IM: ["MIL"],
  AS: ["EURONEXT"],
};

function venuesFor(priceSource, suffix) {
  const fromSource = PRICE_SOURCE_VENUES[priceSource] || [];
  const fromSuffix = SUFFIX_VENUES[suffix] || [];
  if (fromSuffix.length === 0) return fromSource;
  if (fromSource.length === 0) return fromSuffix;
  const allowed = new Set(fromSource);
  const overlap = fromSuffix.filter((venue) => allowed.has(venue));
  return overlap.length > 0 ? overlap : fromSuffix;
}

// Only EU-domiciled (UCITS) ETFs may be sold to European retail as the real
// fund; everything else -- US listings above all -- reaches them as a CFD. The
// price source eToro assigns is a faithful stand-in for that line.
const REAL_ETF_SOURCES = new Set(["Xetra", "LSE PLC", "Euronext", "CBOE EU"]);

const INSTRUMENT_TYPES = {
  1: "FX",
  2: "CMDTY",
  4: "INDEX",
  5: "STOCK",
  6: "ETF",
  10: "CRYPTO",
};

// IDs that never appear as an FX leg: 666 is pence on the LSE, 545 the UAE
// dirham, 111 the Saudi riyal.
const EXTRA_CURRENCIES = new Map([
  [111, "SAR"],
  [545, "AED"],
  [666, "GBX"],
]);

// Every FX pair names its two cash legs, and those numeric IDs are the same
// ones stocks and funds use as SellCurrencyID.
function loadCurrencyNames(instruments, tradeById) {
  const names = new Map(EXTRA_CURRENCIES);
  for (const instrument of instruments) {
    if (instrument.InstrumentTypeID !== 1) continue;
    const symbol = csvTicker(instrument.SymbolFull);
    if (!/^[A-Z]{6}$/.test(symbol) || /BTC|ETH|XRP|BCH|LTC|ZEC|DASH|XLM/.test(symbol)) continue;
    const rules = tradeById.get(instrument.InstrumentID);
    if (!rules) continue;
    if (!names.has(rules.BuyCurrencyID)) names.set(rules.BuyCurrencyID, symbol.slice(0, 3));
    if (!names.has(rules.SellCurrencyID)) names.set(rules.SellCurrencyID, symbol.slice(3, 6));
  }
  return names;
}

// A tracker shelf is ETFs, ETCs and ETNs together, and only the name says which.
function refineType(type, name) {
  if (type !== "ETF") return type;
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  return "ETF";
}

// A shared ticker is not a shared fund. When the listing venue eToro implies
// matches where the CSV carries the ticker, the venue settles it and a verbose
// legal name need not be re-derived; without venue agreement the name must
// carry the match so a cross-border ticker clash cannot slip through.
function resolveListing(tickerCandidates, ticker, name, venues) {
  const candidates = [];
  const seen = new Set();
  for (const alias of tickerAliases(ticker)) {
    for (const candidate of tickerCandidates.get(alias) || []) {
      const key = `${candidate.isin}:${[...candidate.exchanges].sort().join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
    }
  }
  if (candidates.length === 0) return null;

  const allowed = new Set(venues || []);
  const sameVenue =
    allowed.size > 0
      ? candidates.filter((candidate) => [...candidate.exchanges].some((exchange) => allowed.has(exchange)))
      : [];
  const shortlist = sameVenue.length > 0 ? sameVenue : candidates;

  const scored = shortlist.map((candidate) => ({
    candidate,
    isin: candidate.isin,
    ...scoreCandidate(name, candidate),
  }));

  const bestScore = Math.max(0, ...scored.map((entry) => entry.score));
  if (sameVenue.length === 0 && bestScore < MIN_NAME_SCORE) return null;

  let winner;
  if (scored.length === 1) {
    winner = scored[0];
  } else {
    const winners = scored.filter((entry) => entry.score === bestScore);
    if (winners.length !== 1) return null;
    winner = winners[0];
  }

  const exchange =
    [...winner.candidate.exchanges].find((code) => allowed.has(code)) ||
    [...winner.candidate.exchanges][0] ||
    "";
  return { isin: winner.isin, name: winner.name, exchange, kind: winner.candidate.kind };
}

// eToro names some Xetra trackers with a Bloomberg-style symbol (INDUEX, SXXPIEX)
// that the CSV never uses. When the ticker cannot answer, a unique name on that
// venue is still a match.
function resolveByName(tickerCandidates, name, venues) {
  const allowed = new Set(venues || []);
  if (allowed.size === 0) return null;

  const scored = [];
  for (const candidates of tickerCandidates.values()) {
    for (const candidate of candidates) {
      if (![...candidate.exchanges].some((exchange) => allowed.has(exchange))) continue;
      const ranked = scoreCandidate(name, candidate);
      if (ranked.score < 0.75) continue;
      scored.push({ candidate, isin: candidate.isin, ...ranked });
    }
  }
  if (scored.length === 0) return null;
  if (new Set(scored.map((entry) => entry.isin)).size !== 1) return null;

  const winner = scored.sort((left, right) => right.score - left.score)[0];
  const exchange =
    [...winner.candidate.exchanges].find((code) => allowed.has(code)) ||
    [...winner.candidate.exchanges][0] ||
    "";
  return { isin: winner.isin, name: winner.name, exchange, kind: winner.candidate.kind };
}

const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const etfsOnly = hasFlag("etfs-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepEverything = hasFlag("all");

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;
const wantCrypto = !etfsOnly && !stocksOnly;
const wantCfdBook = keepEverything && !etfsOnly && !stocksOnly && !cryptoOnly;

const catalogues = {
  STOCK: wantStocks ? loadTickerCandidatesFromCsv(stocksCsvPath, "STOCK") : new Map(),
  ETF: wantEtfs ? loadTickerCandidatesFromCsv(etfsCsvPath, "ETF") : new Map(),
  CRYPTO: wantCrypto ? loadTickerCandidatesFromCsv(cryptosCsvPath, "CRYPTO") : new Map(),
};

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const onlyTickers = new Set(positionalArgs.map((arg) => listingTicker(arg).ticker).filter(Boolean));

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

async function fetchJson(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA } });
      if (response.ok) return response.json();
    } catch {
      // Fall through to the pause and try again.
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(`could not fetch ${url}`);
}

// eToro publishes its whole instrument catalogue unauthenticated. The metadata
// call names every listing; the trade-real call says which of those are still
// offered and whether a non-leveraged (real) buy is allowed.
const [metadata, trade] = await Promise.all([
  fetchJson("https://api.etorostatic.com/sapi/instrumentsmetadata/V1.1/instruments"),
  fetchJson("https://api.etorostatic.com/sapi/trade-real/instruments"),
]);

const instruments = metadata.InstrumentDisplayDatas || [];
const tradeById = new Map((trade.Instruments || []).map((row) => [row.InstrumentID, row]));
const currencyNames = loadCurrencyNames(instruments, tradeById);
console.error(`${instruments.length} instruments in eToro's catalogue`);

function wantedType(typeId) {
  if (typeId === 5) return wantStocks;
  if (typeId === 6) return wantEtfs;
  if (typeId === 10) return wantCrypto;
  if (typeId === 1 || typeId === 2 || typeId === 4) return wantCfdBook;
  return false;
}

function skipSuffix(symbol) {
  const text = csvTicker(symbol);
  const suffix = text.includes(".") ? text.split(".").pop() : "";
  if (SKIP_SUFFIXES.has(suffix)) return true;
  if (/^(CALL|PUT)\d*$/.test(suffix)) return true;
  return false;
}

const outputPath = new URL("etoro-parsed.json", import.meta.url);
const results = [];
const seen = new Map();

function entryKey(row) {
  return `${row.exchange}:${row.ticker}:${row.isin || row.query}`.toUpperCase();
}

function preferRow(existing, incoming) {
  const existingSuffixed = existing.query !== existing.ticker;
  const incomingSuffixed = incoming.query !== incoming.ticker;
  if (existingSuffixed && !incomingSuffixed) return incoming;
  return existing;
}

let unmatched = 0;
let skipped = 0;
const byType = {};
let realCount = 0;
let cfdCount = 0;

for (const instrument of instruments) {
  const typeId = instrument.InstrumentTypeID;
  if (!wantedType(typeId)) continue;

  const symbol = normalize(instrument.SymbolFull).toUpperCase();
  if (!symbol) continue;
  if (skipSuffix(symbol)) {
    skipped += 1;
    continue;
  }

  const rules = tradeById.get(instrument.InstrumentID);
  if (instrument.IsInternalInstrument || instrument.HasExpirationDate || rules?.IsDelisted) {
    skipped += 1;
    continue;
  }

  const { ticker, suffix } = listingTicker(symbol);
  if (!ticker) continue;
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker) && !onlyTickers.has(symbol)) continue;

  const name = normalize(instrument.InstrumentDisplayName);
  if (!name) continue;

  const type = refineType(INSTRUMENT_TYPES[typeId] || "STOCK", name);
  const priceSource = instrument.PriceSource || "";
  const venues = venuesFor(priceSource, suffix);

  let match = null;
  if (type === "CRYPTO") {
    match = resolveListing(catalogues.CRYPTO, ticker, name, ["CRYPTO"]);
  } else if (type === "STOCK" || type === "ETF" || type === "ETC" || type === "ETN") {
    const kind = type === "STOCK" ? "STOCK" : "ETF";
    match = resolveListing(catalogues[kind], ticker, name, venues);
    if (!match) match = resolveByName(catalogues[kind], name, venues);
  }

  const isin = match?.isin || "";
  if (!isin && type !== "CRYPTO" && type !== "FX" && type !== "CMDTY" && type !== "INDEX") {
    if (!keepEverything) {
      unmatched += 1;
      continue;
    }
  }
  if (type === "CRYPTO" && !match && !keepEverything) {
    unmatched += 1;
    continue;
  }

  // Funds: the price source is what says UCITS vs a US line sold as a CFD.
  // Shares and coins: a real (non-leveraged) buy is allowed when eToro will
  // settle the underlying rather than a contract on it.
  let cfd;
  if (type === "ETF" || type === "ETC" || type === "ETN") {
    cfd = !REAL_ETF_SOURCES.has(priceSource);
  } else if (type === "FX" || type === "CMDTY" || type === "INDEX") {
    cfd = true;
  } else {
    cfd = !((rules?.RealTradeBuyMaxLeverage || 0) >= 1);
  }

  const exchange =
    match?.exchange ||
    (type === "CRYPTO" ? "CRYPTO" : "") ||
    venues[0] ||
    priceSource ||
    "";
  const currency = currencyNames.get(rules?.SellCurrencyID) || (type === "CRYPTO" ? "USD" : null);

  const row = {
    query: symbol,
    ticker,
    name,
    exchange,
    currency,
    type,
    cfd,
    raw: [symbol, name, priceSource, currency].filter(Boolean).join(" "),
    isin: isin || null,
  };

  const key = entryKey(row);
  const existing = seen.get(key);
  if (existing) {
    const winner = preferRow(existing, row);
    if (winner !== existing) {
      results[results.indexOf(existing)] = winner;
      seen.set(key, winner);
    }
    continue;
  }
  seen.set(key, row);
  results.push(row);

  byType[type] = (byType[type] || 0) + 1;
  if (cfd) cfdCount += 1;
  else realCount += 1;
}

results.sort((left, right) => left.ticker.localeCompare(right.ticker) || left.query.localeCompare(right.query));

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

const byCurrency = {};
for (const row of results) byCurrency[row.currency || "?"] = (byCurrency[row.currency || "?"] || 0) + 1;

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin).filter(Boolean)).size} ISINs ` +
    `(${Object.entries(byType)
      .sort((left, right) => right[1] - left[1])
      .map(([type, count]) => `${count} ${type}`)
      .join(", ")}); ${realCount} real, ${cfdCount} CFD; ${unmatched} with no catalogue match, ${skipped} skipped`
);
console.error(
  `by currency ` +
    Object.entries(byCurrency)
      .sort((left, right) => right[1] - left[1])
      .map(([code, count]) => `${code}:${count}`)
      .join(" ")
);
