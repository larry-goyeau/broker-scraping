import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// The app blocks screen recording, so its catalogue was captured as photographs
// of the phone. Each row prints the fund name and, under it, either
// "Issuer • TICKER" on the ETFs tab or a bare ticker on the ETCs tab. The
// pictures are read with the system OCR and the tickers matched to the CSV.

function readArg(name, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${name}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return fallback;
}

const photoDir = readArg("dir", "N26");
const csvPath = readArg("csv", "etfs.csv");

if (!fs.existsSync(photoDir)) {
  throw new Error(`No photo directory at ${photoDir}.`);
}

// The app sells European funds, so where a ticker is quoted both in Europe and
// abroad the European line is the one it lists. Commodity ETCs are issued out
// of Jersey, Guernsey or as XS international notes.
const EUROPEAN_ISIN = /^(IE|LU|FR|DE|NL|GB|AT|BE|ES|IT|JE|GG|XS|CH|SE|DK|FI|NO)/;

function loadCsv(file) {
  const byTicker = new Map();
  if (!fs.existsSync(file)) return byTicker;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const isin = (columns[2] || "").trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) continue;

    const ticker = (columns[0] || "").split(":").pop().trim().toUpperCase();
    if (!ticker) continue;

    if (!byTicker.has(ticker)) byTicker.set(ticker, []);
    byTicker.get(ticker).push({ isin, name: columns.slice(3).join(",").trim() });
  }

  return byTicker;
}

// Tickers are printed in small grey type, where the system OCR reliably
// confuses a handful of glyph pairs. Both readings are often real tickers of
// different funds, so the candidates from every reading are gathered and the
// name decides between them.
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
  // A double V and a W trade places in either direction: the app prints VVSM
  // for the VanEck Semiconductor and the picture reads WSM.
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

// The app writes the issuer beside the fund's short name while the CSV writes
// one long legal name, so the two are compared on their meaningful words.
const BOILERPLATE = new Set([
  "ucits", "etf", "etfs", "etc", "fund", "funds", "plc", "icav", "sicav", "shs", "units",
  "unit", "index", "the", "of", "and", "acc", "accum", "dist", "class", "eur", "usd", "gbp",
  "capitalisation", "distribution", "securities", "swap",
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
console.error(`${photos.length} pictures to read`);

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "n21-"));
const swiftPath = path.join(workDir, "ocr.swift");
fs.writeFileSync(swiftPath, SWIFT_OCR);

const ocr = execFileSync("swift", [swiftPath, ...photos], {
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
  stdio: ["ignore", "pipe", "ignore"],
});
fs.rmSync(workDir, { recursive: true, force: true });

const byPhoto = new Map();
for (const line of ocr.split("\n")) {
  if (!line.trim()) continue;
  const [photo, minX, minY, ...rest] = line.split("\t");
  const text = rest.join("\t").trim();
  if (!text) continue;
  if (!byPhoto.has(photo)) byPhoto.set(photo, []);
  byPhoto.get(photo).push({ x: Number(minX), y: Number(minY), text });
}

// Venue codes the app prints after a ticker, in Bloomberg's spelling. It sets
// them off with a space on some rows and runs them together on others, which is
// why the HSBC EURO STOXX 50 reads as "H50AFP".
const VENUES = ["FP", "GY", "GR", "LN", "NA", "SE", "SW", "IM", "SM", "SS", "BB", "ID", "AV", "VX"];
const TAIL = `([A-Z0-9]{2,8})(?:\\s+(?:${VENUES.join("|")}))?$`;
const WITH_ISSUER = new RegExp(`^(.+?)\\s*[•·*]\\s*${TAIL}`);
// The bullet between issuer and ticker comes out as a dash on some pictures, a
// shape a fund's name also uses, so this reading asks that the left side look
// like an issuer: a couple of plain words.
const DASHED = new RegExp(`^([A-Za-z][A-Za-z&.' ]{1,22})\\s+[-–—]\\s+${TAIL}`);
const BARE_TICKER = /^[A-Z0-9]{3,6}$/;
const CHROME = /Showing|results|^Issuer$|^Region$|^Industry|^Stocks$|^ETFs$|^Crypto$|^ETCs$|^€|%$/;
// Words the app prints on their own line that look like a ticker but are part
// of a fund's name.
const NOT_A_TICKER = new Set([
  "ETF", "ETC", "ESG", "SRI", "PAB", "USD", "EUR", "GBP", "CHF", "USA", "TOP",
  "ACC", "DIST", "UCITS", "MSCI", "SWAP",
]);

const listed = new Map();
const advertised = new Map();

for (const [, lines] of [...byPhoto.entries()].sort()) {
  for (const line of lines) {
    const count = line.text.match(/Showing\s+([\d,.]+)\s+results/i);
    if (count) {
      const total = Number(count[1].replace(/[,.]/g, ""));
      advertised.set(total, (advertised.get(total) || 0) + 1);
    }
  }

  // Photographs are taken freehand, so nothing sits where it did in the last
  // picture and the frame is slightly skewed. A row is still recognisable: its
  // name and its ticker share a left edge, while the issuer logo beside them
  // is indented differently, which is how logo lettering is told from a name.
  const column = lines.filter((line) => line.x < 0.62).sort((first, second) => second.y - first.y);

  for (const [index, line] of column.entries()) {
    const withIssuer = line.text.match(WITH_ISSUER) || line.text.match(DASHED);
    const bare = !withIssuer && BARE_TICKER.test(line.text) && !NOT_A_TICKER.has(line.text);
    if (!withIssuer && !bare) continue;

    const ticker = withIssuer ? withIssuer[2] : line.text;
    const issuer = withIssuer ? withIssuer[1].trim() : "";

    const nameLines = [];
    for (let above = index - 1; above >= 0; above -= 1) {
      const previous = column[above];
      if (Math.abs(previous.x - line.x) > 0.02) continue;
      const startsAnotherRow =
        WITH_ISSUER.test(previous.text) ||
        DASHED.test(previous.text) ||
        (BARE_TICKER.test(previous.text) && !NOT_A_TICKER.has(previous.text));
      if (startsAnotherRow || CHROME.test(previous.text)) break;
      nameLines.unshift(previous.text);
      if (nameLines.length >= 3) break;
    }

    // Logo lettering reads as capitals too, so a bare ticker with no name above
    // it is not a row. A ticker printed with its issuer needs no such proof.
    if (bare && nameLines.length === 0) continue;

    const row = {
      ticker,
      issuer,
      name: nameLines.join(" ").trim(),
      // The ETFs tab names the issuer beside the ticker; the ETCs tab shows it
      // as a logo only.
      type: withIssuer ? "ETF" : "ETC",
    };

    // A row can be photographed twice; keep whichever reading of its name came
    // out fullest.
    const seen = listed.get(ticker);
    if (!seen || row.name.length > seen.name.length) listed.set(ticker, row);
  }
}

console.error(`${listed.size} instruments read from the pictures`);
for (const [total, seen] of [...advertised.entries()].sort((a, b) => b[1] - a[1])) {
  console.error(`  the app reported ${total} results on ${seen} of them`);
}

const byTicker = loadCsv(csvPath);
console.error(`${byTicker.size} tickers in the CSV`);

const results = [];
const seenIsins = new Set();
const unmatched = [];

function keep(row, ticker, candidate) {
  if (seenIsins.has(candidate.isin)) return;
  seenIsins.add(candidate.isin);
  results.push({
    query: row.ticker,
    ticker,
    name: candidate.name,
    type: row.type,
    raw: [`${row.issuer} ${row.name}`.trim(), row.ticker, candidate.isin].filter(Boolean).join(" | "),
    isin: candidate.isin,
  });
}

// Pick the fund a ticker stands for. N26 sells UCITS funds only, so a ticker
// that reads as an American one has been misread; so has a candidate sharing
// not one word with the name the app printed beside it.
function byTickerReading(row, ticker) {
  const european = (reading) =>
    (byTicker.get(reading) || []).filter((candidate) => EUROPEAN_ISIN.test(candidate.isin));

  // Reading the ticker as printed is evidence in itself; letting an O stand for
  // a 0 is a guess, and a guess can land on a real ticker belonging to another
  // fund, so it only counts when the name backs it up.
  const asPrinted = european(ticker);
  const candidates = asPrinted.length > 0 ? asPrinted : readings(ticker).flatMap(european);
  if (candidates.length === 0) return null;
  const needed = asPrinted.length > 0 ? 0 : 0.3;

  const best = candidates
    .map((candidate) => ({ candidate, score: similarity(`${row.issuer} ${row.name}`, candidate.name) }))
    .sort((left, right) => right.score - left.score)[0];
  return best.score > needed ? best.candidate : { rejected: best.candidate };
}

const pending = [];
for (const row of listed.values()) {
  const pick = byTickerReading(row, row.ticker);
  if (pick && !pick.rejected) keep(row, row.ticker, pick);
  else pending.push({ row, rejected: pick?.rejected });
}

// Two share classes of one fund carry the same name, so a name on its own only
// identifies a fund when the CSV agrees on every word of it. Currency and
// hedging are kept meaningful here: they are what tells those classes apart.
const STRUCTURE = new Set([
  "ucits", "etf", "etfs", "etc", "fund", "funds", "plc", "icav", "sicav", "shs", "units",
  "unit", "index", "the", "of", "and", "class", "capitalisation", "distribution", "securities",
]);

function spelledOut(text) {
  return (text || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word && !STRUCTURE.has(word));
}

const everyRow = [...byTicker.values()].flat();

for (const { row, rejected } of pending) {
  const venue = VENUES.find(
    (code) => row.ticker.endsWith(code) && row.ticker.length - code.length >= 3
  );
  if (venue) {
    const stripped = row.ticker.slice(0, -venue.length);
    const pick = byTickerReading(row, stripped);
    // The name has to carry the match on its own here, since dropping letters
    // off a ticker can land on an unrelated one.
    if (pick && !pick.rejected && similarity(row.name, pick.name) >= 0.3) {
      keep(row, stripped, pick);
      continue;
    }
  }

  const spoken = [...new Set(spelledOut(`${row.issuer} ${row.name}`))];
  if (spoken.length >= 3) {
    const covered = everyRow.filter((candidate) => {
      if (!EUROPEAN_ISIN.test(candidate.isin)) return false;
      const said = new Set(spelledOut(candidate.name));
      return spoken.every((word) => said.has(word));
    });
    // Each row on screen is its own instrument, so a share class another row
    // already answers for cannot be this one.
    const free = covered.filter((candidate) => !seenIsins.has(candidate.isin));
    const isins = new Set(free.map((candidate) => candidate.isin));
    if (isins.size === 1) {
      keep(row, row.ticker, free[0]);
      continue;
    }
    if (isins.size > 1) {
      unmatched.push(`${row.ticker} (${row.issuer} ${row.name} — ${isins.size} share classes fit)`.replace(/\s+/g, " "));
      continue;
    }
  }

  unmatched.push(
    rejected
      ? `${row.ticker} (${row.issuer} ${row.name} — reads as "${rejected.name}")`.replace(/\s+/g, " ")
      : `${row.ticker} (${row.issuer} ${row.name})`.replace(/\s+/g, " ")
  );
}

fs.mkdirSync("parsed_json", { recursive: true });
fs.writeFileSync("parsed_json/n26-parsed.json", JSON.stringify(results, null, 2));

console.error(
  `${results.length} matched (${results.filter((r) => r.type === "ETF").length} ETF, ` +
    `${results.filter((r) => r.type === "ETC").length} ETC)` +
    (unmatched.length > 0 ? `, not in the CSV: ${unmatched.join(", ")}` : "")
);
console.log(JSON.stringify(results, null, 2));
