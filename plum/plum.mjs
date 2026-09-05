import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Plum has no web app and its Android app pins its certificates, so the book
// cannot be read from the network. What the app will show is its screen, so
// the catalogue is recovered from a screen recording of Discover → All: the
// frames are read with the system OCR and the tickers are matched to the CSVs.

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
  return (afterExchange || "").split(/[./]/)[0].trim();
}

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

const videoPath = readArg("video", new URL("az_recorder_20260904_191159.mp4", import.meta.url));
const etfsCsvPath = readArg("csv", new URL("../etfs.csv", import.meta.url));
const stocksCsvPath = readArg("stocks-csv", new URL("../stocks.csv", import.meta.url));
const fps = Number(readArg("fps", "6"));
// A row stays on screen across many frames. One-frame tickers are kept only
// when they already sit in a catalogue and a name was read above them.
const minSightings = Number(readArg("min-sightings", "2"));
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const keepUnlisted = hasFlag("all");
const freshOcr = hasFlag("fresh");

if (!fs.existsSync(videoPath)) {
  throw new Error(`No recording at ${videoPath}.`);
}

// Plum only sells UCITS funds, so when a ticker is quoted both in Europe and
// abroad the European share class is the one it lists.
const UCITS_PREFIXES = ["IE", "LU", "FR", "DE", "NL", "GB", "AT", "BE", "ES", "IT", "JE"];
const US_EXCHANGES = new Set(["NASDAQ", "NYSE", "AMEX", "CBOE", "BATS", "ARCA", "OTC"]);

// Plum quotes gettex tickers, and the CSV carries a few of these funds only
// under the ticker of another listing.
const GETTEX_ALIASES = {
  VOOP: "FR0013380607", // Amundi CAC 40 UCITS ETF Acc, listed as CACC
  AYE7: "IE00BMTX2B82", // iShares AEX UCITS ETF EUR Acc, listed as IAEA
};

const IGNORE_TICKERS = new Set([
  "ALL",
  "HOME",
  "SEARCH",
  "INVEST",
  "TODAY",
  "FUNDS",
  "FOCUS",
  "GLOBAL",
  "REGIONAL",
  "POCKETS",
  "DISCOVER",
  "VIDEOS",
  "UNLOCK",
  "AMUNDI",
]);

function isKeyboardJunk(name) {
  return /uiop|qwerty|asdf|fr\s*[•·]\s*en/i.test(name || "");
}

function loadCsv(file, kind, index = { byTicker: new Map(), byIsin: new Map() }) {
  if (!fs.existsSync(file)) return index;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isin = toIsin(columns[2]) || columns.map(toIsin).find(Boolean);
    if (!ticker || !isin) continue;

    const exchange = (columns[1] || "").trim().toUpperCase();
    const name = columns.slice(3).join(",").trim();
    const row = { exchange, isin, name, kind };

    const listed = index.byTicker.get(ticker) || [];
    if (!listed.some((candidate) => candidate.isin === isin && candidate.kind === kind)) {
      listed.push(row);
      index.byTicker.set(ticker, listed);
    }
    if (!index.byIsin.has(isin)) index.byIsin.set(isin, row);
  }

  return index;
}

const GENERIC_TOKENS = new Set([
  "LTD",
  "LIMITED",
  "PLC",
  "INC",
  "CORP",
  "CORPORATION",
  "LLC",
  "THE",
  "CO",
  "COMPANY",
  "GROUP",
  "HOLDINGS",
]);

function nameTokens(value) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token));
}

function nameScore(scrapedName, candidateName) {
  const scraped = nameTokens(scrapedName);
  const candidate = nameTokens(candidateName);
  if (scraped.length === 0 || candidate.length === 0) return 0;

  const used = new Set();
  let matched = 0;
  for (const token of scraped) {
    const index = candidate.findIndex((other, position) => !used.has(position) && (other === token || (token.length >= 4 && other.startsWith(token)) || (other.length >= 4 && token.startsWith(other))));
    if (index >= 0) {
      used.add(index);
      matched += 1;
    }
  }
  return matched / Math.max(scraped.length, candidate.length);
}

function looksLikeShare(name) {
  return /\b(inc|incorporated|corp|corporation|ltd|limited|plc|co|company|holdings|group|nv|sa|ag|lp)\b/i.test(
    name || ""
  );
}

const CHIP_LABELS = /^(all funds|beginner focus|global|regional|all|today|5yr annualised|search|discover)$/i;

function usableLabel(name) {
  const text = normalize(name);
  if (!text) return false;
  if (isKeyboardJunk(text) || CHIP_LABELS.test(text)) return false;
  if (/^[\d.,%+\-↑↓$]+$/.test(text)) return false;
  if ((text.match(/[A-Za-z]/g) || []).length < 3) return false;
  return true;
}

function labelForTicker(column, index, tickerY) {
  for (let cursor = index - 1; cursor >= Math.max(0, index - 4); cursor -= 1) {
    const candidate = column[cursor];
    const dy = candidate.y - tickerY;
    if (dy <= 0 || dy > 0.08) continue;
    const text = candidate.text.trim();
    if (/^[A-Z0-9]{1,6}$/.test(text)) continue;
    if (!usableLabel(text)) continue;
    return text;
  }
  return "";
}

function listingType(kind, name) {
  if (kind === "ETF") {
    if (/\bETC\b/i.test(name || "")) return "ETC";
    if (/\bETN\b/i.test(name || "")) return "ETN";
    return "ETF";
  }
  return kind || "STOCK";
}

// The ticker sits under the fund name in small grey type, where the system OCR
// reliably confuses a handful of glyph pairs; the CSV decides which reading of
// an ambiguous ticker is the real one.
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
};

function readings(ticker) {
  // "W" is drawn as two overlapping strokes and often comes back as "VV".
  const found = new Set([ticker, ticker.replace(/VV/g, "W")]);
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

function pickRow(plumName, rows, preferUcits = false) {
  if (rows.length === 1) return rows[0];

  const scored = rows.map((row) => ({
    row,
    score: nameScore(plumName, row.name),
    us: US_EXCHANGES.has(row.exchange) ? 1 : 0,
    stock: row.kind === "STOCK" ? 1 : 0,
    ucits: UCITS_PREFIXES.includes((row.isin || "").slice(0, 2)) ? 1 : 0,
  }));

  scored.sort((left, right) => {
    if (preferUcits) return right.ucits - left.ucits || right.score - left.score || right.stock - left.stock;
    if (right.score !== left.score) return right.score - left.score;
    return right.stock - left.stock || right.us - left.us || right.ucits - left.ucits;
  });

  const best = scored[0];
  if (best.score >= 0.35) return best.row;
  if (preferUcits) {
    const ucits = scored.find((candidate) => candidate.row.kind === "ETF" && candidate.ucits);
    if (ucits) return ucits.row;
    const fund = scored.find((candidate) => candidate.row.kind === "ETF");
    if (fund) return fund.row;
    return best.row;
  }
  const listed = scored.find((candidate) => candidate.row.kind === "STOCK");
  if (listed) return listed.row;
  return best.row;
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

const videoKey = `${path.basename(String(videoPath))}-${fps}fps-${fs.statSync(videoPath).size}`;
const ocrCachePath = path.join(os.tmpdir(), `plum-ocr-${videoKey}.txt`);
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "plum-"));

let ocr;
if (!freshOcr && fs.existsSync(ocrCachePath)) {
  console.error(`using OCR cache ${ocrCachePath}`);
  ocr = fs.readFileSync(ocrCachePath, "utf8");
} else {
  const frameDir = path.join(workDir, "frames");
  fs.mkdirSync(frameDir);

  console.error(`reading ${videoPath} at ${fps} fps`);
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", videoPath, "-vf", `fps=${fps}`, path.join(frameDir, "f_%05d.png")],
    { stdio: ["ignore", "ignore", "inherit"] }
  );

  const frames = fs.readdirSync(frameDir).sort().map((name) => path.join(frameDir, name));
  console.error(`${frames.length} frames to read`);

  const swiftPath = path.join(workDir, "ocr.swift");
  fs.writeFileSync(swiftPath, SWIFT_OCR);

  ocr = execFileSync("swift", [swiftPath, ...frames], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  fs.writeFileSync(ocrCachePath, ocr);
}

// Each frame is a screenful of rows; a row is a name with its ticker underneath,
// both in the left column. Logos sit further left and the day's move further right.
const sightings = new Map();
const labels = new Map();
const fundSightings = new Map();
const stockSightings = new Map();
const byFrame = new Map();

for (const line of ocr.split("\n")) {
  if (!line.trim()) continue;
  const [frame, minX, minY, ...rest] = line.split("\t");
  const text = rest.join("\t").trim();
  if (!text) continue;
  if (!byFrame.has(frame)) byFrame.set(frame, []);
  byFrame.get(frame).push({ x: Number(minX), y: Number(minY), text });
}

for (const rows of byFrame.values()) {
  // The recorder's own gallery is in the same file, before and after the scroll.
  if (rows.some((row) => /^(videos|unlock)$/i.test(row.text.trim()))) continue;
  if (rows.some((row) => /^close all$/i.test(row.text.trim()))) continue;

  const keyboard = rows.some((row) => /fr\s*[•·]\s*en/i.test(row.text) || /^tyuiop$/i.test(row.text.trim()));
  const fundFrame = rows.some((row) => /annualised|5\s*yr/i.test(row.text));
  const stockFrame = rows.some((row) => /^today$/i.test(row.text.trim()));
  const minY = keyboard ? 0.38 : 0.08;

  const column = rows
    .filter((row) => row.x > 0.14 && row.x < 0.5 && row.y > minY && row.y < 0.9)
    .sort((left, right) => right.y - left.y);
  for (const [index, row] of column.entries()) {
    const rawTicker = row.text.trim();
    // Fund names like "Gold" sit in the same column; Plum's tickers are all caps.
    if (rawTicker !== rawTicker.toUpperCase()) continue;
    const ticker = rawTicker;
    if (!/^[A-Z0-9]{1,6}$/.test(ticker)) continue;
    if (/^\d+$/.test(ticker)) continue;
    if (IGNORE_TICKERS.has(ticker)) continue;

    sightings.set(ticker, (sightings.get(ticker) || 0) + 1);
    if (fundFrame) fundSightings.set(ticker, (fundSightings.get(ticker) || 0) + 1);
    if (stockFrame) stockSightings.set(ticker, (stockSightings.get(ticker) || 0) + 1);

    if (!labels.has(ticker)) {
      const label = labelForTicker(column, index, row.y);
      if (label) labels.set(ticker, label);
    }
  }
}

const catalogue = { byTicker: new Map(), byIsin: new Map() };
if (!stocksOnly) loadCsv(etfsCsvPath, "ETF", catalogue);
if (!etfsOnly) loadCsv(stocksCsvPath, "STOCK", catalogue);
console.error(`${catalogue.byTicker.size} tickers in the catalogues`);

const seenTickers = [...sightings.entries()]
  .filter(([ticker, count]) => {
    if (GETTEX_ALIASES[ticker] || count >= minSightings) return true;
    if (ticker.length < 3) return false;
    if (!readings(ticker).some((candidate) => catalogue.byTicker.has(candidate))) return false;
    return usableLabel(labels.get(ticker));
  })
  .map(([ticker]) => ticker);
console.error(`${seenTickers.length} tickers read from the recording`);

const results = [];
const seen = new Set();
const unmatched = [];

for (const ticker of seenTickers) {
  const plumName = labels.get(ticker) || "";
  if (isKeyboardJunk(plumName)) continue;

  const alias = GETTEX_ALIASES[ticker] ? catalogue.byIsin.get(GETTEX_ALIASES[ticker]) : null;
  const reading = alias ? null : readings(ticker).find((candidate) => catalogue.byTicker.has(candidate));
  if (!reading && !alias) {
    if (keepUnlisted) {
      if (seen.has(ticker)) continue;
      seen.add(ticker);
      results.push({
        query: ticker,
        ticker,
        name: labels.get(ticker) || ticker,
        type: "STOCK",
        raw: [labels.get(ticker), ticker].filter(Boolean).join(" "),
        isin: null,
      });
    } else {
      unmatched.push(ticker);
    }
    continue;
  }

  const rows = reading ? catalogue.byTicker.get(reading) : [alias];
  const preferUcits = (fundSightings.get(ticker) || 0) > (stockSightings.get(ticker) || 0);
  const preferred = pickRow(plumName, rows, preferUcits);
  const usedTicker = reading || ticker;
  const score = plumName ? nameScore(plumName, preferred.name) : 0;

  if (ticker.length <= 1) {
    if (!looksLikeShare(plumName) || score < 0.4) continue;
  }

  // Plum's fund shelf uses marketing names ("Core Spain") that barely overlap
  // the legal share-class name, so a low score is not a reason to drop a fund.
  const fundHit = Boolean(alias) || ((fundSightings.get(ticker) || 0) > 0 && preferred.kind !== "STOCK");
  if (preferred.kind !== "STOCK" && usableLabel(plumName) && score < 0.28 && !fundHit) continue;

  if (!alias && reading && reading !== ticker && score < 0.35) continue;

  const key = `${preferred.kind}:${preferred.isin}`;
  if (seen.has(key)) continue;
  seen.add(key);

  results.push({
    query: ticker,
    ticker: usedTicker,
    name: preferred.name,
    type: listingType(preferred.kind, preferred.name),
    raw: [plumName, usedTicker, preferred.isin].filter(Boolean).join(" "),
    isin: preferred.isin,
  });
}

fs.writeFileSync(new URL("plum-parsed.json", import.meta.url), JSON.stringify(results, null, 2));
fs.rmSync(workDir, { recursive: true, force: true });

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);

console.error(
  `${results.length} listings matched (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})` +
    (unmatched.length > 0 ? `, not in the catalogues: ${unmatched.slice(0, 40).join(", ")}${unmatched.length > 40 ? "…" : ""}` : "")
);
console.log(JSON.stringify(results, null, 2));
