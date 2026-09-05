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

function loadByIsin(csvPath, kind, index = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return index;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const isin = toIsin(columns[2]) || toIsin(columns[1]) || columns.map(toIsin).find(Boolean);
    if (!isin) continue;
    const name = normalize(columns.slice(3).join(","));
    const entry = index.get(isin);
    if (!entry) index.set(isin, { kind, names: name ? [name] : [] });
    else if (name && !entry.names.includes(name)) entry.names.push(name);
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

function listingType(instrument, name) {
  const typeId = String(instrument.typeId || "").toLowerCase();
  const category = String(instrument.fundInfo?.category || "").toLowerCase();
  if (typeId === "crypto") return "CRYPTO";
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name) && !/\bETFs?\b/i.test(name)) return "ETC";
  if (typeId === "fund" || category === "etf" || category === "etc" || category === "etn") {
    if (category === "etn") return "ETN";
    if (category === "etc") return "ETC";
    return "ETF";
  }
  if (typeId === "stock") return "STOCK";
  return "";
}

function venueOf(exchangeId, type) {
  const code = normalize(exchangeId).toUpperCase();
  if (type === "CRYPTO" || code === "BHS") return "CRYPTO";
  return code || "TIB";
}

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` answer for one shelf. `--all` keeps lines the catalogues
// do not carry. `--fresh` starts the file over.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepUnlisted = hasFlag("all");
const fresh = hasFlag("fresh");
const startIndex = Math.max(1, numberArg("start", 1));

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

const outputPath = new URL("traderepublic-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.isin || entry?.ticker) {
          seen.add(`${entry.isin || entry.ticker}:${entry.exchange || ""}`.toUpperCase());
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
  pages.find((candidate) => candidate.url().includes("traderepublic.com")) ||
  (await browser.newPage());

if (!page.url().includes("traderepublic.com")) {
  await page.goto("https://app.traderepublic.com/", { waitUntil: "domcontentloaded" });
  await sleep(5000);
}

const jurisdiction = await page.evaluate(async () => {
  try {
    const response = await fetch("https://api.traderepublic.com/api/v2/auth/account", {
      credentials: "include",
    });
    const account = await response.json();
    return account?.jurisdiction || "";
  } catch {
    return "";
  }
});

if (!jurisdiction) {
  await browser.disconnect();
  throw new Error(
    "Could not read the account's jurisdiction. Is the Trade Republic session still signed in?"
  );
}

const IN_FLIGHT = 15;

async function openSocket() {
  const opened = await page.evaluate(async () => {
    if (window.__trSub && window.__trSocket?.readyState === WebSocket.OPEN) return true;

    const socket = new WebSocket("wss://api.traderepublic.com/");
    const pending = new Map();
    let nextId = 1;

    socket.addEventListener("message", (event) => {
      const text = String(event.data);
      if (text === "connected") {
        pending.get("connect")?.(true);
        return;
      }
      const match = text.match(/^(\d+)\s+([ACDE])\s?([\s\S]*)$/);
      if (!match) return;

      const [, id, kind, body] = match;
      const resolve = pending.get(id);
      if (!resolve) return;
      if (kind !== "A" && kind !== "E") return;

      pending.delete(id);
      socket.send(`unsub ${id}`);
      if (kind === "E") {
        resolve({ error: body });
        return;
      }
      try {
        resolve({ data: JSON.parse(body) });
      } catch {
        resolve({ error: body });
      }
    });

    const ready = await new Promise((resolve) => {
      socket.addEventListener("open", () => resolve(true));
      socket.addEventListener("error", () => resolve(false));
      setTimeout(() => resolve(false), 15000);
    });
    if (!ready) return false;

    const connected = await new Promise((resolve) => {
      pending.set("connect", resolve);
      socket.send(
        `connect 34 ${JSON.stringify({
          locale: "en",
          platformId: "webtrading",
          platformVersion: "chrome",
          clientId: "app.traderepublic.com",
          clientVersion: "1.2635.0",
        })}`
      );
      setTimeout(() => resolve(false), 15000);
    });
    pending.delete("connect");
    if (!connected) return false;

    window.__trSocket = socket;
    window.__trSub = (payload) =>
      new Promise((resolve) => {
        const id = String(nextId++);
        pending.set(id, resolve);
        socket.send(`sub ${id} ${JSON.stringify(payload)}`);
        setTimeout(() => {
          if (!pending.has(id)) return;
          pending.delete(id);
          socket.send(`unsub ${id}`);
          resolve({ timeout: true });
        }, 15000);
      });
    return true;
  });

  if (!opened) throw new Error("Could not open Trade Republic's WebSocket.");
}

async function ask(payloads) {
  await openSocket();
  return page.evaluate(
    (batch) => Promise.all(batch.map((payload) => window.__trSub(payload))),
    payloads
  );
}

const notCarried = (answer) => /NOT_FOUND/.test(answer?.error || "");

function isAvailable(instrument) {
  return (
    instrument.active !== false &&
    instrument.tradable !== false &&
    instrument.jurisdictions?.[jurisdiction]?.active !== false
  );
}

// Search pagination repeats and skips, so an empty query never yields every
// ISIN it advertises. Walking again by issuer country recovers most of the
// ones the first pass dropped. pageSize 100 is the largest the socket accepts.
const COUNTRIES = [
  "US", "CA", "GB", "DE", "FR", "JP", "SE", "CN", "AU", "CH", "NO", "IT", "HK",
  "PL", "ES", "NL", "GR", "FI", "BE", "SG", "DK", "AT", "IE", "BM", "LU", "PT",
  "IL", "BR", "KY", "LT", "EE", "IN", "SI", "TW", "CZ", "HU", "LV", "CY", "MX",
  "RO", "BG", "SK", "KR", "TH", "ZA", "ID", "MY", "PH", "AE", "NZ", "TR",
];

async function fetchOffered(kind) {
  const hits = [];
  const seenIsins = new Set();
  const pageSize = 100;

  function ingest(rows) {
    for (const hit of rows || []) {
      const isin = toIsin(hit.isin);
      if (!isin || seenIsins.has(isin)) continue;
      seenIsins.add(isin);
      hits.push({ isin, name: hit.name || "", shelf: kind });
    }
  }

  async function searchPage(filter, pageNo, pages) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const answer = await ask([{ type: "neonSearch", data: { q: "", page: pageNo, pageSize, filter } }]);
      const rows = answer[0]?.data?.results || [];
      if (rows.length || pageNo === pages) return { rows, total: answer[0]?.data?.resultCount };
    }
    return { rows: [], total: 0 };
  }

  // Pages have to be asked one at a time: asking several at once makes the
  // search skip or repeat a page, and some instruments then never appear.
  async function walk(extra = [], { label = kind, quiet = false } = {}) {
    const filter = [
      { key: "type", value: kind },
      { key: "jurisdiction", value: jurisdiction },
      ...extra,
    ];
    const first = await searchPage(filter, 1, 1);
    const total = first.total;
    if (!Number.isFinite(total) || total === 0) return total;
    ingest(first.rows);
    const pages = Math.ceil(total / pageSize);
    if (!quiet) console.error(`  ${label} page 1/${pages} (${hits.length} unique)`);
    for (let pageNo = 2; pageNo <= pages; pageNo += 1) {
      ingest((await searchPage(filter, pageNo, pages)).rows);
      if (!quiet && (pageNo === pages || pageNo % 20 === 0)) {
        console.error(`  ${label} page ${pageNo}/${pages} (${hits.length} unique)`);
      }
    }
    return total;
  }

  const advertised = await walk();
  if (!Number.isFinite(advertised)) {
    throw new Error(`Trade Republic did not hand over its ${kind} list. Is the session still signed in?`);
  }

  if (kind !== "crypto") {
    for (const country of COUNTRIES) {
      const before = hits.length;
      const total = await walk([{ key: "country", value: country }], { quiet: true });
      if (total) {
        console.error(`  ${kind} ${country}: ${total} advertised, +${hits.length - before} new (${hits.length} unique)`);
      }
    }
  }

  return hits;
}

console.error(`reading Trade Republic's offering as a ${jurisdiction} account`);
const offered = [
  ...(wantStocks ? await fetchOffered("stock") : []),
  ...(wantEtfs ? await fetchOffered("fund") : []),
  ...(wantCrypto ? await fetchOffered("crypto") : []),
];
console.error(`${offered.length} instruments in Trade Republic's offering`);

const jobs = offered.filter((hit) => {
  if (onlyIsins.size > 0) return onlyIsins.has(hit.isin);
  if (onlyTickers.size > 0) return true;
  if (keepUnlisted) return true;
  if (hit.shelf === "crypto") return true;
  return catalogue.has(hit.isin);
});

const SAVE_INTERVAL_MS = 2000;
let savedCount = results.length;
let savedAt = 0;

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  savedCount = results.length;
  savedAt = Date.now();
}

let silences = 0;
let unlisted = 0;
const skipped = new Map();

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

for (let offset = startIndex - 1; offset < jobs.length; offset += IN_FLIGHT) {
  const batch = jobs.slice(offset, offset + IN_FLIGHT);
  const instruments = await ask(
    batch.map((hit) => ({ type: "instrument", id: hit.isin, jurisdiction }))
  );

  const available = [];
  for (const [index, hit] of batch.entries()) {
    const answer = instruments[index];
    const instrument = answer?.data;
    if (instrument) {
      silences = 0;
      if (!isAvailable(instrument)) {
        skip("not offered");
        continue;
      }
      available.push({ hit, instrument });
      continue;
    }
    if (notCarried(answer)) {
      skip("not carried");
      continue;
    }
    silences += 1;
    if (silences >= 8) {
      throw new Error("Trade Republic stopped answering. Is the session still signed in?");
    }
  }

  const exchangeAnswers = available.length
    ? await ask(available.map(({ hit }) => ({ type: "homeInstrumentExchange", id: hit.isin })))
    : [];

  for (const [index, { hit, instrument }] of available.entries()) {
    const name = normalize(instrument.name || instrument.shortName || hit.name);
    const type = listingType(instrument, name);
    if (!type) {
      skip(String(instrument.typeId || "unknown").toLowerCase());
      continue;
    }
    if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) continue;
    if (type === "STOCK" && !wantStocks) continue;
    if (type === "CRYPTO" && !wantCrypto) continue;

    const ticker = normalizeTicker(instrument.intlSymbol || instrument.homeSymbol);
    const isin = toIsin(instrument.isin || hit.isin);
    if (!ticker) {
      skip("no ticker");
      continue;
    }
    if (onlyTickers.size > 0 && !onlyIsins.has(isin) && !onlyTickers.has(ticker)) continue;

    const listed = isin ? catalogue.get(isin) : null;
    if (type === "CRYPTO") {
      if (!cryptoTickers.has(ticker) && !keepUnlisted) {
        unlisted += 1;
        continue;
      }
    } else if (!listed && !keepUnlisted) {
      unlisted += 1;
      continue;
    }

    const exchange = venueOf(exchangeAnswers[index]?.data?.exchangeId, type);
    const currency = normalize(exchangeAnswers[index]?.data?.currency?.id).toUpperCase() || "EUR";
    const key = `${isin || ticker}:${exchange}:${ticker}:${type}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query: ticker,
      ticker,
      name: name || listed?.names[0] || ticker,
      exchange,
      currency,
      type,
      raw: [ticker, name, exchange, currency].filter(Boolean).join(" "),
      isin: isin || "",
    });
  }

  if (offset === 0 || (offset + IN_FLIGHT) % 150 === 0 || offset + IN_FLIGHT >= jobs.length) {
    console.error(`[${Math.min(offset + IN_FLIGHT, jobs.length)}/${jobs.length}] ${results.length} matched`);
  }
  if (results.length !== savedCount && Date.now() - savedAt >= SAVE_INTERVAL_MS) save();
}

results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
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
