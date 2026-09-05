import puppeteer from "puppeteer-core";
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

function normalizeTicker(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  // Quantfury suffixes some symbols with a venue tag (TLT.OQ); the CSV carries
  // its own (.GB/.USD). A slash is a crypto quote. Strip both so one bare
  // ticker keys the two sides.
  return (afterExchange || "").split(/[./]/)[0].trim();
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
function loadTickerCandidatesFromCsv(csvPath) {
  if (!csvPath || !fs.existsSync(csvPath)) return new Map();

  const map = new Map();
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    if (!ticker) continue;

    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    const isin = isinIndex >= 0 ? toIsin(columns[isinIndex]) : "";
    const exchange = normalize(isinIndex >= 1 ? columns[isinIndex - 1] : columns[1]).toUpperCase();
    const name = (isinIndex >= 0 ? columns.slice(isinIndex + 1) : columns.slice(3)).join(",").trim();

    const candidates = map.get(ticker) || [];
    map.set(ticker, candidates);

    const existing = candidates.find((candidate) => (candidate.isin || "") === isin);
    if (existing) {
      if (name && !existing.names.includes(name)) existing.names.push(name);
      if (exchange) existing.exchanges.add(exchange);
    } else {
      candidates.push({
        isin,
        names: name ? [name] : [],
        exchanges: new Set(exchange ? [exchange] : []),
      });
    }
  }

  return map;
}

const GENERIC_TOKENS = new Set([
  "LTD", "LIMITED", "PLC", "INC", "CORP", "CORPORATION", "LLC", "GMBH", "THE",
  "CO", "TRUST", "AG", "SA", "NV", "SE", "CLASS", "ETF", "UCITS",
]);

function nameTokens(value) {
  return (value || "")
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

// Quantfury names a listing by its operator (NYSE, NASDAQ, B3, Cboe Europe),
// quoting even NYSE Arca funds as "NYSE". The catalogues file the same ticker
// across several venues, so each operator expands to the tapes it can cover
// and the fund or share settles it.
const EXCHANGE_VENUES = {
  NYSE: ["AMEX", "NYSE", "NASDAQ", "CBOE", "ARCA", "BATS", "IEX", "OTC"],
  NASDAQ: ["NASDAQ", "AMEX", "NYSE", "CBOE", "ARCA", "BATS", "IEX", "OTC"],
  B3: ["BMFBOVESPA", "BOVESPA", "BIVA"],
  BMV: ["BMV", "BIVA"],
  LSE: ["LSE", "LSIN"],
  "CBOE EUROPE": ["XETR", "GETTEX", "TRADEGATE", "CBOE", "EURONEXT", "LSE"],
};

const OPERATOR_EXCHANGE = {
  NYSE: "NYSE",
  NASDAQ: "NASDAQ",
  LSE: "LSE",
  B3: "BMFBOVESPA",
  BMV: "BMV",
  "CBOE EUROPE": "XETR",
};

function venuesOf(instrument) {
  const operator = normalize(instrument.en).toUpperCase();
  if (EXCHANGE_VENUES[operator]) return EXCHANGE_VENUES[operator];
  if (instrument.eci === "US") return EXCHANGE_VENUES.NYSE;
  return [];
}

function resolveListing(tickerCandidates, ticker, name, venues) {
  const candidates = tickerCandidates.get(ticker) || [];
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
  return { isin: winner.isin, name: winner.name, exchange };
}

function listingType(instrument, name) {
  const text = `${instrument.n || ""} ${name || ""}`;
  if (Number(instrument.t) === 5 || instrument.s === "pair") return "CRYPTO";
  if (/\bETNs?\b/i.test(text)) return "ETN";
  if (/\bETCs?\b/i.test(text)) return "ETC";
  if (Number(instrument.t) === 6 || /\bETFs?\b/i.test(text)) return "ETF";
  return "STOCK";
}

function cryptoBase(instrument) {
  return normalizeTicker(instrument.bc || instrument.snd || instrument.sn || "");
}

function quoteCurrency(instrument) {
  const text = normalize(instrument.ic).toUpperCase();
  if (text === "USDT") return "USDT";
  return text || null;
}

function exchangeOf(instrument, match, type) {
  if (type === "CRYPTO") return "CRYPTO";
  if (match?.exchange) return match.exchange;
  const operator = normalize(instrument.en).toUpperCase();
  if (OPERATOR_EXCHANGE[operator]) return OPERATOR_EXCHANGE[operator];
  const mic = normalize(instrument.em).toUpperCase();
  if (mic === "NYS") return "NYSE";
  if (mic === "NSQ") return "NASDAQ";
  if (mic === "CHI.DE" || mic === "CHI") return "XETR";
  if (mic === "XMEX") return "BMV";
  if (mic.startsWith("B3")) return "BMFBOVESPA";
  return operator || null;
}

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` answer for one shelf. `--all` keeps lines the catalogues
// do not carry. Futures and FX sit on other type ids and are left out.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepUnlisted = hasFlag("all");

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;
const wantCrypto = !etfsOnly && !stocksOnly;

const fundsByTicker = wantEtfs ? loadTickerCandidatesFromCsv(etfsCsvPath) : new Map();
const stocksByTicker = wantStocks ? loadTickerCandidatesFromCsv(stocksCsvPath) : new Map();
const cryptosByTicker = wantCrypto ? loadTickerCandidatesFromCsv(cryptosCsvPath) : new Map();

const onlyTickers = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(normalizeTicker)
    .filter(Boolean)
);

const outputPath = new URL("quantfury-parsed.json", import.meta.url);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => /quantfury\.com/i.test(candidate.url())) || (await browser.newPage());
await page.bringToFront();

// Quantfury's catalogue lives behind Cloudflare and a session bearer the app
// mints per load, so the request is captured from its own traffic and replayed
// from the page context; a plain server-side fetch is turned away.
const client = await page.target().createCDPSession();
await client.send("Network.enable");

let apiHeaders = null;
client.on("Network.requestWillBeSent", (event) => {
  const headers = event.request.headers || {};
  const token = headers.Authorization || headers.authorization;
  if (
    event.request.method === "GET" &&
    /trdngbcknd\.com\/v13\//.test(event.request.url) &&
    token &&
    (headers["Custom-DeviceId"] || headers["custom-deviceid"])
  ) {
    apiHeaders = headers;
  }
});

if (!/trading\.quantfury\.com/i.test(page.url())) {
  await page.goto("https://trading.quantfury.com/", { waitUntil: "domcontentloaded" });
} else {
  await page.reload({ waitUntil: "domcontentloaded" });
}

for (let waited = 0; waited < 30000 && !apiHeaders; waited += 300) {
  await sleep(300);
}
if (!apiHeaders) {
  await browser.disconnect();
  throw new Error("could not capture Quantfury session headers (is trading.quantfury.com signed in?)");
}

const replayHeaders = Object.fromEntries(
  Object.entries(apiHeaders).filter(([key]) => !key.startsWith(":") && !/^(host|content-length|referer)$/i.test(key))
);

// afterDate=0 turns the incremental sync into a full dump of the catalogue.
const response = await page.evaluate(async (headers) => {
  const res = await fetch("https://i1.trdngbcknd.com/v13/instruments?afterDate=0", { headers });
  const text = await res.text();
  return { status: res.status, text };
}, replayHeaders);

await browser.disconnect();

if (response.status !== 200) {
  throw new Error(`instruments endpoint returned ${response.status}`);
}

const book = JSON.parse(response.text).data.updated || [];
console.error(`${book.length} instruments in Quantfury's offering`);

// t=1 shares, t=5 spot crypto, t=6 funds. Commodity futures (2), FX (3) and
// crypto futures (4) are contracts on those underlyings, not the instrument.
const KEEP_TYPES = new Set([1, 5, 6]);

const results = [];
const seen = new Set();
let unlisted = 0;
const skipped = new Map();

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

for (const instrument of book) {
  const typeId = Number(instrument.t);
  if (!KEEP_TYPES.has(typeId)) {
    skip(typeId === 2 ? "commodity future" : typeId === 3 ? "fx" : typeId === 4 ? "crypto future" : `type ${typeId}`);
    continue;
  }

  // Search only lists names the app still lets you trade: aot is
  // AVAILABLE_OPERATION_TRADE (NONE=0, ALL=3), and ed, when set, is the
  // expiry. TRP (TransCanada) is aot NONE with a 2001 sentinel ed, so
  // typing it into search answers empty while the dump still carries it.
  if (Number(instrument.aot) === 0) {
    skip("unavailable");
    continue;
  }
  if (instrument.ed && Date.now() >= Number(instrument.ed)) {
    skip("expired");
    continue;
  }

  const quoted = normalize(instrument.n || instrument.hn);
  const type = listingType(instrument, quoted);
  if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) continue;
  if (type === "STOCK" && !wantStocks) continue;
  if (type === "CRYPTO" && !wantCrypto) continue;

  const ticker = type === "CRYPTO" ? cryptoBase(instrument) : normalizeTicker(instrument.snd || instrument.sn || "");
  if (!ticker) {
    skip("no ticker");
    continue;
  }
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker)) continue;

  let match = null;
  if (type === "CRYPTO") {
    const coins = cryptosByTicker.get(ticker) || [];
    if (coins.length === 0 && !keepUnlisted) {
      unlisted += 1;
      continue;
    }
    match = coins[0] ? { isin: coins[0].isin || "", name: coins[0].names[0] || quoted, exchange: "CRYPTO" } : null;
  } else {
    const catalogue = type === "STOCK" ? stocksByTicker : fundsByTicker;
    match = resolveListing(catalogue, ticker, quoted, venuesOf(instrument));
    if (!match && !keepUnlisted) {
      unlisted += 1;
      continue;
    }
  }

  const exchange = exchangeOf(instrument, match, type);
  const currency = quoteCurrency(instrument);
  const name = quoted || match?.name || ticker;
  const isin = match?.isin || "";
  const key = `${isin || ticker}:${exchange}:${ticker}:${currency || ""}:${type}`.toUpperCase();
  if (seen.has(key)) continue;
  seen.add(key);

  results.push({
    query: ticker,
    ticker,
    name,
    exchange,
    currency,
    type,
    raw: [instrument.sn || instrument.snd, name, instrument.en, currency].filter(Boolean).join(" "),
    isin,
  });
}

results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(String(right.exchange));
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(String(right.ticker));
});

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (unlisted ? `, ${unlisted} the catalogues do not carry` : "") +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
