import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));

function readArg(name, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${name}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

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
  return firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
}

// The app blocks screen recording, so the catalogue is photographs of the
// phone. Four shelves: Stocks (name + ticker), ETFs (name + "Issuer • TICKER"),
// Crypto (name + ticker), ETCs (name + ticker, logo only). ExtraETF's N26
// savings-plan lists do not match what the app actually shows.
const photoDir = readArg("dir", here);
const ocrCache = readArg("ocr", path.join(here, "n26-ocr.tsv"));
const fresh = hasFlag("fresh");
const keepUnlisted = hasFlag("all");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;
const wantCrypto = !etfsOnly && !stocksOnly;

const etfsCsvPath = readArg("csv", path.join(here, "../etfs.csv"));
const stocksCsvPath = readArg("stocks-csv", path.join(here, "../stocks.csv"));
const cryptosCsvPath = readArg("cryptos-csv", path.join(here, "../cryptos.csv"));

if (!fs.existsSync(photoDir)) {
  throw new Error(`No photo directory at ${photoDir}.`);
}

const EUROPEAN_ISIN = /^(IE|LU|FR|DE|NL|GB|AT|BE|ES|IT|JE|GG|XS|CH|SE|DK|FI|NO)/;

function loadListings(file, kind, index = new Map()) {
  if (!file || !fs.existsSync(file)) return index;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    if (!ticker) continue;
    const exchange = toIsin(columns[1]) ? "" : normalize(columns[1]).toUpperCase();
    const isin = toIsin(columns[2]) || toIsin(columns[1]) || "";
    const name = normalize(columns.slice(3).join(","));
    if (!index.has(ticker)) index.set(ticker, []);
    index.get(ticker).push({ ticker, exchange, isin, name, kind });
  }
  return index;
}

const fundsByTicker = wantEtfs ? loadListings(etfsCsvPath, "ETF") : new Map();
const stocksByTicker = wantStocks ? loadListings(stocksCsvPath, "STOCK") : new Map();
const cryptosByTicker = wantCrypto ? loadListings(cryptosCsvPath, "CRYPTO") : new Map();

const ETF_VENUE_RANK = {
  XETR: 0,
  TRADEGATE: 1,
  GETTEX: 2,
  LSX: 3,
  LS: 4,
  LSE: 5,
  EURONEXT: 6,
  VIE: 7,
  SIX: 8,
};

const STOCK_VENUE_RANK = {
  TRADEGATE: 0,
  GETTEX: 1,
  XETR: 2,
  LSX: 3,
  LS: 4,
  FWB: 5,
  SWB: 6,
  NASDAQ: 7,
  NYSE: 8,
  AMEX: 9,
  LSE: 10,
  EURONEXT: 11,
};

function pickListing(listings, kind) {
  if (!listings.length) return null;
  const rank = kind === "STOCK" ? STOCK_VENUE_RANK : ETF_VENUE_RANK;
  return [...listings].sort((left, right) => {
    const byVenue = (rank[left.exchange] ?? 80) - (rank[right.exchange] ?? 80);
    if (byVenue !== 0) return byVenue;
    return String(left.ticker).length - String(right.ticker).length;
  })[0];
}

const CONFUSABLE = {
  O: ["0"],
  0: ["O"],
  I: ["1", "L"],
  1: ["I", "L"],
  L: ["I", "1"],
  S: ["5"],
  5: ["S"],
  B: ["8"],
  8: ["B"],
  Z: ["2"],
  2: ["Z"],
  G: ["6"],
  6: ["G"],
  T: ["7"],
  7: ["T"],
};

function readings(ticker) {
  const found = new Set([ticker, ticker.replace(/VV/g, "W"), ticker.replace(/W/g, "VV")]);
  for (let index = 0; index < ticker.length; index += 1) {
    for (const swap of CONFUSABLE[ticker[index]] || []) {
      for (const seen of [...found]) {
        if (seen.length === ticker.length) {
          found.add(seen.slice(0, index) + swap + seen.slice(index + 1));
        }
      }
    }
  }
  return [...found];
}

const BOILERPLATE = new Set([
  "ucits", "etf", "etfs", "etc", "fund", "funds", "plc", "icav", "sicav", "shs", "units",
  "unit", "index", "the", "of", "and", "acc", "accum", "dist", "class", "eur", "usd", "gbp",
  "capitalisation", "distribution", "securities", "swap", "inc", "corp", "corporation",
  "ltd", "limited", "se", "ag", "sa", "nv", "co", "holdings", "hldgs",
]);

function words(text) {
  return (text || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word && !BOILERPLATE.has(word));
}

function similarity(left, right) {
  const a = new Set(words(left));
  const b = new Set(words(right));
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.max(a.size, b.size);
}

const SWIFT_OCR = `import Foundation
import Vision
import AppKit

for path in CommandLine.arguments.dropFirst() {
    guard let image = NSImage(contentsOfFile: path),
          let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try? handler.perform([request])

    for observation in (request.results ?? []) {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let box = observation.boundingBox
        let text = candidate.string.replacingOccurrences(of: "\\t", with: " ")
        print("\\(path)\\t\\(box.minX)\\t\\(box.minY)\\t\\(text)")
    }
}
`;

const photos = fs
  .readdirSync(photoDir)
  .filter((name) => /\.(jpe?g|png|heic)$/i.test(name))
  .sort()
  .map((name) => path.join(photoDir, name));

if (photos.length === 0) throw new Error(`No pictures in ${photoDir}.`);

function foldGlyphs(text) {
  return String(text || "").replace(/[АВСЕНКМОРТХУаеорсух]/g, (ch) => {
    const map = {
      А: "A", В: "B", С: "C", Е: "E", Н: "H", К: "K", М: "M", О: "O", Р: "P", Т: "T", Х: "X", У: "Y",
      а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x",
    };
    return map[ch] || ch;
  });
}

function variance(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

// Freehand shots are often on their side. Prices sit in a vertical column on
// an upright frame and in a horizontal strip when the phone is rotated.
function orient(lines) {
  const euros = lines.filter((line) => /€/.test(line.text));
  if (euros.length < 3) return lines;
  const vx = variance(euros.map((line) => line.x));
  const vy = variance(euros.map((line) => line.y));
  if (vy >= vx) return lines;
  const meanY = euros.reduce((sum, line) => sum + line.y, 0) / euros.length;
  if (meanY < 0.5) {
    return lines.map((line) => ({ ...line, x: 1 - line.y, y: line.x }));
  }
  return lines.map((line) => ({ ...line, x: line.y, y: 1 - line.x }));
}

function parseOcr(text) {
  const byPhoto = new Map();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const [photo, minX, minY, ...rest] = line.split("\t");
    const value = foldGlyphs(rest.join("\t").trim());
    if (!value) continue;
    if (!byPhoto.has(photo)) byPhoto.set(photo, []);
    byPhoto.get(photo).push({ x: Number(minX), y: Number(minY), text: value });
  }
  return byPhoto;
}

let ocrText = "";
if (!fresh && fs.existsSync(ocrCache) && fs.statSync(ocrCache).size > 0) {
  ocrText = fs.readFileSync(ocrCache, "utf8");
  console.error(`reusing OCR cache ${ocrCache}`);
} else {
  console.error(`${photos.length} pictures to read`);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "n26-"));
  const swiftPath = path.join(workDir, "ocr.swift");
  const binPath = path.join(workDir, "ocr");
  fs.writeFileSync(swiftPath, SWIFT_OCR);
  execFileSync("swiftc", ["-O", "-o", binPath, swiftPath], { stdio: "inherit" });

  const batches = [];
  const size = 40;
  for (let i = 0; i < photos.length; i += size) batches.push(photos.slice(i, i + size));
  const chunks = [];
  for (const [index, batch] of batches.entries()) {
    process.stderr.write(`\r  OCR ${Math.min((index + 1) * size, photos.length)}/${photos.length}`);
    chunks.push(
      execFileSync(binPath, batch, {
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      })
    );
  }
  process.stderr.write("\n");
  ocrText = chunks.join("");
  fs.writeFileSync(ocrCache, ocrText);
  fs.rmSync(workDir, { recursive: true, force: true });
}

const byPhoto = parseOcr(ocrText);

const VENUES = ["FP", "GY", "GR", "LN", "NA", "SE", "SW", "IM", "SM", "SS", "BB", "ID", "AV", "VX"];
const TAIL = `([A-Z0-9]{1,8})(?:\\s+(?:${VENUES.join("|")}))?$`;
const WITH_ISSUER = new RegExp(`^(.+?)\\s*[•·*]\\s*${TAIL}`);
const DASHED = new RegExp(`^([A-Za-z][A-Za-z&.' ]{1,22})\\s+[-–—]\\s+${TAIL}`);
const BARE_TICKER = /^[A-Z0-9]{1,8}$/;
const CHROME =
  /Showing|results|^Issuer$|^Region$|^Industry|^Dividend|^Stocks$|^ETFs$|^Crypto$|^ETCs$|^€|%$|Search by name/i;
const NOT_A_TICKER = new Set([
  "ETF", "ETFS", "ETC", "ETCS", "ESG", "SRI", "PAB", "USD", "EUR", "GBP", "CHF", "USA", "TOP",
  "ACC", "DIST", "UCITS", "MSCI", "SWAP", "STOCKS", "CRYPTO", "REGION", "INDUSTRY", "INDEX",
  "YIELD", "ISSUER", "RESULTS", "SEARCH", "NAME", "TICKER", "ISIN", "DIVIDEND",
  "ISHARES", "VANGUARD", "XTRACKERS", "ROBECO", "PIMCO", "AMUNDI", "INVESCO", "WISDOMTREE",
  "BLACKROCK", "JPMORGAN", "GOLDMAN", "LYXOR", "DWS", "DEKA", "SPDR", "SSGA", "FIDELITY",
  "VAN", "ECK", "BNPP", "EASY", "UBS", "HSBC", "STATE", "STREET",
]);

function digitsOf(text) {
  return Number(
    String(text || "")
      .replace(/[Oo]/g, "0")
      .replace(/[Il]/g, "1")
      .replace(/[^\d]/g, "")
  );
}

function shelfFromCount(total) {
  if (total >= 2800 && total <= 3500) return "STOCK";
  if (total >= 1800 && total <= 2500) return "ETF";
  if (total >= 250 && total <= 450) return "CRYPTO";
  if (total >= 15 && total <= 80) return "ETC";
  return "";
}

function shelfOf(lines, lastShelf) {
  for (const line of lines) {
    const count = line.text.match(/Showing\s+([\dOIl.,]+)\s+results/i);
    if (!count) continue;
    const shelf = shelfFromCount(digitsOf(count[1]));
    if (shelf) return shelf;
  }
  let issuerRows = 0;
  for (const line of lines) {
    if (WITH_ISSUER.test(line.text) || DASHED.test(line.text)) issuerRows += 1;
  }
  if (issuerRows >= 3) return "ETF";
  return lastShelf;
}

function isTickerLine(text) {
  return (
    WITH_ISSUER.test(text) ||
    DASHED.test(text) ||
    (BARE_TICKER.test(text) && !NOT_A_TICKER.has(text))
  );
}

const listed = new Map();
const advertised = new Map();
let lastShelf = "ETF";

for (const [photo, rawLines] of [...byPhoto.entries()].sort()) {
  const lines = orient(rawLines);
  const shelf = shelfOf(lines, lastShelf) || lastShelf;
  lastShelf = shelf;
  for (const line of lines) {
    const count = line.text.match(/Showing\s+([\dOIl.,]+)\s+results/i);
    if (count) {
      const total = digitsOf(count[1]);
      advertised.set(total, (advertised.get(total) || 0) + 1);
    }
  }

  const column = lines.filter((line) => line.x < 0.62).sort((first, second) => second.y - first.y);

  for (const [index, line] of column.entries()) {
    const withIssuer = line.text.match(WITH_ISSUER) || line.text.match(DASHED);
    const bare = !withIssuer && BARE_TICKER.test(line.text) && !NOT_A_TICKER.has(line.text);
    if (shelf === "ETF") {
      if (!withIssuer && !bare) continue;
    } else if (!bare) {
      continue;
    }

    const ticker = (withIssuer ? withIssuer[2] : line.text).toUpperCase();
    const issuer = withIssuer ? withIssuer[1].trim() : "";

    const nameLines = [];
    for (let above = index - 1; above >= 0; above -= 1) {
      const previous = column[above];
      if (Math.abs(previous.x - line.x) > 0.08) continue;
      if (CHROME.test(previous.text)) break;
      // NVIDIA, SAP, XRP print as a short all-caps name sitting where a ticker
      // would. That line is still the name; the row below is the ticker.
      if (isTickerLine(previous.text)) {
        if (nameLines.length === 0) nameLines.unshift(previous.text);
        break;
      }
      nameLines.unshift(previous.text);
      if (nameLines.length >= 3) break;
    }

    if (!withIssuer && nameLines.length === 0) continue;

    const key = `${shelf}:${ticker}`;
    const row = {
      ticker,
      issuer,
      name: nameLines.join(" ").trim(),
      type: shelf,
    };
    const seen = listed.get(key);
    if (!seen || row.name.length > seen.name.length) listed.set(key, row);
  }
}

console.error(`${listed.size} instruments read from the pictures`);
for (const [total, seen] of [...advertised.entries()].sort((a, b) => b[1] - a[1])) {
  const shelf = shelfFromCount(total) || "?";
  console.error(`  the app reported ${total} ${shelf} results on ${seen} of them`);
}

function listingType(shelf, name) {
  const text = name || "";
  if (shelf === "CRYPTO") return "CRYPTO";
  if (shelf === "STOCK") return "STOCK";
  if (/\bETNs?\b/i.test(text)) return "ETN";
  if (shelf === "ETC" || /\bETCs?\b/i.test(text)) return "ETC";
  return "ETF";
}

function currencyOf(type, exchange) {
  if (type === "CRYPTO") return "EUR";
  if (["NASDAQ", "NYSE", "AMEX", "CBOE", "OTC"].includes(exchange)) return "USD";
  if (exchange === "LSE" || exchange === "LSIN") return "GBP";
  if (exchange === "SIX") return "CHF";
  return "EUR";
}

function bestByName(row, candidates) {
  if (!candidates.length) return null;
  const probe = `${row.issuer} ${row.name}`;
  const scored = candidates
    .map((candidate) => ({ candidate, score: similarity(probe, candidate.name) }))
    .sort((left, right) => right.score - left.score);
  return scored[0];
}

function matchFund(row) {
  const european = (reading) =>
    (fundsByTicker.get(reading) || []).filter((candidate) => EUROPEAN_ISIN.test(candidate.isin));
  const asPrinted = european(row.ticker);
  const pool = asPrinted.length > 0 ? asPrinted : readings(row.ticker).flatMap(european);
  if (pool.length === 0) return null;
  const best = bestByName(row, pool);
  if (!best) return null;
  if (asPrinted.length > 0 || best.score >= 0.3) {
    const same = pool.filter((candidate) => candidate.isin === best.candidate.isin);
    return pickListing(same, "ETF");
  }
  return null;
}

function matchStock(row) {
  const pool = stocksByTicker.get(row.ticker) || [];
  const guessed = pool.length > 0 ? pool : readings(row.ticker).flatMap((reading) => stocksByTicker.get(reading) || []);
  if (guessed.length === 0) return null;
  const byIsin = new Map();
  for (const candidate of guessed) {
    if (!candidate.isin) continue;
    if (!byIsin.has(candidate.isin)) byIsin.set(candidate.isin, []);
    byIsin.get(candidate.isin).push(candidate);
  }
  const names = [...byIsin.values()].map((group) => ({
    listings: group,
    name: group[0].name,
  }));
  const best = bestByName(
    row,
    names.map((group) => ({ name: group.name, listings: group.listings }))
  );
  if (!best) return pickListing(guessed, "STOCK");
  if (pool.length === 0 && best.score < 0.3) return null;
  return pickListing(best.candidate.listings, "STOCK");
}

function matchCrypto(row) {
  const pool = cryptosByTicker.get(row.ticker) || [];
  const guessed = pool.length > 0 ? pool : readings(row.ticker).flatMap((reading) => cryptosByTicker.get(reading) || []);
  if (guessed.length === 0) return null;
  const best = bestByName(row, guessed);
  if (!best) return guessed[0];
  if (pool.length === 0 && best.score < 0.3) return null;
  return best.candidate;
}

const results = [];
const seenKeys = new Set();
const unmatched = [];

function emit(row, listing) {
  const type = listingType(row.type, `${row.name} ${listing?.name || ""}`);
  const ticker = listing?.ticker || row.ticker;
  const exchange = type === "CRYPTO" ? "CRYPTO" : listing?.exchange || null;
  const isin = listing?.isin || "";
  const name = listing?.name || row.name || ticker;
  const key = `${isin || ticker}:${exchange || ""}:${ticker}:${type}`.toUpperCase();
  if (seenKeys.has(key)) return;
  seenKeys.add(key);
  results.push({
    query: row.ticker,
    ticker,
    name,
    exchange,
    currency: currencyOf(type, exchange),
    type,
    raw: [`${row.issuer} ${row.name}`.trim(), row.ticker, isin].filter(Boolean).join(" | "),
    isin,
  });
}

for (const row of listed.values()) {
  if (row.type === "ETF" || row.type === "ETC") {
    if (!wantEtfs) continue;
    const listing = matchFund(row);
    if (listing) emit(row, listing);
    else if (keepUnlisted) emit(row, null);
    else unmatched.push(`${row.type} ${row.ticker} (${row.issuer} ${row.name})`.replace(/\s+/g, " "));
    continue;
  }
  if (row.type === "STOCK") {
    if (!wantStocks) continue;
    const listing = matchStock(row);
    if (listing) emit(row, listing);
    else if (keepUnlisted) emit(row, null);
    else unmatched.push(`STOCK ${row.ticker} (${row.name})`.replace(/\s+/g, " "));
    continue;
  }
  if (row.type === "CRYPTO") {
    if (!wantCrypto) continue;
    const listing = matchCrypto(row);
    if (listing) emit(row, listing);
    else if (keepUnlisted) emit(row, null);
    else unmatched.push(`CRYPTO ${row.ticker} (${row.name})`.replace(/\s+/g, " "));
  }
}

results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(String(right.exchange));
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(String(right.ticker));
});

fs.writeFileSync(new URL("n26-parsed.json", import.meta.url), JSON.stringify(results, null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"})` +
    (unmatched.length ? `, ${unmatched.length} the catalogues do not carry` : "")
);
if (unmatched.length > 0 && unmatched.length <= 40) {
  console.error(`  ${unmatched.join("; ")}`);
} else if (unmatched.length > 40) {
  console.error(`  e.g. ${unmatched.slice(0, 12).join("; ")}`);
}
