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
  return (afterExchange || "").replace(/[\s/]+/g, ".").trim();
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
    const exchange = normalize(columns[1]).toUpperCase();
    const entry = index.get(isin);
    if (!entry) {
      index.set(isin, { isin, kind, names: name ? [name] : [], exchange, exchanges: new Set(exchange ? [exchange] : []) });
    } else if (exchange) {
      entry.exchanges.add(exchange);
    }
    else if (name && !entry.names.includes(name)) entry.names.push(name);
  }
  return index;
}

function loadTickerCandidatesFromCsv(csvPath, kind, map = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return map;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const exchange = normalize(isinIndex >= 1 ? columns[isinIndex - 1] : columns[1]).toUpperCase();
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!name) continue;

    const candidates = map.get(ticker) || [];
    map.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
      if (exchange) existing.exchanges.add(exchange);
      if (!existing.kind) existing.kind = kind;
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

const GENERIC_TOKENS = new Set([
  "LTD", "LIMITED", "PLC", "INC", "CORP", "CORPORATION", "LLC", "GMBH", "THE",
  "CO", "TRUST", "CLASS", "ETF", "ETC", "ETN", "ETP", "UCITS", "FUND", "SHARES",
  "ISHARES",
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
const US_VENUES = ["NASDAQ", "NYSE", "AMEX", "CBOE", "OTC"];

function resolveListing(tickerCandidates, ticker, scrapedName, type, exchange) {
  const kind = type === "STOCK" ? "STOCK" : "ETF";
  const candidates = (tickerCandidates.get(ticker) || []).filter(
    (candidate) => !candidate.kind || candidate.kind === kind
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    const only = candidates[0];
    return { ...only, ...scoreCandidate(scrapedName, only) };
  }

  const sameVenue = exchange
    ? candidates.filter((candidate) => candidate.exchanges.has(exchange))
    : [];
  const shortlist = sameVenue.length > 0 ? sameVenue : candidates;
  const scored = shortlist.map((candidate) => ({
    ...candidate,
    ...scoreCandidate(scrapedName, candidate),
  }));

  if (scored.length === 1) return scored[0];

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const winners = scored.filter((candidate) => candidate.score === bestScore);
  return winners.length === 1 ? winners[0] : null;
}

const EXCHANGES = {
  "NEW YORK": "NYSE",
  FRANKFURT: "XETR",
  LONDON: "LSE",
  AMSTERDAM: "EURONEXT",
  PARIS: "EURONEXT",
  MILAN: "MIL",
  MADRID: "BME",
  ZURICH: "SIX",
  WARSAW: "WSE",
  PRAGUE: "PRA",
  BUDAPEST: "BUD",
  VIENNA: "VIE",
  STOCKHOLM: "OMX",
  COPENHAGEN: "OMX",
  HELSINKI: "OMX",
  OSLO: "OSL",
  LISBON: "EURONEXT",
  BRUSSELS: "EURONEXT",
  "HONG KONG": "HKEX",
  TOKYO: "TSE",
  "CBOE BZX": "CBOE",
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
};

function venueOf(info, symbol, match) {
  const suffix = String(symbol || "").split(".").pop()?.toUpperCase();
  // Cboe BZX is the quote feed XTB prints for US names, not the listing tape.
  // Only the US share class should take NASDAQ/NYSE/OTC from the catalogue.
  if (suffix === "US" && match?.exchanges) {
    for (const code of US_VENUES) {
      if (code === "CBOE") continue;
      if (match.exchanges.has(code)) return code;
    }
  }
  const named = EXCHANGES[normalize(info.exchange).toUpperCase()];
  if (suffix === "US") return named && named !== "CBOE" ? named : "NYSE";
  if (suffix === "DE") return "XETR";
  if (suffix === "UK") return "LSE";
  if (named && named !== "CBOE") return named;
  return normalize(info.exchange).toUpperCase() || suffix || "";
}

function preferDottedClass(ticker) {
  if (ticker.length >= 4 && ticker.length <= 5 && /^[A-Z]+[A-Z]$/.test(ticker)) {
    const dotted = `${ticker.slice(0, -1)}.${ticker.slice(-1)}`;
    if (tickerCandidates.has(dotted)) return dotted;
  }
  return ticker;
}

function listingType(info, name) {
  const asset = String(info.type || "").toUpperCase();
  if (asset === "CFD" || asset === "SYNTH" || asset === "BONDS") return "";
  if (/\bETNs?\b/i.test(name)) return "ETN";
  const withoutParens = name.replace(/\([^)]*\)/g, " ");
  if (/\bETCs?\b/i.test(withoutParens) && !/\bETFs?\b/i.test(name) && !/^ETC\b/i.test(name)) {
    return "ETC";
  }
  if (asset === "ETN" || asset === "ETC" || asset === "ETF" || asset === "STOCK") return asset;
  if (info.kind === "etf") return "ETF";
  if (info.kind === "stock") return "STOCK";
  return "";
}

function symbolFromLogo(url) {
  const file = String(url || "").split("/").pop() || "";
  const stem = file.replace(/\.(png|svg|jpg|webp)$/i, "");
  if (!stem || !/_/.test(stem)) return "";
  const [ticker, venue] = stem.split("_");
  if (!ticker || !venue) return "";
  return `${ticker.toUpperCase()}.${venue.toUpperCase()}`;
}

function tickerFromSymbol(symbol) {
  const text = normalizeTicker(symbol);
  const cut = text.lastIndexOf(".");
  return cut > 0 ? text.slice(0, cut) : text;
}

// --- protobuf ---------------------------------------------------------------
// XTB's platform speaks gRPC-Web. Only a handful of shapes are needed, so
// they are written and read by hand.

function varint(value) {
  const bytes = [];
  let rest = BigInt(value);
  for (;;) {
    const byte = Number(rest & 0x7fn);
    rest >>= 7n;
    if (rest) bytes.push(byte | 0x80);
    else {
      bytes.push(byte);
      break;
    }
  }
  return bytes;
}

const stringField = (field, text) => {
  const bytes = Buffer.from(text, "utf8");
  return [...varint((field << 3) | 2), ...varint(bytes.length), ...bytes];
};
const numberField = (field, value) => [...varint((field << 3) | 0), ...varint(value)];

function frame(body) {
  const header = Buffer.alloc(5);
  header.writeUInt32BE(body.length, 1);
  return Buffer.concat([header, Buffer.from(body)]);
}

function unframe(buffer) {
  const messages = [];
  const trailers = [];
  let at = 0;
  while (at + 5 <= buffer.length) {
    const flag = buffer[at];
    const length = buffer.readUInt32BE(at + 1);
    if (at + 5 + length > buffer.length) break;
    const body = buffer.subarray(at + 5, at + 5 + length);
    if (flag & 0x80) trailers.push(body.toString("utf8"));
    else messages.push(body);
    at += 5 + length;
  }
  return { messages, trailers: trailers.join("\n") };
}

function readVarint(buffer, at) {
  let value = 0n;
  let shift = 0n;
  while (at < buffer.length) {
    const byte = buffer[at++];
    value |= BigInt(byte & 0x7f) << shift;
    if (!(byte & 0x80)) break;
    shift += 7n;
  }
  return [value, at];
}

function decode(buffer) {
  const fields = [];
  let at = 0;
  while (at < buffer.length) {
    const start = at;
    let key;
    [key, at] = readVarint(buffer, at);
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (!field) return fields;

    if (wire === 0) {
      let value;
      [value, at] = readVarint(buffer, at);
      fields.push({ field, value: Number(value) });
    } else if (wire === 1) {
      if (at + 8 > buffer.length) return fields;
      fields.push({ field, value: buffer.readDoubleLE(at) });
      at += 8;
    } else if (wire === 5) {
      if (at + 4 > buffer.length) return fields;
      fields.push({ field, value: buffer.readFloatLE(at) });
      at += 4;
    } else if (wire === 2) {
      let length;
      [length, at] = readVarint(buffer, at);
      const size = Number(length);
      if (at + size > buffer.length) return fields;
      fields.push({ field, bytes: buffer.subarray(at, at + size) });
      at += size;
    } else return fields;

    if (at <= start) return fields;
  }
  return fields;
}

const pick = (fields, field) => (fields || []).find((entry) => entry.field === field);
const num = (fields, field) => pick(fields, field)?.value ?? null;
const str = (fields, field) => {
  const entry = pick(fields, field);
  return entry?.bytes ? entry.bytes.toString("utf8") : null;
};
const sub = (fields, field) => {
  const entry = pick(fields, field);
  return entry?.bytes ? decode(entry.bytes) : null;
};
const subs = (fields, field) =>
  (fields || []).filter((entry) => entry.field === field && entry.bytes).map((entry) => decode(entry.bytes));

const ASSET_CLASS = {
  1: "STOCK",
  2: "ETF",
  3: "CFD",
  4: "SYNTH",
  5: "BONDS",
  6: "ETC",
  7: "ETN",
};
const CONTENT_KIND = {
  2: "stock",
  3: "etf",
  4: "cfdStock",
  5: "cfdEtf",
  6: "cfdCommodity",
  7: "cfdCrypto",
  8: "cfdForex",
  9: "cfdIndex",
};
const LAYOUTS = {
  etf: { isin: 4, exchange: 6, name: 9, quoteSource: 12 },
  stock: { isin: 4, exchange: 6, name: 8, quoteSource: 11, logo: 10 },
};
const PRODUCTS = { 1: "equity", 2: "cfd", 3: "option", 4: "crypto" };

const SEARCH = "pl.xtb.ipax.pub.grpc.trading.instrumentsearch.v2.InstrumentSearchService/Search";
const CATEGORIES =
  "pl.xtb.ipax.pub.grpc.trading.instrumentsearch.v2.InstrumentSearchService/GetCategorizedInstruments";
const CONTENT = "pl.xtb.ipax.pub.grpc.instrumentinfo.v1.InstrumentInfoService/GetInstrumentInfoContent";

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` answer for one shelf. `--all` keeps lines the catalogues
// do not carry. `--fresh` starts the file over.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepUnlisted = hasFlag("all");
const fresh = hasFlag("fresh");
const startIndex = Math.max(1, numberArg("start", 1));

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;

const catalogue = new Map();
if (wantEtfs) loadByIsin(etfsCsvPath, "ETF", catalogue);
if (wantStocks) loadByIsin(stocksCsvPath, "STOCK", catalogue);
const tickerCandidates = new Map();
if (wantEtfs) loadTickerCandidatesFromCsv(etfsCsvPath, "ETF", tickerCandidates);
if (wantStocks) loadTickerCandidatesFromCsv(stocksCsvPath, "STOCK", tickerCandidates);

const onlyTickers = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(normalizeTicker)
    .filter((ticker) => ticker && !toIsin(ticker))
);
const onlyIsins = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(toIsin)
    .filter(Boolean)
);

const outputPath = new URL("xtb-parsed.json", import.meta.url);
const results = [];
const seen = new Set();
const seenIsins = new Set();

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.ticker) {
          seen.add(
            `${entry.isin || entry.ticker}:${entry.exchange || ""}:${entry.ticker}:${entry.type || ""}`.toUpperCase()
          );
        }
        if (entry?.isin) seenIsins.add(entry.isin);
      }
    }
  } catch {
    // Ignore malformed prior output.
  }
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => /xtb\.com|xstation/i.test(candidate.url())) ||
  (await browser.newPage());

if (!/xtb\.com|xstation/i.test(page.url())) {
  await page.goto("https://xstation5.xtb.com/", { waitUntil: "domcontentloaded" });
  await sleep(5000);
}

const client = await page.createCDPSession();

function claims(candidate) {
  try {
    return JSON.parse(Buffer.from(candidate.split(".")[1], "base64").toString());
  } catch {
    return null;
  }
}

const secondsLeft = (candidate) => (claims(candidate)?.exp || 0) - Math.floor(Date.now() / 1000);

let token = "";
client.on("Network.requestWillBeSent", (event) => {
  if (!/ipax\.xtb\.com/i.test(event.request.url)) return;
  const auth = event.request.headers.authorization || event.request.headers.Authorization;
  if (!auth || !/^Bearer ey/.test(auth)) return;
  if (claims(auth)?.acn) token = auth;
});

const TOKEN_MARGIN_SECONDS = 45;
const usable = () => Boolean(token) && secondsLeft(token) > TOKEN_MARGIN_SECONDS;
let refreshing = null;

async function freshToken() {
  if (usable()) return token;
  if (!refreshing) {
    refreshing = (async () => {
      console.error("reading a fresh XTB session token");
      await client.send("Network.enable");
      try {
        for (let waited = 0; waited < 8000 && !usable(); waited += 250) await sleep(250);
        if (usable()) return token;
        try {
          await Promise.race([page.reload({ waitUntil: "domcontentloaded" }), sleep(30000)]);
        } catch {
          // A reload that fails is no worse than one that changes nothing.
        }
        for (let waited = 0; waited < 30000 && !usable(); waited += 250) await sleep(250);
        return token;
      } finally {
        await client.send("Network.disable").catch(() => {});
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

if (!(await freshToken())) {
  throw new Error("XTB never handed out a session token. Is the platform still signed in?");
}

const RETRYABLE = new Set(["8", "14"]);

async function call(method, body) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await sleep(400 * attempt);
    const auth = await freshToken();

    let response;
    try {
      response = await fetch(`https://ipax.xtb.com/${method}`, {
        method: "POST",
        headers: {
          authorization: auth,
          "content-type": "application/grpc-web+proto",
          "x-grpc-web": "1",
          "x-user-agent": "connect-es/2.1.1",
          origin: "https://xstation5.xtb.com",
          referer: "https://xstation5.xtb.com/",
        },
        body: frame(body),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      continue;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const { messages, trailers } = unframe(buffer);
    const status =
      response.headers.get("grpc-status") || trailers.match(/grpc-status:\s*(\d+)/)?.[1] || "";

    if (status === "16" || response.status === 401) {
      if (token === auth) token = "";
      continue;
    }
    if (response.status === 404 || RETRYABLE.has(status)) continue;
    if (!response.ok || (status && status !== "0")) return null;

    return messages.flatMap((part) => decode(part));
  }
  return null;
}

function refsFromBlob(bytes) {
  if (!bytes) return [];
  const refs = [];
  for (const item of decode(bytes).filter((entry) => entry.field === 1 && entry.bytes)) {
    const identifier = decode(item.bytes);
    const chosen = identifier[0];
    if (!chosen) continue;
    const id = chosen.bytes ? num(decode(chosen.bytes), 1) : chosen.value;
    refs.push({ product: PRODUCTS[chosen.field] || "unknown", id });
  }
  return refs;
}

// CFD, FX, commodity, index, option and crypto-CFD shelves are left out.
const SKIP_CATEGORIES = new Set([1, 2, 3, 6, 11, 15, 16]);

function collectEquityIds(node) {
  const id = num(node, 1);
  if (SKIP_CATEGORIES.has(id)) return [];
  const refs = refsFromBlob(pick(node, 5)?.bytes).filter((ref) => ref.product === "equity" && ref.id);
  const children = sub(node, 4) ? subs(sub(node, 4), 1) : [];
  return refs.concat(children.flatMap(collectEquityIds));
}

async function search(query) {
  const answer = await call(SEARCH, stringField(1, query));
  if (!answer) return null;

  const found = [];
  for (const instrument of subs(sub(answer, 1), 1)) {
    const identifier = sub(instrument, 1) || [];
    const chosen = identifier[0];
    found.push({
      product: PRODUCTS[chosen?.field] || "unknown",
      id: chosen?.bytes ? num(decode(chosen.bytes), 1) : null,
      symbol: str(instrument, 2),
      name: str(instrument, 3),
    });
  }
  return found;
}

async function basicInfo(instrumentId) {
  const answer = await call(CONTENT, [
    ...numberField(1, instrumentId),
    ...stringField(2, "en"),
    ...numberField(3, 1),
  ]);
  if (!answer) return null;

  const success = sub(answer, 1);
  if (!success) return null;

  const branch = success.find((entry) => CONTENT_KIND[entry.field] && entry.bytes);
  if (!branch) return null;
  const kind = CONTENT_KIND[branch.field];
  if (kind.startsWith("cfd")) return { kind, type: "CFD" };

  const layout = LAYOUTS[kind];
  if (!layout) return { kind, unreadable: true };

  const essentials = sub(sub(decode(branch.bytes), 1), 1);
  if (!essentials) return null;

  return {
    kind,
    type: ASSET_CLASS[num(essentials, 1)] || null,
    currency: str(essentials, 2) || null,
    isin: (str(essentials, layout.isin) || "").toUpperCase() || null,
    exchange: str(essentials, layout.exchange) || null,
    name: str(essentials, layout.name) || null,
    quoteSource: str(essentials, layout.quoteSource) || null,
    logo: str(essentials, 10) || null,
  };
}

const SAVE_INTERVAL_MS = 2000;
let savedCount = results.length;
let savedAt = 0;

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  savedCount = results.length;
  savedAt = Date.now();
}

let unlisted = 0;
const skipped = new Map();

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

function emit({ ticker, name, exchange, currency, type, isin, match, raw }) {
  if (!ticker || !type) {
    skip("no ticker");
    return;
  }
  if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) return;
  if (type === "STOCK" && !wantStocks) return;
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker) && !onlyIsins.has(isin)) return;
  if (!exchange) {
    skip("no exchange");
    return;
  }
  if (!currency) {
    skip("no currency");
    return;
  }

  let resolved = match;
  if (!resolved && isin) resolved = catalogue.get(isin);
  if (!resolved) resolved = resolveListing(tickerCandidates, ticker, name, type, exchange);

  if (!resolved && !keepUnlisted) {
    unlisted += 1;
    return;
  }

  const key = `${isin || ticker}:${exchange}:${ticker}:${type}`.toUpperCase();
  if (seen.has(key)) return;
  seen.add(key);
  if (isin) seenIsins.add(isin);

  results.push({
    query: ticker,
    ticker,
    name: name || resolved?.names?.[0] || ticker,
    exchange,
    currency,
    type,
    raw,
    isin: isin || resolved?.isin || "",
  });
}

async function rowsFromId(id, knownSymbol = "") {
  const info = await basicInfo(id);
  if (!info) {
    skip("no details");
    return;
  }
  if (info.type === "CFD" || info.unreadable) {
    skip(info.kind || "cfd");
    return;
  }

  const name = normalize(info.name);
  const type = listingType(info, name);
  if (!type) {
    skip(String(info.type || info.kind || "unknown").toLowerCase());
    return;
  }

  let symbol = knownSymbol || symbolFromLogo(info.logo);
  const isin = toIsin(info.isin);
  if (!symbol && isin) {
    const listings = await search(isin);
    symbol = listings?.find((listing) => listing.product === "equity")?.symbol || "";
  }
  const ticker = preferDottedClass(tickerFromSymbol(symbol));
  let match = isin ? catalogue.get(isin) : null;
  if (!match) match = resolveListing(tickerCandidates, ticker, name, type, "");
  const extras = (tickerCandidates.get(ticker) || []).filter(
    (candidate) => !isin || candidate.isin === isin
  );
  const exchanges = new Set(match?.exchanges || []);
  if (match?.exchange) exchanges.add(match.exchange);
  for (const extra of extras) {
    for (const code of extra.exchanges) exchanges.add(code);
  }
  if (match || extras.length) match = { ...match, isin: isin || match?.isin || extras[0]?.isin, exchanges };
  const exchange = venueOf(info, symbol, match);
  const currency = normalize(info.currency).toUpperCase();

  emit({
    ticker,
    name,
    exchange,
    currency,
    type,
    isin,
    match,
    raw: [symbol || ticker, name, exchange, currency].filter(Boolean).join(" "),
  });
}

const CONCURRENCY = 8;

async function mapPool(items, worker) {
  for (let offset = 0; offset < items.length; offset += CONCURRENCY) {
    const batch = items.slice(offset, offset + CONCURRENCY);
    await Promise.all(batch.map((item, index) => worker(item, offset + index)));
    if (offset === 0 || (offset + CONCURRENCY) % 200 === 0 || offset + CONCURRENCY >= items.length) {
      console.error(`[${Math.min(offset + CONCURRENCY, items.length)}/${items.length}] ${results.length} matched`);
    }
    if (results.length !== savedCount && Date.now() - savedAt >= SAVE_INTERVAL_MS) save();
  }
}

let reachable = false;
for (let attempt = 0; attempt < 6 && !reachable; attempt += 1) {
  reachable = (await search("AAPL")) !== null;
  if (!reachable) await sleep(1000);
}
if (!reachable) {
  throw new Error("XTB's instrument search did not answer. Is the platform still signed in?");
}

if ((wantStocks || wantEtfs) && onlyTickers.size === 0 && onlyIsins.size === 0) {
  const tree = await call(CATEGORIES, []);
  const ids = [];
  const seenId = new Set();
  for (const category of subs(tree, 1)) {
    for (const ref of collectEquityIds(category)) {
      if (seenId.has(ref.id)) continue;
      seenId.add(ref.id);
      ids.push(ref.id);
    }
  }
  console.error(`${ids.length} share-class listings in XTB's stocks tree`);
  await mapPool(ids, (id) => rowsFromId(id));
}

if (wantEtfs && onlyTickers.size === 0) {
  const etfIsins = [...catalogue.entries()]
    .filter(([, entry]) => entry.kind === "ETF")
    .map(([isin]) => isin)
    .filter((isin) => !seenIsins.has(isin));
  const jobs = onlyIsins.size > 0 ? [...onlyIsins] : etfIsins;
  console.error(`${jobs.length} fund ISINs still to search`);

  await mapPool(jobs.slice(startIndex - 1), async (isin) => {
    const listings = await search(isin);
    if (!listings) {
      skip("search failed");
      return;
    }
    const equities = listings.filter((listing) => listing.product === "equity" && listing.id);
    for (const equity of equities) await rowsFromId(equity.id, equity.symbol);
  });
}

if (onlyTickers.size > 0) {
  await mapPool([...onlyTickers], async (ticker) => {
    const listings = await search(ticker);
    if (!listings) return;
    for (const listing of listings.filter((row) => row.product === "equity" && row.id)) {
      await rowsFromId(listing.id, listing.symbol);
    }
  });
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
const byCurrency = new Map();
for (const row of results) byCurrency.set(row.currency, (byCurrency.get(row.currency) || 0) + 1);

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"}; ` +
    `${[...byCurrency].map(([currency, count]) => `${count} ${currency}`).join(", ") || "no currency"})` +
    (unlisted ? `, ${unlisted} the catalogues do not carry` : "") +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);

await browser.disconnect();
