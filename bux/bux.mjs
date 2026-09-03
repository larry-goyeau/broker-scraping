import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// BUX is a phone-only broker whose app pins its certificates, so the book
// cannot be read from the network. It can be filmed, though, and it prints
// everything needed on screen: each row carries the name and, under it, a
// grey subtitle ("AAPL - Stock", "CAC - ETF - Distributing", "BTIC - Crypto
// ETP"). The catalogue is recovered by reading the frames of those recordings
// with the system OCR.

function readArg(name, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${name}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return fallback;
}

function readArgs(name) {
  const values = [];
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${name}=(.+)$`, "i"));
    if (match) {
      values.push(
        ...match[1]
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      );
    }
  }
  return values;
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;
const IMAGE_EXT = /\.(jpe?g|png|heic|webp)$/i;

const positionalMedia = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith("--") && (VIDEO_EXT.test(arg) || IMAGE_EXT.test(arg)));

const mediaPaths = [
  ...readArgs("video"),
  ...readArgs("image"),
  ...positionalMedia,
].filter((file, index, all) => all.indexOf(file) === index);

if (mediaPaths.length === 0) mediaPaths.push(readArg("video", "bux.mp4"));

const csvPath = readArg("csv", new URL("../etfs.csv", import.meta.url));
const stocksCsvPath = readArg("stocks-csv", new URL("../stocks.csv", import.meta.url));
const outPath = readArg("out", new URL("bux-parsed.json", import.meta.url));
const fps = Number(readArg("fps", "6"));
// A row stays on screen for several frames while scrolling slowly, but the
// country stock lists are flicked through in seconds, so a name seen once is
// still a listing. The CSV match is what drops OCR junk.
const minSightings = Number(readArg("min-sightings", "1"));
const replace = hasFlag("replace");

for (const file of mediaPaths) {
  if (!fs.existsSync(file)) throw new Error(`No recording at ${file}.`);
}

// BUX sells UCITS funds, so where a ticker is quoted both in Europe and abroad
// the European line is the one it lists. Crypto notes are often filed under XS.
const EUROPEAN_ISIN = /^(IE|LU|FR|DE|NL|GB|AT|BE|ES|IT|JE|CH|SE|DK|FI|NO|XS)/;

const COUNTRY_EXCHANGES = [
  { re: /un[il]ted\s*states|\busa\b/i, key: "US", exchanges: ["NASDAQ", "NYSE", "AMEX", "CBOE"] },
  { re: /\bgermany\b|deutschland/i, key: "DE", exchanges: ["XETR", "GETTEX"] },
  { re: /\bfrance\b/i, key: "FR", exchanges: ["EURONEXT"] },
  { re: /\bnetherlands\b/i, key: "NL", exchanges: ["EURONEXT"] },
  { re: /\bbelgium\b/i, key: "BE", exchanges: ["EURONEXT"] },
  { re: /\bspain\b/i, key: "ES", exchanges: ["BME"] },
  { re: /\baustria\b/i, key: "AT", exchanges: ["VIE"] },
];

function loadCsv(file) {
  const byTicker = new Map();
  const byToken = new Map();
  const rows = [];
  if (!fs.existsSync(file)) return { byTicker, byToken, rows };

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const isin = (columns[2] || "").trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) continue;

    const ticker = (columns[0] || "").split(":").pop().trim().toUpperCase();
    if (!ticker) continue;

    const row = {
      ticker,
      exchange: (columns[1] || "").trim().toUpperCase(),
      isin,
      name: columns.slice(3).join(",").trim().replace(/^"|"$/g, "").replace(/""/g, '"'),
    };

    if (!byTicker.has(ticker)) byTicker.set(ticker, []);
    byTicker.get(ticker).push(row);
    rows.push(row);
  }

  for (const row of rows) {
    for (const token of new Set(words(row.name).filter((word) => word.length >= 3))) {
      if (!byToken.has(token)) byToken.set(token, []);
      const holders = byToken.get(token);
      if (holders.length < 80) holders.push(row);
    }
  }

  return { byTicker, byToken, rows };
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

function edits(left, right) {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > 1) return 9;
  if (left.length === right.length) {
    let diff = 0;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) diff += 1;
      if (diff > 1) return 9;
    }
    return diff;
  }
  const [shorter, longer] = left.length < right.length ? [left, right] : [right, left];
  let skip = 0;
  for (let index = 0, other = 0; index < longer.length; index += 1) {
    if (longer[index] === shorter[other]) other += 1;
    else skip += 1;
    if (skip > 1) return 9;
  }
  return skip;
}

// The CSV writes the same fund far more verbosely than BUX does ("Xtrackers
// Swiss Large Cap" against "Xtrackers Switzerland UCITS ETF Distribution 1D"),
// so names are compared on their meaningful words only.
const BOILERPLATE = new Set([
  "ucits", "etf", "etfs", "etp", "etc", "fund", "funds", "plc", "icav", "sicav", "shs", "units", "unit",
  "index", "the", "of", "and", "acc", "accum", "accumulating", "dist", "distributing",
  "class", "eur", "usd", "gbp", "capitalisation", "distribution",
  "inc", "corp", "corporation", "ltd", "limited", "llc", "gmbh", "ag", "sa", "nv", "se", "asa", "co",
  "company", "group", "holding", "holdings", "stock", "shares",
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

for (const [index, file] of mediaPaths.entries()) {
  const prefix = `v${String(index).padStart(2, "0")}`;
  if (IMAGE_EXT.test(file)) {
    const dest = path.join(frameDir, `${prefix}_00001${path.extname(file).toLowerCase()}`);
    fs.copyFileSync(file, dest);
    console.error(`copied still ${path.basename(file)}`);
    continue;
  }

  console.error(`reading ${path.basename(file)} at ${fps} fps`);
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-vf", `fps=${fps}`, path.join(frameDir, `${prefix}_%05d.png`)],
    { stdio: ["ignore", "ignore", "inherit"] }
  );
}

const frames = fs.readdirSync(frameDir).sort().map((name) => path.join(frameDir, name));
console.error(`${frames.length} frames to read`);

const swiftPath = path.join(workDir, "ocr.swift");
fs.writeFileSync(swiftPath, SWIFT_OCR);

const OCR_BATCH = 40;
const ocrChunks = [];
for (let index = 0; index < frames.length; index += OCR_BATCH) {
  const batch = frames.slice(index, index + OCR_BATCH);
  console.error(`ocr ${index + 1}–${index + batch.length} / ${frames.length}`);
  ocrChunks.push(
    execFileSync("swift", [swiftPath, ...batch], {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    })
  );
}
const ocr = ocrChunks.join("");

const byFrame = new Map();
for (const line of ocr.split("\n")) {
  if (!line.trim()) continue;
  const [frame, minX, minY, ...rest] = line.split("\t");
  const text = rest.join("\t").trim();
  if (!text) continue;
  if (!byFrame.has(frame)) byFrame.set(frame, []);
  byFrame.get(frame).push({ x: Number(minX), y: Number(minY), text });
}

const CHROME =
  /Search by|^ETFs$|Add cash|Portfolio|Watchlist|Discover|Newsroom|Plans|All assets|^€|%$|IN YOUR BUDGET|^AUTOMOTIVE$|Crypto ETPs|Invest in cryptocurrency|Learn more|restricted list|^United States$|^Germany$|^France$|^Spain$|^Netherlands$|^Austria$|^Belgium$|^Italy$|^Switzerland$|^United Kingdom$/i;

function looksLikeStock(text) {
  const folded = text.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!folded || folded.length > 8) return false;
  if (folded === "STOCK" || folded === "STOCH" || folded === "STOCR" || folded === "SZCK") return true;
  if (/^ST[O0]C[KH]$/.test(folded)) return true;
  return edits(folded, "STOCK") <= 2 && folded.length >= 4;
}

function looksLikeEtf(text) {
  return /\betf\b/i.test(text) && !/crypto/i.test(text);
}

function looksLikeEtp(text) {
  return /crypto/i.test(text) || (/\betp\b/i.test(text) && !/\betf\b/i.test(text));
}

function parseKind(text) {
  if (looksLikeEtp(text)) return "ETC";
  if (looksLikeEtf(text)) return "ETF";
  if (looksLikeStock(text)) return "STOCK";
  return "";
}

function cleanTicker(text) {
  return (text || "")
    .toUpperCase()
    .replace(/[^A-Z0-9.]/g, "")
    .replace(/\.+$/g, "")
    .replace(/^\.+/, "");
}

function parseSubtitle(text) {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line || CHROME.test(line)) return null;

  const kindOnly = parseKind(line);
  if (kindOnly && !/^[A-Z0-9]{1,6}/i.test(line.split(/\s+/)[0] || "")) {
    return { ticker: "", kind: kindOnly, policy: "", kindOnly: true };
  }

  const split = line.match(/^([A-Z0-9.]{1,8})\s*[-–.]+\s*(.+)$/i);
  if (split) {
    const ticker = cleanTicker(split[1]);
    const kind = parseKind(split[2]);
    if (!ticker || !kind) return null;
    if (ticker.length === 1 && kind !== "STOCK") return null;
    const policy = /\bacc/i.test(split[2]) ? "Accumulating" : /\bdist/i.test(split[2]) ? "Distributing" : "";
    return { ticker, kind, policy };
  }

  const glued = line.match(/^([A-Z0-9.]{1,8})\s+(stock|st[o0]c[kh].*|crypto.*|etf.*|etp.*)$/i);
  if (glued) {
    const ticker = cleanTicker(glued[1]);
    const kind = parseKind(glued[2]);
    if (ticker && kind) return { ticker, kind, policy: /\bacc/i.test(glued[2]) ? "Accumulating" : /\bdist/i.test(glued[2]) ? "Distributing" : "" };
  }

  const tickerOnly = line.match(/^([A-Z0-9]{1,6}(?:\.[A-Z])?)\.?$/i);
  if (tickerOnly) {
    return { ticker: cleanTicker(tickerOnly[1]), kind: "", policy: "", tickerOnly: true };
  }

  return null;
}

function mergeSameLine(rows) {
  const sorted = [...rows].sort((left, right) => {
    if (Math.abs(left.y - right.y) > 0.014) return right.y - left.y;
    return left.x - right.x;
  });

  const lines = [];
  for (const row of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - row.y) <= 0.014 && row.x - last.x < 0.22) {
      last.text = `${last.text} ${row.text}`.replace(/\s+/g, " ").trim();
      last.x = Math.min(last.x, row.x);
      continue;
    }
    lines.push({ x: row.x, y: row.y, text: row.text });
  }
  return lines;
}

function isBuxFrame(rows) {
  const blob = rows.map((row) => row.text).join(" ");
  return /Add cash|All assets|Discover|Crypto ETP|\bStock\b|\bETF\b/i.test(blob);
}

function frameCountry(rows) {
  // The country name is the screen title, not a word buried in a company name
  // or in the WhatsApp chrome that surrounds some of the clips.
  const titles = rows.filter((row) => row.y > 0.72).map((row) => row.text).join(" ");
  for (const country of COUNTRY_EXCHANGES) {
    if (country.re.test(titles)) return country;
  }
  return null;
}

const listed = new Map();
let lastCountry = null;
let lastPrefix = "";

for (const frame of [...byFrame.keys()].sort()) {
  const prefix = path.basename(frame).replace(/_.*$/, "");
  if (prefix !== lastPrefix) {
    lastCountry = null;
    lastPrefix = prefix;
  }

  const rows = byFrame.get(frame);
  if (!isBuxFrame(rows)) continue;

  const seenCountry = frameCountry(rows);
  if (seenCountry) lastCountry = seenCountry;
  const country = seenCountry || lastCountry;

  const column = mergeSameLine(rows.filter((row) => row.x < 0.62));
  const parsed = column.map((row) => ({ ...row, subtitle: parseSubtitle(row.text) }));

  for (const [index, row] of parsed.entries()) {
    let subtitle = row.subtitle;
    if (!subtitle) continue;

    if (subtitle.tickerOnly) {
      const below = parsed[index + 1]?.subtitle;
      if (below?.kindOnly) subtitle = { ticker: subtitle.ticker, kind: below.kind, policy: "" };
      else continue;
    }
    if (subtitle.kindOnly || !subtitle.ticker || !subtitle.kind) continue;

    const nameLines = [];
    let delisted = false;
    for (let above = index - 1; above >= 0; above -= 1) {
      const line = parsed[above];
      if (line.subtitle && !line.subtitle.kindOnly && !line.subtitle.tickerOnly) break;
      if (line.subtitle?.kindOnly) continue;
      if (CHROME.test(line.text)) break;
      if (/Delisted|Acquired|Merged|old ISIN|\.old/i.test(line.text)) delisted = true;
      nameLines.unshift(line.text);
      if (nameLines.length >= 3) break;
    }

    const key = `${subtitle.kind}|${subtitle.ticker}|${subtitle.policy}|${country?.key || ""}`;
    if (!listed.has(key)) {
      listed.set(key, {
        ticker: subtitle.ticker,
        kind: subtitle.kind,
        policy: subtitle.policy,
        names: new Map(),
        countries: new Map(),
        sightings: 0,
        delisted: 0,
      });
    }

    const entry = listed.get(key);
    entry.sightings += 1;
    if (delisted) entry.delisted += 1;
    if (country) entry.countries.set(country.key, (entry.countries.get(country.key) || 0) + 1);

    const name = nameLines.join(" ").replace(/\(\w+\)\s*-\s*Delisted/i, "").trim();
    if (name) entry.names.set(name, (entry.names.get(name) || 0) + 1);
  }
}

const seenRows = [...listed.values()].filter((row) => row.sightings >= minSightings);
console.error(`${seenRows.length} rows read from the recording`);

const fundsCsv = loadCsv(csvPath);
const stocksCsv = loadCsv(stocksCsvPath);
console.error(`${fundsCsv.byTicker.size} fund tickers, ${stocksCsv.byTicker.size} share tickers`);

function countryFor(row) {
  const ranked = [...row.countries.entries()].sort((left, right) => right[1] - left[1]);
  const key = ranked[0]?.[0];
  return COUNTRY_EXCHANGES.find((country) => country.key === key) || null;
}

function candidatesByName(csv, name) {
  const spoken = words(name).filter((word) => word.length >= 3);
  if (spoken.length === 0) return [];

  const shared = new Map();
  for (const token of spoken) {
    const holders = csv.byToken.get(token) || [];
    if (holders.length >= 80) continue;
    for (const row of holders) shared.set(row, (shared.get(row) || 0) + 1);
  }

  const need = Math.min(2, spoken.length);
  return [...shared.entries()]
    .filter(([, count]) => count >= need)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 16)
    .map(([row]) => row);
}

function pickMatch(row, csv, europeanOnly) {
  const name = [...row.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const country = countryFor(row);
  const preferred =
    row.kind === "ETC"
      ? ["EURONEXT", "XETR", "LSE"]
      : country?.exchanges ||
        (row.kind === "STOCK"
          ? ["NASDAQ", "NYSE", "AMEX", "CBOE", "EURONEXT", "XETR", "BME", "VIE"]
          : []);

  const tickerHits = [];
  for (const reading of readings(row.ticker)) {
    for (const candidate of csv.byTicker.get(reading) || []) {
      tickerHits.push({ candidate, reading, distance: reading === row.ticker ? 0 : 1 });
    }
  }

  let pool = tickerHits.map((hit) => hit.candidate);
  if (europeanOnly) {
    const european = pool.filter((candidate) => EUROPEAN_ISIN.test(candidate.isin));
    if (european.length > 0) pool = european;
  }

  // A country tab only lists that market's book. Falling back to every
  // venue that happens to reuse the ticker would file Thai and Tel Aviv
  // lines as if they were the New York share BUX actually showed.
  let named = name ? candidatesByName(csv, name) : [];
  if (preferred.length > 0) {
    const onVenue = pool.filter((candidate) => preferred.includes(candidate.exchange));
    if (row.kind === "STOCK" || onVenue.length > 0) pool = onVenue;
    named = named.filter((candidate) => preferred.includes(candidate.exchange));
  }

  const venuePool = [...pool].sort(
    (left, right) =>
      (preferred.indexOf(left.exchange) + 1 || 99) - (preferred.indexOf(right.exchange) + 1 || 99)
  );
  const scored = [...venuePool, ...named]
    .filter((candidate, index, all) => all.findIndex((other) => other.isin === candidate.isin) === index)
    .map((candidate) => {
      const tickerDistance = Math.min(...readings(row.ticker).map((reading) => edits(reading, candidate.ticker)));
      const onPreferred = preferred.includes(candidate.exchange) ? 0.08 : 0;
      const nameScore = similarity(name, candidate.name);
      const tickerBonus = tickerDistance === 0 ? 0.25 : tickerDistance === 1 ? 0.08 : 0;
      return {
        candidate,
        tickerDistance,
        nameScore,
        score: nameScore + tickerBonus + onPreferred,
      };
    })
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  if (!best) return { match: null, reading: row.ticker, name };

  // A unique ticker whose CSV name shares no words with the screen (BMW) is
  // still that listing. The same unique ticker loses when another nearby
  // ticker's name is what BUX actually printed (ADM read for Aecom / ACM).
  const uniqueTicker = new Set(venuePool.map((candidate) => candidate.isin)).size === 1;
  const namedBetter = scored.find(
    (row_) => row_.nameScore >= 0.4 && row_.tickerDistance <= 1 && row_.candidate.isin !== venuePool[0]?.isin
  );
  if (uniqueTicker && (!name || !namedBetter || best.nameScore > 0)) {
    const chosen = venuePool[0];
    if (chosen.exchange === "GETTEX" && name && similarity(name, chosen.name) < 0.2) {
      return { match: null, reading: row.ticker, name };
    }
    return { match: chosen, reading: chosen.ticker, name };
  }
  if (namedBetter && namedBetter.nameScore > (best.tickerDistance === 0 ? best.nameScore : 0)) {
    return { match: namedBetter.candidate, reading: namedBetter.candidate.ticker, name };
  }

  if (best.tickerDistance === 0 && (best.nameScore >= 0.15 || uniqueTicker || !name)) {
    return { match: best.candidate, reading: best.candidate.ticker, name };
  }
  if (best.score >= 0.4 && best.tickerDistance <= 1) {
    return { match: best.candidate, reading: best.candidate.ticker, name };
  }

  return { match: null, reading: row.ticker, name };
}

const results = [];
const seen = new Set();
const unmatched = [];
let delistedCount = 0;

for (const row of seenRows) {
  const csv = row.kind === "STOCK" ? stocksCsv : fundsCsv;
  const name = [...row.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";

  if (row.delisted > 0) {
    delistedCount += 1;
    continue;
  }

  const { match, reading } = pickMatch(row, csv, row.kind !== "STOCK");
  if (!match) {
    unmatched.push(`${row.ticker} (${name || row.kind})`);
    continue;
  }

  if (seen.has(match.isin)) continue;
  seen.add(match.isin);

  const country = countryFor(row);
  const currency = country?.key === "US" ? "USD" : "EUR";
  const subtitle =
    row.kind === "ETF"
      ? `${row.ticker} - ETF - ${row.policy || "Accumulating"}`
      : row.kind === "ETC"
        ? `${row.ticker} - Crypto ETP`
        : `${row.ticker} - Stock`;

  const entry = {
    query: readings(row.ticker).includes(reading) ? reading : row.ticker,
    ticker: reading || row.ticker,
    name: match.name,
    type: row.kind,
    raw: [name, subtitle, match.isin].filter(Boolean).join(" | "),
    isin: match.isin,
  };
  if (match.exchange) entry.exchange = match.exchange;
  entry.currency = currency;
  results.push(entry);
}

function loadExisting(file) {
  if (replace || !fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const existing = loadExisting(outPath);
const claimed = new Set(existing.map((row) => row.isin).filter(Boolean));
const added = [];
for (const row of results) {
  if (claimed.has(row.isin)) continue;
  claimed.add(row.isin);
  added.push(row);
}

const merged = [...existing, ...added];
fs.writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`);
fs.rmSync(workDir, { recursive: true, force: true });

const byType = {};
for (const row of merged) byType[row.type || "?"] = (byType[row.type || "?"] || 0) + 1;

console.error(
  `${added.length} added, ${existing.length} kept, ${merged.length} listed` +
    ` (${Object.entries(byType).map(([type, count]) => `${count} ${type}`).join(", ")})` +
    `, ${delistedCount} delisted skipped` +
    (unmatched.length > 0 ? `, not in the CSV: ${unmatched.slice(0, 40).join(", ")}${unmatched.length > 40 ? ` … +${unmatched.length - 40}` : ""}` : "")
);
console.log(JSON.stringify({ added: added.length, kept: existing.length, listed: merged.length, byType, unmatched: unmatched.length }, null, 2));
