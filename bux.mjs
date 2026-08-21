import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// BUX is a phone-only broker whose app pins its certificates, so its ETF tab
// cannot be read from the network. It can be filmed, though, and it prints
// everything needed on screen: each row carries the fund name and, under it,
// "TICKER - ETF - Accumulating". The catalogue is recovered by reading the
// frames of a screen recording with the system OCR.

function readArg(name, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${name}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return fallback;
}

const videoPath = readArg("video", "bux.mp4");
const csvPath = readArg("csv", "etfs.csv");
const fps = Number(readArg("fps", "6"));
// A row stays on screen for several frames while scrolling, so a reading seen
// once or twice is OCR noise rather than a fund.
const minSightings = Number(readArg("min-sightings", "3"));

if (!fs.existsSync(videoPath)) {
  throw new Error(`No recording at ${videoPath}.`);
}

// BUX sells UCITS funds, so where a ticker is quoted both in Europe and abroad
// the European line is the one it lists.
const EUROPEAN_ISIN = /^(IE|LU|FR|DE|NL|GB|AT|BE|ES|IT|JE|CH|SE|DK|FI|NO)/;

function loadCsv(file) {
  const byTicker = new Map();
  const rows = [];
  if (!fs.existsSync(file)) return { byTicker, rows };

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const isin = (columns[2] || "").trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) continue;

    const ticker = (columns[0] || "").split(":").pop().trim().toUpperCase();
    if (!ticker) continue;

    const row = {
      exchange: (columns[1] || "").trim().toUpperCase(),
      isin,
      name: columns.slice(3).join(",").trim(),
    };

    if (!byTicker.has(ticker)) byTicker.set(ticker, []);
    byTicker.get(ticker).push(row);
    rows.push(row);
  }

  return { byTicker, rows };
}

// Tickers are printed in small grey type, where the system OCR reliably
// confuses a handful of glyph pairs; the CSV decides which reading is real.
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

// The CSV writes the same fund far more verbosely than BUX does ("Xtrackers
// Swiss Large Cap" against "Xtrackers Switzerland UCITS ETF Distribution 1D"),
// so names are compared on their meaningful words only.
const BOILERPLATE = new Set([
  "ucits", "etf", "etfs", "fund", "funds", "plc", "icav", "sicav", "shs", "units", "unit",
  "index", "the", "of", "and", "acc", "accum", "accumulating", "dist", "distributing",
  "class", "eur", "usd", "gbp", "capitalisation", "distribution",
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

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "bux-"));
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

const ocr = execFileSync("swift", [swiftPath, ...frames], {
  encoding: "utf8",
  maxBuffer: 512 * 1024 * 1024,
  stdio: ["ignore", "pipe", "ignore"],
});

const byFrame = new Map();
for (const line of ocr.split("\n")) {
  if (!line.trim()) continue;
  const [frame, minX, minY, ...rest] = line.split("\t");
  const text = rest.join("\t").trim();
  if (!text) continue;
  if (!byFrame.has(frame)) byFrame.set(frame, []);
  byFrame.get(frame).push({ x: Number(minX), y: Number(minY), text });
}

const SUBTITLE = /^([A-Z0-9]{2,6}) - ETF - (\w+)$/;
const CHROME = /Search by|^ETFs$|Add cash|Portfolio|Watchlist|Discover|Newsroom|Plans|All assets|^€|%$/;

// A row is one or two lines of name followed by its subtitle, all in the left
// column; the price sits on the right.
const listed = new Map();

for (const rows of byFrame.values()) {
  const column = rows.filter((row) => row.x < 0.6).sort((left, right) => right.y - left.y);

  for (const [index, row] of column.entries()) {
    const subtitle = row.text.match(SUBTITLE);
    if (!subtitle) continue;

    const nameLines = [];
    let delisted = false;
    for (let above = index - 1; above >= 0; above -= 1) {
      const line = column[above].text;
      if (SUBTITLE.test(line) || CHROME.test(line)) break;
      if (/Delisted/i.test(line)) delisted = true;
      nameLines.unshift(line);
      if (nameLines.length >= 3) break;
    }

    // BUX prints the same fund twice when it offers both share classes, so the
    // policy is part of what identifies a row.
    const policy = /^a/i.test(subtitle[2]) ? "Accumulating" : "Distributing";
    const key = `${subtitle[1]}|${policy}`;
    if (!listed.has(key)) {
      listed.set(key, { ticker: subtitle[1], policy, names: new Map(), sightings: 0, delisted: 0 });
    }

    const row_ = listed.get(key);
    row_.sightings += 1;
    if (delisted) row_.delisted += 1;

    const name = nameLines.join(" ").replace(/\(\w+\)\s*-\s*Delisted/i, "").trim();
    if (name) row_.names.set(name, (row_.names.get(name) || 0) + 1);
  }
}

const seenRows = [...listed.values()].filter((row) => row.sightings >= minSightings);
console.error(`${seenRows.length} rows read from the recording`);

const { byTicker, rows: csvRows } = loadCsv(csvPath);
const europeanRows = csvRows.filter((row) => EUROPEAN_ISIN.test(row.isin));
console.error(`${byTicker.size} tickers in the CSV`);

const results = [];
const seen = new Set();
const unmatched = [];
let delistedCount = 0;

for (const row of seenRows) {
  const name = [...row.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";

  // BUX keeps funds it no longer trades in the list, flagged as delisted.
  if (row.delisted > 0) {
    delistedCount += 1;
    continue;
  }

  let match = null;
  const reading = readings(row.ticker).find((candidate) => byTicker.has(candidate));

  if (reading) {
    const all = byTicker.get(reading);
    const european = all.filter((candidate) => EUROPEAN_ISIN.test(candidate.isin));
    const candidates = european.length > 0 ? european : all;
    const best = candidates
      .map((candidate) => ({ candidate, score: similarity(name, candidate.name) }))
      .sort((left, right) => right.score - left.score)[0];
    // One ticker can stand for different funds on different venues, and there
    // the name has to say which one.
    const ambiguous = new Set(candidates.map((candidate) => candidate.isin)).size > 1;
    if (!ambiguous || best.score >= 0.15) match = best.candidate;
  }

  if (!match && name) {
    // Without a ticker to corroborate it, a name is only taken when the CSV
    // says everything BUX says: a near miss is usually another share class.
    const spoken = words(name);
    if (spoken.length >= 3) {
      match = europeanRows
        .filter((candidate) => {
          const said = new Set(words(candidate.name));
          return spoken.every((word) => said.has(word));
        })
        .map((candidate) => ({ candidate, score: similarity(name, candidate.name) }))
        .sort((left, right) => right.score - left.score)[0]?.candidate;
    }
  }

  if (!match) {
    unmatched.push(`${row.ticker} (${name})`);
    continue;
  }

  if (seen.has(match.isin)) continue;
  seen.add(match.isin);

  results.push({
    query: row.ticker,
    ticker: reading || row.ticker,
    name: match.name,
    type: "ETF",
    raw: [name, `${row.ticker} - ETF - ${row.policy}`, match.isin].filter(Boolean).join(" | "),
    isin: match.isin,
  });
}

fs.mkdirSync("parsed_json", { recursive: true });
fs.writeFileSync("parsed_json/bux-parsed.json", JSON.stringify(results, null, 2));
fs.rmSync(workDir, { recursive: true, force: true });

console.error(
  `${results.length} funds matched, ${delistedCount} delisted skipped` +
    (unmatched.length > 0 ? `, not in the CSV: ${unmatched.join(", ")}` : "")
);
console.log(JSON.stringify(results, null, 2));
