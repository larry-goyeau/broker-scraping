import puppeteer from "puppeteer-core";
import { stampRows } from "../accepted.mjs";
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
  return (afterExchange || "").replace(/\//g, ".").trim();
}

function pathArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return fallback ? new URL(fallback, import.meta.url) : "";
}

function numberArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(\\d+)$`, "i"));
    if (match) return parseInt(match[1], 10);
  }
  return fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

// Scalable answers with a WKN, never a ticker, so the symbol has to come from the
// catalogue. German books are kept first: EUNL is what the account shows for
// IE00B4L5Y983, not the Mexican IWDA/N the same ISIN also trades under.
const HOME_EXCHANGES = ["GETTEX", "XETR", "TRADEGATE", "FWB", "MUN"];

function loadByIsin(csvPath, kind, index = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return index;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const isin = toIsin(columns[2]) || toIsin(columns[1]) || columns.map(toIsin).find(Boolean);
    if (!isin) continue;

    const name = normalize(columns.slice(3).join(","));
    const ticker = normalizeTicker(columns[0]);
    const home = HOME_EXCHANGES.includes(normalize(columns[1]).toUpperCase());

    const entry = index.get(isin) || { kind, names: [], ticker: "", homeTicker: "" };
    if (name && !entry.names.includes(name)) entry.names.push(name);
    if (ticker && !entry.ticker) entry.ticker = ticker;
    if (ticker && home && !entry.homeTicker) entry.homeTicker = ticker;
    index.set(isin, entry);
  }
  return index;
}

function loadCryptoTickers(csvPath) {
  const tickers = new Set();
  if (!csvPath || !fs.existsSync(csvPath)) return tickers;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const ticker = normalizeTicker(line.split(",")[0]);
    if (ticker) tickers.add(ticker);
  }
  return tickers;
}

// Scalable quotes a line on one book and names it with its own code. gettex and
// Xetra are in the venue registry already; SEIX is the European Investor Exchange,
// the Börse Hannover system Scalable runs with BÖAG under MIC HANC / HAND, which
// the registry does not carry yet — so its own name is kept rather than filed
// under Munich, which is a different order book.
//
// XVES is the fund company (an order at NAV, not an exchange), SCSI Scalable's own
// crypto book and XOFF off-exchange. None of the three is a listing.
const VENUES = { MUNC: "XMUN", XETR: "XETR", TGAT: "XGAT", SEIX: "SEIX" };

function venueOf(code) {
  return VENUES[normalize(code).toUpperCase()] || "";
}

// The catalogues already say whether an ISIN is a fund or a share. Scalable's own
// type only refines the fund shelf: it files a crypto ETP as CRYPTO_ETP, and the
// name is what separates an ETC from an ETN.
function listingType(hit, kind) {
  const text = normalize(hit.name);
  if (/\bETNs?\b/i.test(text)) return "ETN";
  if (/\bETCs?\b/i.test(text) && !/\bETFs?\b/i.test(text)) return "ETC";
  if (kind) return kind;
  return normalize(hit.type).toUpperCase() === "STOCK" ? "STOCK" : "ETF";
}

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` answer for one shelf. `--all` keeps coins the catalogues do not
// carry; the listed shelves are walked ISIN by ISIN, so there is nothing to keep
// there that was not asked for. `--fresh` starts the file over.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepUnlisted = hasFlag("all");
const fresh = hasFlag("fresh");
const startIndex = Math.max(1, numberArg("start", 1));
// One document carries several searches under aliases, and a few documents fly at
// once. Ten by four answers in about a second and Scalable does not throttle it.
const BATCH = Math.max(1, numberArg("batch", 10));
const CONCURRENCY = Math.max(1, numberArg("concurrency", 4));

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;
const wantCrypto = !etfsOnly && !stocksOnly;

const catalogue = new Map();
if (wantEtfs) loadByIsin(etfsCsvPath, "ETF", catalogue);
if (wantStocks) loadByIsin(stocksCsvPath, "STOCK", catalogue);
const cryptoTickers = wantCrypto ? loadCryptoTickers(cryptosCsvPath) : new Set();

const onlyIsins = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(toIsin)
    .filter(Boolean)
);
const onlyTickers = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(normalizeTicker)
    .filter((ticker) => ticker && !toIsin(ticker))
);

const outputPath = new URL("scalablecapital-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.isin || entry?.ticker) {
          seen.add(`${entry.isin || entry.ticker}:${entry.exchange || ""}:${entry.currency || ""}`.toUpperCase());
        }
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => /scalable\.capital/i.test(candidate.url())) || (await browser.newPage());

if (!/scalable\.capital/i.test(page.url())) {
  await page.goto("https://de.scalable.capital/broker/", { waitUntil: "domcontentloaded" });
  await sleep(4000);
}

// The broker app is a separate shell from the cockpit and hands both ids to its own
// client in the server-rendered props. Reading them there is the only way to learn
// which portfolio the session speaks for: the cockpit's person id is a different one.
const session = await page.evaluate(async () => {
  try {
    const html = await (await fetch("/broker/", { credentials: "include" })).text();
    const script = html.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!script) return null;
    const props = JSON.parse(script[1]).props;
    return { personId: props?.personId || "", portfolioId: props?.sanitizedPortfolioId || "" };
  } catch {
    return null;
  }
});

if (!session?.personId || !session?.portfolioId) {
  await browser.disconnect();
  throw new Error(
    "Could not read the broker portfolio from de.scalable.capital/broker/. Is the session still signed in?"
  );
}

console.error(`reading Scalable Capital's offering for portfolio ${session.portfolioId}`);

async function ask(query, variables) {
  return page.evaluate(
    async (query, variables) => {
      try {
        const response = await fetch("/broker/api/data", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query, variables }),
        });
        const text = await response.text();
        try {
          return { status: response.status, json: JSON.parse(text) };
        } catch {
          return { status: response.status, error: text.slice(0, 200) };
        }
      } catch (error) {
        return { error: String(error) };
      }
    },
    query,
    variables
  );
}

const SAVE_INTERVAL_MS = 2000;
let savedCount = results.length;
let savedAt = 0;

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(stampRows(results), null, 2));
  savedCount = results.length;
  savedAt = Date.now();
}

let unlisted = 0;
const skipped = new Map();

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

function push(row) {
  const key = `${row.isin || row.ticker}:${row.exchange}:${row.currency}`.toUpperCase();
  if (seen.has(key)) return;
  seen.add(key);
  results.push(row);
}

// Scalable's own crypto book, handed over whole. The coins are not securities and
// carry no ISIN, so they are matched on the ticker like every other coin shelf.
if (wantCrypto) {
  const query = `query coins($personId: ID!, $portfolioId: ID!) {
    account(id: $personId) {
      id
      brokerPortfolio(id: $portfolioId) {
        id
        crypto { id coins { id ticker name quoteTick { currency } } }
      }
    }
  }`;

  const answer = await ask(query, session);
  const coins = answer.json?.data?.account?.brokerPortfolio?.crypto?.coins;
  if (!Array.isArray(coins)) {
    console.error(`  crypto shelf unreadable: ${answer.error || JSON.stringify(answer.json?.errors || {}).slice(0, 200)}`);
  } else {
    for (const coin of coins) {
      const ticker = normalizeTicker(coin.ticker);
      if (!ticker) continue;
      if (onlyIsins.size > 0 || onlyTickers.size > 0) {
        if (!onlyTickers.has(ticker)) continue;
      }
      if (!cryptoTickers.has(ticker) && !keepUnlisted) {
        unlisted += 1;
        continue;
      }
      const name = normalize(coin.name) || ticker;
      push({
        query: ticker,
        ticker,
        name,
        exchange: "CRYPTO",
        currency: normalize(coin.quoteTick?.currency).toUpperCase() || "EUR",
        type: "CRYPTO",
        raw: `${name} | ${ticker}`,
        isin: "",
      });
    }
    console.error(`  crypto: ${coins.length} coins offered`);
  }
}

const jobs = [...catalogue.keys()].filter((isin) => {
  if (onlyIsins.size > 0) return onlyIsins.has(isin);
  if (onlyTickers.size > 0) {
    const listed = catalogue.get(isin);
    return onlyTickers.has(listed?.homeTicker) || onlyTickers.has(listed?.ticker);
  }
  return true;
});

// `securitySearch` is what tells a carried line from one Scalable only knows about:
// `security(isin:)` answers for any well-formed ISIN, including a made-up one, so a
// non-null security is not evidence. The search shelves stay empty for SPY.
function searchDocument(size) {
  const params = ["$personId: ID!", "$portfolioId: ID!"];
  const fields = [];
  for (let slot = 0; slot < size; slot += 1) {
    params.push(`$t${slot}: String!`);
    fields.push(`q${slot}: securitySearch(searchTerm: $t${slot}) {
      id
      stocksResultList { id results { ...Hit } }
      etfsResultList { id results { ...Hit } }
      fundsResultList { id results { ...Hit } }
    }`);
  }
  return `query catalogue(${params.join(", ")}) {
    account(id: $personId) {
      id
      brokerPortfolio(id: $portfolioId) { id ${fields.join("\n")} }
    }
  }
  fragment Hit on Security {
    id
    isin
    wkn
    name
    type
    quoteTick(includeSinceBuy: false) { venue currency }
  }`;
}

async function searchBatch(isins) {
  const variables = { ...session };
  isins.forEach((isin, slot) => {
    variables[`t${slot}`] = isin;
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answer = await ask(searchDocument(isins.length), variables);
    const portfolio = answer.json?.data?.account?.brokerPortfolio;
    if (portfolio) return portfolio;
    await sleep(1000 * (attempt + 1));
  }
  return null;
}

function ingest(isin, shelves) {
  const listed = catalogue.get(isin);
  const hit = ["stocksResultList", "etfsResultList", "fundsResultList"]
    .flatMap((shelf) => shelves?.[shelf]?.results || [])
    .find((result) => toIsin(result.isin) === isin);

  if (!hit) {
    skip("not carried");
    return;
  }

  const exchange = venueOf(hit.quoteTick?.venue);
  if (!exchange) {
    // No quote venue means the fund company or no book at all, not a listing.
    skip(hit.quoteTick?.venue ? `quoted ${hit.quoteTick.venue}` : "no quote");
    return;
  }

  const currency = normalize(hit.quoteTick?.currency).toUpperCase() || "EUR";
  const ticker = listed?.homeTicker || listed?.ticker || normalize(hit.wkn).toUpperCase();
  const name = normalize(hit.name) || listed?.names[0] || isin;

  push({
    query: isin,
    ticker,
    name,
    exchange,
    currency,
    type: listingType(hit, listed?.kind),
    raw: [hit.wkn, hit.name, hit.quoteTick?.venue, currency].filter(Boolean).join(" "),
    isin,
  });
}

const batches = [];
for (let offset = startIndex - 1; offset < jobs.length; offset += BATCH) {
  batches.push(jobs.slice(offset, offset + BATCH));
}

let done = 0;
let silences = 0;

async function worker(lane) {
  for (let index = lane; index < batches.length; index += CONCURRENCY) {
    const batch = batches[index];
    const shelves = await searchBatch(batch);

    if (!shelves) {
      silences += 1;
      if (silences >= 8) {
        throw new Error("Scalable Capital stopped answering. Is the session still signed in?");
      }
      skip("no answer");
    } else {
      silences = 0;
      batch.forEach((isin, slot) => ingest(isin, shelves[`q${slot}`]));
    }

    done += batch.length;
    if (done % 2000 < BATCH || done >= jobs.length) {
      console.error(`[${Math.min(done, jobs.length)}/${jobs.length}] ${results.length} matched`);
    }
    if (results.length !== savedCount && Date.now() - savedAt >= SAVE_INTERVAL_MS) save();
  }
}

console.error(`${jobs.length} catalogue ISINs to ask`);
await Promise.all(Array.from({ length: CONCURRENCY }, (_, lane) => worker(lane)));

results.sort((left, right) => {
  const byType = String(left.type).localeCompare(String(right.type));
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(String(right.exchange));
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(String(right.ticker));
});

save();

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (unlisted ? `, ${unlisted} the catalogues do not carry` : "") +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);

await browser.disconnect();
