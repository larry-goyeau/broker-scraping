import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Plum has no web app and its Android app pins its certificates, so the fund
// list cannot be read from the network. What the app will show is its screen,
// so the catalogue is recovered from a screen recording of the ETF list: the
// frames are read with the system OCR and the tickers are matched to the CSV.

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function readArg(name, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${name}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return fallback;
}

const videoPath = readArg("video", "plum.mp4");
const csvPath = readArg("csv", "etfs.csv");
const fps = Number(readArg("fps", "6"));
// A row stays on screen across many frames, so a reading seen once is OCR noise
// rather than a fund.
const minSightings = Number(readArg("min-sightings", "2"));

if (!fs.existsSync(videoPath)) {
  throw new Error(`No recording at ${videoPath}.`);
}

// Plum only sells UCITS funds, so when a ticker is quoted both in Europe and
// abroad the European share class is the one it lists.
const UCITS_PREFIXES = ["IE", "LU", "FR", "DE", "NL", "GB", "AT", "BE", "ES", "IT", "JE"];

// Plum quotes gettex tickers, and the CSV carries a few of these funds only
// under the ticker of another listing.
const GETTEX_ALIASES = {
  VOOP: "FR0013380607", // Amundi CAC 40 UCITS ETF Acc, listed as CACC
  AYE7: "IE00BMTX2B82", // iShares AEX UCITS ETF EUR Acc, listed as IAEA
};

function loadCsv(file) {
  const byTicker = new Map();
  const byIsin = new Map();
  if (!fs.existsSync(file)) return { byTicker, byIsin };

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const isin = toIsin(columns[2]);
    if (!isin) continue;

    const ticker = (columns[0] || "").split(":").pop().trim().toUpperCase();
    if (!ticker) continue;

    const exchange = (columns[1] || "").trim().toUpperCase();
    const name = columns.slice(3).join(",").trim();

    if (!byTicker.has(ticker)) byTicker.set(ticker, []);
    byTicker.get(ticker).push({ exchange, isin, name });
    if (!byIsin.has(isin)) byIsin.set(isin, { exchange, isin, name });
  }

  return { byTicker, byIsin };
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

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "plum-"));
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
  maxBuffer: 256 * 1024 * 1024,
  stdio: ["ignore", "pipe", "ignore"],
});

// Each frame is a screenful of rows; a row is a name with its ticker underneath,
// both in the left column.
const sightings = new Map();
const labels = new Map();
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
  // The issuer logo carries readable text of its own, so the column is taken to
  // the right of it and short of the performance figures.
  const column = rows
    .filter((row) => row.x > 0.12 && row.x < 0.5)
    .sort((left, right) => right.y - left.y);
  for (const [index, row] of column.entries()) {
    if (!/^[A-Z0-9]{3,6}$/.test(row.text)) continue;
    sightings.set(row.text, (sightings.get(row.text) || 0) + 1);
    // The name is the line directly above, and Plum shows its own label there
    // rather than the fund's registered name.
    const above = column[index - 1];
    if (above && !labels.has(row.text)) labels.set(row.text, above.text);
  }
}

const seenTickers = [...sightings.entries()]
  .filter(([, count]) => count >= minSightings)
  .map(([ticker]) => ticker);
console.error(`${seenTickers.length} tickers read from the recording`);

const { byTicker, byIsin } = loadCsv(csvPath);
console.error(`${byTicker.size} tickers in the CSV`);

const results = [];
const seen = new Set();
const unmatched = [];

for (const ticker of seenTickers) {
  const reading = readings(ticker).find((candidate) => byTicker.has(candidate));
  const alias = byIsin.get(GETTEX_ALIASES[ticker]);
  if (!reading && !alias) {
    unmatched.push(ticker);
    continue;
  }

  const rows = reading ? byTicker.get(reading) : [alias];
  const ucits = rows.filter((row) => UCITS_PREFIXES.includes(row.isin.slice(0, 2)));
  const preferred = (ucits.length > 0 ? ucits : rows)[0];

  if (seen.has(preferred.isin)) continue;
  seen.add(preferred.isin);

  results.push({
    query: ticker,
    ticker: reading || ticker,
    name: preferred.name,
    type: "ETF",
    raw: [labels.get(ticker), reading || ticker, preferred.isin].filter(Boolean).join(" "),
    isin: preferred.isin,
  });
}

fs.mkdirSync("parsed_json", { recursive: true });
fs.writeFileSync("parsed_json/plum-parsed.json", JSON.stringify(results, null, 2));
fs.rmSync(workDir, { recursive: true, force: true });

console.error(
  `${results.length} funds matched` +
    (unmatched.length > 0 ? `, not in the CSV: ${unmatched.join(", ")}` : "")
);
console.log(JSON.stringify(results, null, 2));
