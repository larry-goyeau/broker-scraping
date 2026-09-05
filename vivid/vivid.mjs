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
  // Class shares arrive as "BRK B" or "BRK/B". The catalogues keep the dot.
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
    if (!entry) index.set(isin, { isin, kind, names: name ? [name] : [], exchange, exchanges: new Set(exchange ? [exchange] : []) });
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

function resolveListing(tickerCandidates, ticker, scrapedName, type, currency) {
  const kind = type === "STOCK" ? "STOCK" : "ETF";
  let candidates = (tickerCandidates.get(ticker) || []).filter(
    (candidate) => !candidate.kind || candidate.kind === kind
  );
  if (currency === "USD") {
    const us = candidates.filter((candidate) => candidate.isin.startsWith("US"));
    if (us.length) candidates = us;
  } else if (currency === "EUR") {
    const eu = candidates.filter((candidate) => !candidate.isin.startsWith("US"));
    if (eu.length) candidates = eu;
    const tradegate = eu.filter((candidate) => candidate.exchanges.has("TRADEGATE"));
    if (tradegate.length) candidates = tradegate;
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    const only = candidates[0];
    return { ...only, ...scoreCandidate(scrapedName, only) };
  }

  const shortlist = candidates;
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

function listingType(shelf, name) {
  if (shelf === "CRYPTO") return "CRYPTO";
  if (/\bETNs?\b/i.test(name)) return "ETN";
  const withoutParens = name.replace(/\([^)]*\)/g, " ");
  if (/\bETCs?\b/i.test(withoutParens) && !/\bETFs?\b/i.test(name) && !/^ETC\b/i.test(name)) {
    return "ETC";
  }
  if (shelf === "ETF") return "ETF";
  return "STOCK";
}

const FIAT = new Set(["EUR", "USD", "GBP", "CHF", "PLN", "DKK", "SEK", "NOK"]);

// The live quote on each compilation row carries the trading currency. US
// names print USD; Tradegate names and the crypto book print EUR. Field 101
// (funds) sometimes decodes as text, so the walk also accepts a bare code.
function quoteCurrency(row, ticker, type) {
  const visit = (node, depth = 0) => {
    if (!node || depth > 6) return "";
    if (typeof node === "string") {
      const code = normalize(node).toUpperCase();
      return FIAT.has(code) && code !== ticker ? code : "";
    }
    if (typeof node !== "object") return "";
    const direct = normalize(node["1"]).toUpperCase();
    if (FIAT.has(direct) && direct !== ticker && node["2"] !== undefined) return direct;
    for (const value of Object.values(node)) {
      const found = visit(value, depth + 1);
      if (found) return found;
    }
    return "";
  };

  for (const key of ["100", "101", "102"]) {
    const found = visit(row[key]);
    if (found) return found;
  }

  // The ETF / iBond shelves were all euro when the sheets still answered.
  if (type === "ETF" || type === "ETC" || type === "ETN") return "EUR";
  if (type === "CRYPTO") return "EUR";
  return "";
}

const US_VENUES = ["NASDAQ", "NYSE", "AMEX", "CBOE", "OTC"];

function enrichMatch(match, ticker, isin) {
  const code = isin || match?.isin || "";
  const extras = (tickerCandidates.get(ticker) || []).filter(
    (candidate) => !code || candidate.isin === code
  );
  const exchanges = new Set(match?.exchanges || []);
  if (match?.exchange) exchanges.add(match.exchange);
  for (const extra of extras) {
    for (const exchange of extra.exchanges) exchanges.add(exchange);
  }
  if (!match && extras.length === 0) return null;
  return { ...match, isin: code || extras[0]?.isin || "", exchanges };
}

function venueOf(type, currency, match, sheetExchange, isin) {
  if (type === "CRYPTO") return "CRYPTO";
  const fromSheet = normalize(sheetExchange).toUpperCase();
  if (fromSheet) return fromSheet;
  if (currency === "EUR") return "TRADEGATE";
  const exchanges = match?.exchanges || new Set();
  for (const code of US_VENUES) {
    if (exchanges.has(code)) return code;
  }
  // Vivid's dollar book is US tapes. The catalogue sometimes only files a
  // European line for the same ISIN, so the tape is filled in as Nasdaq.
  if (currency === "USD" && String(match?.isin || isin || "").startsWith("US")) return "NASDAQ";
  return "";
}

// --- the treasury catalogue speaks grpc-web, so frames are built and read by hand ---

function readVarint(buffer, offset) {
  let result = 0;
  let shift = 0;
  while (offset < buffer.length) {
    const byte = buffer[offset++];
    result += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return [result, offset];
}

function decodeText(slice) {
  if (slice.length === 0) return null;
  const text = slice.toString("utf8");
  if (text.includes("\uFFFD")) return null;
  for (const character of text) {
    if (character.codePointAt(0) < 0x20) return null;
  }
  return text;
}

function parseMessage(buffer, depth = 0) {
  const out = {};
  let offset = 0;

  while (offset < buffer.length) {
    let tag;
    [tag, offset] = readVarint(buffer, offset);
    const number = tag >>> 3;
    const wire = tag & 7;

    let value;
    if (wire === 0) [value, offset] = readVarint(buffer, offset);
    else if (wire === 1) offset += 8;
    else if (wire === 5) offset += 4;
    else if (wire === 2) {
      let length;
      [length, offset] = readVarint(buffer, offset);
      const slice = buffer.subarray(offset, offset + length);
      offset += length;
      const text = decodeText(slice);
      if (text !== null) value = text;
      else value = depth >= 8 ? slice.toString("utf8") : parseMessage(slice, depth + 1);
    } else break;

    if (value === undefined) continue;
    if (out[number] === undefined) out[number] = value;
    else {
      if (!Array.isArray(out[number])) out[number] = [out[number]];
      out[number].push(value);
    }
  }

  return out;
}

function unframe(base64) {
  const buffer = Buffer.from(base64, "base64");
  const messages = [];
  let offset = 0;
  while (offset + 5 <= buffer.length) {
    const length = buffer.readUInt32BE(offset + 1);
    if (buffer[offset] === 0) messages.push(buffer.subarray(offset + 5, offset + 5 + length));
    offset += 5 + length;
  }
  return messages;
}

function asList(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// The instrument sheet spells the ISIN out in an "Info" row, and repeats it in
// the file name of every KID it links to. Many US names also put it in the
// icon URL. Descriptions are not scanned: they match the ISIN shape by chance.
function findIsin(sheet, iconUrl) {
  for (const section of asList(sheet?.["1"]?.["6"])) {
    for (const row of asList(section?.["2"])) {
      if (typeof row?.["1"] === "string" && /isin/i.test(row["1"])) {
        const isin = toIsin(row["2"]);
        if (isin) return isin;
      }
    }
  }

  const documents = JSON.stringify(sheet?.["1"]?.["4"] || "");
  const fromDocument = documents.match(/([A-Z]{2}[A-Z0-9]{9}[0-9])_[A-Z]{2}_\d{4}-/);
  if (fromDocument) return fromDocument[1];

  const fromIcon = String(iconUrl || "")
    .toUpperCase()
    .match(/\/([A-Z]{2}[A-Z0-9]{10})\.(?:PNG|SVG|JPG|WEBP)/);
  return fromIcon ? fromIcon[1] : "";
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
const tickerCandidates = new Map();
if (wantEtfs) loadTickerCandidatesFromCsv(etfsCsvPath, "ETF", tickerCandidates);
if (wantStocks) loadTickerCandidatesFromCsv(stocksCsvPath, "STOCK", tickerCandidates);
const cryptoTickers = wantCrypto ? loadCryptoTickers(cryptosCsvPath) : new Set();

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

const outputPath = new URL("vivid-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

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
  pages.find((candidate) => candidate.url().includes("business.vivid.money")) ||
  (await browser.newPage());
await page.bringToFront();

if (!page.url().includes("business.vivid.money")) {
  await page.goto("https://business.vivid.money/", { waitUntil: "domcontentloaded" });
  await sleep(5000);
}

const SHOWCASE = "vivid.frontend.web.trading_nl.showcase.v1.InvestShowcaseService";
const INSTRUMENT = "vivid.frontend.shared.invest.instrument.v1.InvestInstrumentService";

// Calls ride the session the browser already holds. `fields` are the string
// fields of the request message.
async function call(service, method, fields) {
  const answer = await page.evaluate(
    async (service, method, fields) => {
      const encoder = new TextEncoder();
      const parts = [];
      for (const field of fields) {
        const bytes = encoder.encode(String(field.value));
        const header = [];
        let rest = bytes.length;
        do {
          let byte = rest & 0x7f;
          rest >>>= 7;
          if (rest > 0) byte |= 0x80;
          header.push(byte);
        } while (rest > 0);
        const segment = new Uint8Array(1 + header.length + bytes.length);
        segment[0] = (field.number << 3) | 2;
        segment.set(header, 1);
        segment.set(bytes, 1 + header.length);
        parts.push(segment);
      }

      const payload = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
      let offset = 0;
      for (const part of parts) {
        payload.set(part, offset);
        offset += part.length;
      }

      const framed = new Uint8Array(5 + payload.length);
      new DataView(framed.buffer).setUint32(1, payload.length);
      framed.set(payload, 5);

      try {
        const response = await fetch(`/api/grpc/${service}/${method}`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/grpc-web+proto", "x-grpc-web": "1" },
          body: framed,
        });
        const buffer = new Uint8Array(await response.arrayBuffer());
        let binary = "";
        for (const byte of buffer) binary += String.fromCharCode(byte);
        return {
          http: response.status,
          status: response.headers.get("grpc-status"),
          body: btoa(binary),
        };
      } catch {
        return { http: 0, status: "-1", body: "" };
      }
    },
    service,
    method,
    fields
  );

  if (Number(answer.http) === 429) return { throttled: true };
  if (answer.status && answer.status !== "0") return { error: answer.status };
  return unframe(answer.body).map((message) => parseMessage(message))[0] || null;
}

async function callRetry(service, method, fields) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const answer = await call(service, method, fields);
    if (answer?.throttled || !answer) {
      const wait = 4000 * (attempt + 1);
      console.error(`  Vivid asked to wait ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (answer.error) return null;
    return answer;
  }
  return null;
}

const categories = await callRetry(SHOWCASE, "ListCategories", []);
if (!categories) {
  throw new Error("Vivid did not answer. Is business.vivid.money signed in?");
}

function shelfOf(categoryName) {
  const name = normalize(categoryName);
  if (/^ETFs?$/i.test(name) || /^iBonds$/i.test(name)) return "ETF";
  if (/^Stocks$/i.test(name)) return "STOCK";
  if (/^Crypto$/i.test(name)) return "CRYPTO";
  return "";
}

async function listCompilation(categoryId) {
  const listed = [];
  let cursor = "";
  for (let guard = 0; guard < 300; guard += 1) {
    const fields = [{ number: 1, value: categoryId }];
    if (cursor) fields.push({ number: 3, value: cursor });
    const answer = await callRetry(SHOWCASE, "GetCompilation", fields);
    const rows = asList(answer?.["1"]);
    listed.push(...rows);
    cursor = typeof answer?.["2"] === "string" ? answer["2"] : "";
    if (!cursor || rows.length === 0) break;
  }
  return listed;
}

const listed = [];
for (const category of asList(categories["1"])) {
  const shelf = shelfOf(category?.["2"]);
  if (!shelf) continue;
  if (shelf === "ETF" && !wantEtfs) continue;
  if (shelf === "STOCK" && !wantStocks) continue;
  if (shelf === "CRYPTO" && !wantCrypto) continue;

  const rows = await listCompilation(category["1"]);
  console.error(`${rows.length} ${normalize(category["2"])}`);
  for (const row of rows) listed.push({ row, shelf });
}

console.error(`${listed.length} instruments in Vivid's treasury catalogue`);

const jobs = listed.filter(({ row, shelf }) => {
  const ticker = normalizeTicker(row["3"]);
  const isinGuess = findIsin(null, row["4"]);
  if (onlyIsins.size > 0 || onlyTickers.size > 0) {
    return onlyIsins.has(isinGuess) || onlyTickers.has(ticker);
  }
  if (shelf === "CRYPTO") return keepUnlisted || cryptoTickers.has(ticker);
  return true;
});

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

function emit({ ticker, name, exchange, currency, type, isin, match }) {
  if (!ticker || !type) {
    skip("no ticker");
    return;
  }
  if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) return;
  if (type === "STOCK" && !wantStocks) return;
  if (type === "CRYPTO" && !wantCrypto) return;
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker) && !onlyIsins.has(isin)) return;
  if (!exchange) {
    skip("no exchange");
    return;
  }
  if (!currency) {
    skip("no currency");
    return;
  }

  if (type === "CRYPTO") {
    if (!cryptoTickers.has(ticker) && !keepUnlisted) {
      unlisted += 1;
      return;
    }
  } else if (!match && !keepUnlisted) {
    unlisted += 1;
    return;
  }

  const key = `${isin || ticker}:${exchange}:${ticker}:${type}`.toUpperCase();
  if (seen.has(key)) return;
  seen.add(key);

  results.push({
    query: ticker,
    ticker,
    name: name || match?.names?.[0] || ticker,
    exchange,
    currency,
    type,
    raw: [ticker, name, exchange, currency].filter(Boolean).join(" "),
    isin: isin || match?.isin || "",
  });
}

// The live quote already has the currency. GetStaticInfo is reserved for
// euro shares, whose venue is sometimes Euronext or Xetra rather than
// Tradegate — hammering every sheet trips Vivid's 429.
const needSheet = [];

for (let offset = startIndex - 1; offset < jobs.length; offset += 1) {
  const { row, shelf } = jobs[offset];
  const ticker = normalizeTicker(row["3"]);
  const name = normalize(row["2"]);
  const type = listingType(shelf, name);
  const currency = quoteCurrency(row, ticker, type);
  const isin = type === "CRYPTO" ? "" : findIsin(null, row["4"]);
  let match = isin ? catalogue.get(isin) : null;
  if (!match && type !== "CRYPTO") {
    match = resolveListing(tickerCandidates, ticker, name, type, currency);
  }
  if (type !== "CRYPTO") match = enrichMatch(match, ticker, isin);

  const wantsSheet =
    (type === "STOCK" && currency === "EUR") ||
    ((type === "ETF" || type === "ETC" || type === "ETN") && !isin && !match);
  if (wantsSheet) {
    needSheet.push({ row, ticker, name, type, currency, isin, match });
    continue;
  }

  emit({
    ticker,
    name,
    exchange: venueOf(type, currency, match, "", isin || match?.isin || ""),
    currency,
    type,
    isin: isin || match?.isin || "",
    match,
  });
}

console.error(`${needSheet.length} euro shares still need a venue`);

const BATCH = 3;
for (let offset = 0; offset < needSheet.length; offset += BATCH) {
  const batch = needSheet.slice(offset, offset + BATCH);
  const sheets = [];
  for (const item of batch) {
    sheets.push(await callRetry(INSTRUMENT, "GetStaticInfo", [{ number: 1, value: item.row["1"] }]));
    await sleep(150);
  }

  for (const [index, item] of batch.entries()) {
    const sheet = sheets[index];
    const isin = item.isin || findIsin(sheet, item.row["4"]);
    let match = isin ? catalogue.get(isin) : item.match;
    if (!match) match = resolveListing(tickerCandidates, item.ticker, item.name, item.type, item.currency);
    match = enrichMatch(match, item.ticker, isin);
    emit({
      ticker: item.ticker,
      name: item.name,
      exchange: venueOf(item.type, item.currency, match, sheet?.["1"]?.["7"], isin || match?.isin || ""),
      currency: item.currency,
      type: item.type,
      isin: isin || match?.isin || "",
      match,
    });
  }

  if (offset === 0 || (offset + BATCH) % 30 === 0 || offset + BATCH >= needSheet.length) {
    console.error(`[${Math.min(offset + BATCH, needSheet.length)}/${needSheet.length}] ${results.length} matched`);
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
