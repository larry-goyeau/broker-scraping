// What IG Australia sells in its share trading account, with no login.
// The share-trading page links one PDF, the "Stockbroking Share List",
// and that list is the book: one line per share or fund, by market
// (Australia, Germany, Ireland, United Kingdom, United States), with the
// Reuters and Bloomberg codes and whether new positions are allowed. A
// line marked "No" can be held and sold but not bought, so it is not
// written. Options, warrants, rights, units, capital notes and the
// preference and hybrid lines (Bloomberg PFD or @ codes) are other
// products and are not written.
//
// The Reuters suffix names the venue (.AX ASX, .L London, .ASE Aquis, .I
// Dublin, .DE Xetra, .F Frankfurt, .SG Stuttgart, .H Hamburg, .N NYSE, .O
// Nasdaq, .A NYSE American, .P Arca, .Z Cboe BZX, .PK OTC). .K is the NYSE
// consolidated code: the line takes the one American place the shared
// lists file it on. The ticker is the Bloomberg one, which is the
// exchange's own code (NET LN where Reuters writes NETC.L). A line the
// list files under another market than its suffix (one Paris code in
// Germany) is left out. The PDF names no type: a name that says ETF, ETC,
// ETN or UCITS, or a ticker the shared ETF list files on that place, is a
// fund. It prints no currency: a line takes its venue's. It prints no
// ISIN; stampRows fills it from the shared lists. Text is read with
// PyMuPDF (`python3 -c "import fitz"`), as the other PDF readers here do.
//
//   https://www.ig.com/au/share-trading
//   https://www.ig.com/content/dam/publicsites/1790053953000/go-anywhere-files/Stockbroking%20Share%20List%20Australia.pdf
//
//   node brokers/igau/igau_scraping.mjs
//   node brokers/igau/igau_scraping.mjs --pdf=./list.pdf

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const PAGE = "https://www.ig.com/au/share-trading";
const FALLBACK = "https://www.ig.com/content/dam/publicsites/1790053953000/go-anywhere-files/Stockbroking%20Share%20List%20Australia.pdf";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);

// Reuters suffix -> [exchange, mic, currency, section the line must sit in].
const SUFFIX = {
  AX: ["ASX", "XASX", "AUD", "Australia"],
  L: ["LSE", "XLON", "GBP", "United Kingdom"],
  LN: ["LSE", "XLON", "GBP", "United Kingdom"],
  ASE: ["Aquis", "AQSE", "GBP", "United Kingdom"],
  I: ["Euronext Dublin", "XMSM", "EUR", "Ireland"],
  DE: ["XETR", "XETR", "EUR", "Germany"],
  F: ["XFRA", "XFRA", "EUR", "Germany"],
  SG: ["Stuttgart", "XSTU", "EUR", "Germany"],
  H: ["Hamburg", "XHAM", "EUR", "Germany"],
  N: ["NYSE", "XNYS", "USD", "United States"],
  O: ["NASDAQ", "XNAS", "USD", "United States"],
  A: ["NYSE American", "XASE", "USD", "United States"],
  P: ["ARCA", "ARCX", "USD", "United States"],
  Z: ["BATS", "BATS", "USD", "United States"],
  PK: ["OTC", "OTCM", "USD", "United States"],
};
const US_LIST = { NYSE: ["NYSE", "XNYS"], NASDAQ: ["NASDAQ", "XNAS"], AMEX: ["ARCA", "ARCX"], CBOE: ["BATS", "BATS"] };
const HEADER = new Set(["Stock", "Ticker", "New", "Positions", "Allowed?", "Collateral", "%***", "Levy*", "FTT**"]);
const SECTIONS = ["Australia", "Germany", "Ireland", "United Kingdom", "United States"];
const FLOOR = { XASX: 700, XLON: 1700, XETR: 300, XNYS: 1400, XNAS: 2000, ARCX: 500, XMSM: 1 };
const ASIDE = /\b(options?|warrants?|rights(?! and issues))\b|@\s*[A-Z]{3}\b|\bEXP\s+\d|\bcapital notes\b|\bnotes \d/i;

function pathArg(flag) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return "";
}

async function request(url, binary = false) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: binary ? "application/pdf,*/*" : "text/html,*/*" },
        signal: AbortSignal.timeout(90_000),
      });
      if (response.ok) return binary ? Buffer.from(await response.arrayBuffer()) : response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw new Error(last);
}

async function pdfBytes() {
  const local = pathArg("pdf");
  if (local) return fs.readFileSync(local);
  const html = await request(PAGE);
  const href = [...html.matchAll(/href="([^"]*Stockbroking[^"]*Share[^"]*List[^"]*\.pdf)"/gi)].map((match) => match[1])[0];
  const url = href ? new URL(href.replace(/^\/\//, "https://"), PAGE).href : FALLBACK;
  if (!href) console.error(`${PAGE} links no share list; reading ${FALLBACK}`);
  const bytes = await request(url, true);
  if (bytes.subarray(0, 4).toString() !== "%PDF") throw new Error(`${url} is not a PDF`);
  return bytes;
}

function wordsOf(bytes) {
  const python = spawnSync(
    "python3",
    [
      "-c",
      `
import json, sys
import fitz
doc = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")
words = []
for page_no, page in enumerate(doc):
    for x0, y0, _x1, y1, text, *_rest in page.get_text("words"):
        text = text.strip()
        if text:
            words.append({"page": page_no, "x": round(x0, 1), "y": round((y0 + y1) / 2, 1), "t": text})
json.dump(words, sys.stdout)
`,
    ],
    { input: bytes, maxBuffer: 256 * 1024 * 1024 }
  );
  if (python.error || python.status !== 0) {
    const detail = python.stderr?.toString() || python.error?.message || "";
    throw new Error(detail.includes("No module named 'fitz'") ? "PyMuPDF is missing: pip install pymupdf" : detail.slice(0, 400));
  }
  return JSON.parse(python.stdout.toString());
}

// Columns: name from the left margin, codes from x 250, the "allowed"
// answer from x 375, then levy, FTT and collateral.
function linesOf(words) {
  const pages = new Map();
  for (const word of words) {
    if (!pages.has(word.page)) pages.set(word.page, []);
    pages.get(word.page).push(word);
  }
  const lines = [];
  let section = "";
  let edition = "";
  // A name the page break cut: its first words close one page and the
  // codes open the next.
  let carried = [];
  for (const [, page] of [...pages].sort((a, b) => a[0] - b[0])) {
    page.sort((a, b) => a.y - b.y || a.x - b.x);
    const bands = [];
    for (const word of page) {
      const band = bands[bands.length - 1];
      if (band && Math.abs(word.y - band.y) < 2.5) band.words.push(word);
      else bands.push({ y: word.y, words: [word] });
    }
    const cell = (band, from, to) => band.words.filter((w) => w.x >= from && w.x < to).map((w) => w.t).join(" ").trim();
    const rows = [];
    const parts = [];
    for (const band of bands) {
      const text = band.words.map((w) => w.t).join(" ");
      const left = cell(band, 0, 250);
      const codes = cell(band, 250, 375);
      const allowed = cell(band, 375, 425);
      if (/^\d{1,2}-[A-Za-z]+-\d{2}$/.test(text)) {
        edition ||= text;
        continue;
      }
      if (!codes && !allowed && SECTIONS.includes(left)) {
        section = left;
        continue;
      }
      if (band.words.every((w) => HEADER.has(w.t)) || /^\*|^If you cannot find the market|^of minutes\.$/.test(text)) continue;
      if (/^(Yes|No)$/.test(allowed)) rows.push({ y: band.y, section, allowed, rest: cell(band, 425, 700), name: [], codes: [] });
      else if (allowed || cell(band, 425, 700)) throw new Error(`unreadable band on page ${band.words[0].page + 1}: ${text}`);
      if (left) parts.push({ y: band.y, field: "name", text: left });
      if (codes) parts.push({ y: band.y, field: "codes", text: codes });
    }
    if (carried.length) {
      if (!rows.length) throw new Error(`a cut line has nothing after it: ${carried.map((part) => part.text).join(" ")}`);
      for (const part of carried) rows[0][part.field].push(part);
      carried = [];
    }
    // A cell on the line's own band belongs to it. A wrapped cell is either
    // centred on a line that has nothing of that column on its band, or a
    // continuation under a line that starts on its band.
    const last = rows.length ? rows[rows.length - 1].y : -Infinity;
    const own = parts.filter((part) => rows.some((row) => Math.abs(row.y - part.y) < 0.5));
    for (const part of own) rows.find((row) => Math.abs(row.y - part.y) < 0.5)[part.field].push(part);
    for (const part of parts) {
      if (own.includes(part)) continue;
      const near = rows.filter((row) => Math.abs(row.y - part.y) <= 12);
      const open = near.filter((row) => !own.some((cell) => cell.field === part.field && Math.abs(cell.y - row.y) < 0.5));
      const pool = open.length ? open : near.filter((row) => row.y < part.y);
      const best = pool.sort((a, b) => Math.abs(a.y - part.y) - Math.abs(b.y - part.y))[0];
      if (best) best[part.field].push(part);
      else if (part.y > last) carried.push({ ...part, y: -1000 + carried.length });
      else throw new Error(`a cell has no line on its page: ${part.text}`);
    }
    for (const row of rows) {
      row.name = row.name.sort((a, b) => a.y - b.y).map((part) => part.text).join(" ").replace(/\s*\(24 Hours\)\s*/gi, " ").replace(/\s+/g, " ").trim();
      row.codes = row.codes.sort((a, b) => a.y - b.y).map((part) => part.text).join(" ").replace(/\s+/g, " ").trim();
      if (!row.name || !row.codes) throw new Error(`a line is missing its name or codes: ${row.name} ${row.codes}`);
      lines.push(row);
    }
  }
  if (carried.length) throw new Error(`the list ends on a name: ${carried.map((part) => part.text).join(" ")}`);
  return { lines, edition };
}

function etfTickers() {
  const byMic = new Map();
  for (const line of fs.readFileSync(ETFS, "utf8").split(/\r?\n/).slice(1)) {
    const cells = line.split(",");
    const ticker = String(cells[0] || "").split(":").pop().trim().toUpperCase();
    const place = String(cells[1] || "").trim().toUpperCase();
    if (!ticker || !place) continue;
    const mic = US_LIST[place]?.[1] || resolveVenue({ exchange: place }).venue?.mic;
    if (!mic) continue;
    if (!byMic.has(mic)) byMic.set(mic, new Set());
    byMic.get(mic).add(ticker);
  }
  return byMic;
}

// The American places the shared lists file each ticker on. AMEX there is
// both NYSE American and Arca: a fund is Arca, a share NYSE American.
function usPlaces() {
  const places = new Map();
  for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
    for (const line of fs.readFileSync(new URL(file, import.meta.url), "utf8").split(/\r?\n/).slice(1)) {
      const cells = line.split(",");
      const ticker = String(cells[0] || "").split(":").pop().trim().toUpperCase();
      const place = String(cells[1] || "").trim().toUpperCase();
      if (!["NYSE", "NASDAQ", "AMEX", "CBOE"].includes(place)) continue;
      if (!places.has(ticker)) places.set(ticker, new Set());
      places.get(ticker).add(place);
    }
  }
  return places;
}

function kindOf(name, ticker, mic, funds) {
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  if (/\bETFs?\b|\bUCITS\b/i.test(name)) return "ETF";
  const usMics = ["XNYS", "XNAS", "XASE", "ARCX", "BATS"];
  const pool = usMics.includes(mic) ? usMics : [mic];
  if (pool.some((place) => funds.get(place)?.has(ticker))) return "ETF";
  return "STOCK";
}

const bytes = await pdfBytes();
const { lines, edition } = linesOf(wordsOf(bytes));
if (lines.length < 9000) throw new Error(`the share list has ${lines.length} lines`);
const funds = etfTickers();
const american = usPlaces();

const rows = [];
const seen = new Set();
const leftOut = new Map();
const unreadable = [];
const tally = (label) => leftOut.set(label, (leftOut.get(label) || 0) + 1);
for (const line of lines) {
  // A long name can run into the code column and swallow the Reuters code.
  if (/^\/ /.test(line.codes)) {
    const base = line.codes.slice(2).split(" ")[0];
    const glued = line.name.match(new RegExp(`(${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.[A-Z]+)$`));
    if (!glued) throw new Error(`unreadable codes ${line.codes} (${line.name})`);
    line.name = line.name.slice(0, -glued[1].length).trim();
    line.codes = `${glued[1]} ${line.codes}`;
  }
  // A code printed without its Reuters suffix takes the one the Bloomberg
  // market code implies (US is read like .K below).
  line.codes = line.codes.replace(/^(\S+) \.([A-Z]+) \//, "$1.$2 /");
  const bare = line.codes.match(/^([A-Z0-9_]+) \/ (\S+) (LN|AU|ID|GY|PZ|US)$/);
  if (bare) line.codes = `${bare[1]}.${{ LN: "L", AU: "AX", ID: "I", GY: "DE", PZ: "ASE", US: "K" }[bare[3]]} / ${bare[2]} ${bare[3]}`;
  if (line.allowed !== "Yes") {
    tally("closed to new positions");
    continue;
  }
  if (ASIDE.test(line.name)) {
    tally("options, warrants, rights or notes");
    continue;
  }
  const match = line.codes.match(/^(\S+?)\.([A-Z]+)\d? \/ (.+)$/);
  if (!match) {
    unreadable.push(`${line.codes} (${line.name})`);
    continue;
  }
  const [, reuters, suffix, bloomberg] = match;
  if (bloomberg.includes("@") || /\bPFD$/.test(bloomberg)) {
    tally("preference shares and hybrids");
    continue;
  }
  // The Bloomberg code is the exchange's own ticker (NET LN where Reuters
  // writes NETC.L, ADS GY for ADSGn.DE); its class slash is a dot (BRK.B,
  // BT.A, BP.). /WS is a warrant and /U a unit.
  const code = bloomberg.match(/^(\S+) ([A-Z]{2})$/);
  if (!code) {
    unreadable.push(`${line.codes} (${line.name})`);
    continue;
  }
  if (/\/(WS|WT|U|R|RT)$/.test(code[1])) {
    tally("options, warrants, rights or notes");
    continue;
  }
  const ticker = code[1].replace(/\//g, ".");
  let mapped = SUFFIX[suffix];
  // .K is the NYSE consolidated code: the line takes the one American
  // place the shared lists file that ticker on.
  if (suffix === "K") {
    const places = [...(american.get(ticker) || [])];
    const fund = /\bET[FNC]s?\b/i.test(line.name) || ["XNYS", "XNAS", "XASE", "ARCX", "BATS"].some((place) => funds.get(place)?.has(ticker));
    const place = places.length === 1 ? places[0] : "";
    mapped = place ? SUFFIX[{ NYSE: "N", NASDAQ: "O", CBOE: "Z", AMEX: fund ? "P" : "A" }[place]] : null;
    if (!mapped) {
      tally("American lines on no single named place");
      continue;
    }
  }
  if (!mapped) {
    tally(`.${suffix} lines`);
    continue;
  }
  const [exchange, mic, currency, home] = mapped;
  if (home !== line.section) {
    tally(`lines filed under another market (.${suffix} in ${line.section})`);
    continue;
  }
  const type = kindOf(line.name, ticker, mic, funds);
  const key = `${mic}|${ticker}`;
  if (seen.has(key)) {
    tally("repeated lines");
    continue;
  }
  seen.add(key);
  rows.push({
    query: ticker,
    ticker,
    name: line.name,
    exchange,
    mic,
    currency,
    type,
    raw: [line.name, line.codes, line.allowed, line.rest, line.section].join(" "),
  });
}

// A stray typo in the codes is left out; more than a few means the layout moved.
if (unreadable.length > 5) throw new Error(`${unreadable.length} unreadable codes: ${unreadable.slice(0, 10).join("; ")}`);
if (unreadable.length) leftOut.set(`unreadable codes (${unreadable.join("; ")})`, unreadable.length);
const count = new Map();
for (const row of rows) count.set(row.mic || row.exchange, (count.get(row.mic || row.exchange) || 0) + 1);
for (const [mic, floor] of Object.entries(FLOOR)) {
  if ((count.get(mic) || 0) < floor) throw new Error(`${mic} has only ${count.get(mic) || 0} lines`);
}
for (const row of rows) {
  if (!resolveVenue(row).venue) throw new Error(`${row.ticker} on ${row.exchange} does not resolve`);
}

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("igau-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const types = new Map();
for (const row of kept) types.set(row.type, (types.get(row.type) || 0) + 1);
console.error(
  `${kept.length} listings from the ${edition || "undated"} list (${[...types].map(([type, n]) => `${n} ${type}`).join(", ")}; ` +
    `${kept.filter((row) => row.isin).length} with an ISIN): ` +
    [...count].sort((a, b) => b[1] - a[1]).map(([place, n]) => `${place} ${n}`).join(", ") +
    `. Left out: ${[...leftOut].map(([label, n]) => `${n} ${label}`).join(", ") || "none"}.`
);
