// Biuro Maklerskie BNP Paribas Bank Polska sells two books.
//
// The foreign book (12 markets: AT, BE, FI, FR, DE, IT, NL, PT, ES, UK, IE,
// US, phone orders only, through Saxo Bank) is published as lists linked
// from the foreign-markets page. "Wykaz zagranicznych instrumentów - akcje"
// is a PDF: name, Bloomberg ticker, ISIN, currency, kind (every line is
// Akcja; an ADR stays a share). A perpetual preferred line, printed with a
// bond-style Bloomberg name and no exchange code, stays out. The Bloomberg
// suffix is the place. US is the
// country, not the venue: the venue is the NASDAQ / NYSE / NYSE American /
// NYSE Arca / Cboe line of ../../assets/stocks.csv or etfs.csv with the same
// ISIN (else the same share ticker), and the OTC line only when no listed line
// carries the ISIN; a line with no single match is stored as USA. A US
// fund the list calls Akcja (DBA, JNUG, VNQI) is typed ETF when etfs.csv
// files that ISIN on a US exchange. GR and GY are
// Xetra, GF Frankfurt, LN and LI London, SM and SQ Madrid, UV is US OTC. EU
// (one line, Deutsche Post) is stored on Xetra. No Lisbon line is listed;
// the Portuguese names are Xetra lines.
// "Wykaz zagranicznych instrumentów - ETF" is the KID search: name,
// Bloomberg ticker, ISIN, kind (ETF, ETC, ETN, ETP), currency and exchange.
// The table is read in one page through the page's own changePage call,
// and the count must equal the rowsCount the page announces. Foreign
// bonds (a third list) stay out.
//
// Warsaw shares are not in either list. The brokerage-account page offers
// companies listed on the GPW "od największych firm z indeksu WIG20 po ...
// mniejsze przedsiębiorstwa" (shares, ETFs, bonds), and the GOmakler and
// GOwebmakler pages say orders are placed on GPW and NewConnect. Those rows
// are built as in brokers/bossa: Bankier's share, NewConnect and ETF boards,
// each symbol's profile for the ISIN, kept only where the quote is in
// zlotys. The same account page sells GlobalConnect shares in zlotys (the
// GOwebmakler FAQ gives its hours); those rows are the GlobalConnect
// company list, which prints the ISIN, as in brokers/erstepl. GlobalConnect
// ETFs are not named by the broker and stay out.
//
//   https://www.bnpparibas.pl/biuro-maklerskie/rynki-zagraniczne
//   https://www.bnpparibas.pl/_fileserver/item/1537057
//   https://www.bnpparibas.pl/wyszukiwarka-kid-fse
//   https://www.bnpparibas.pl/biuro-maklerskie/rachunek-maklerski
//   https://www.bnpparibas.pl/biuro-maklerskie/aplikacje-i-systemy/gowebmakler
//   https://www.bankier.pl/gielda/notowania/akcje
//   https://www.bankier.pl/gielda/notowania/new-connect
//   https://www.bankier.pl/etf/notowania
//   https://gpwglobalconnect.pl/spolki
//
//   node brokers/bnpparibasbiuro/bnpparibasbiuro_scraping.mjs
//   node brokers/bnpparibasbiuro/bnpparibasbiuro_scraping.mjs --pdf=./akcje.pdf
//
// Text is read with PyMuPDF (`python3 -c "import fitz"`).

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { spawnSync } from "node:child_process";
import https from "node:https";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://www.bnpparibas.pl/biuro-maklerskie/rynki-zagraniczne";
const SHARE_PDF = "https://www.bnpparibas.pl/_fileserver/item/1537057";
const KID_PAGE = "https://www.bnpparibas.pl/wyszukiwarka-kid-fse";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);

// Floors per book: a read below these is an error.
const FLOOR = { foreign: 900, etf: 200, GPW: 350, NewConnect: 300, GPW_ETF: 10, GlobalConnect: 30 };

// Bloomberg suffix of the share list to the place.
const SUFFIX = {
  FP: ["Euronext Paris", "XPAR"],
  NA: ["Euronext Amsterdam", "XAMS"],
  BB: ["Euronext Brussels", "XBRU"],
  PL: ["Euronext Lisbon", "XLIS"],
  IM: ["Borsa Italiana", "XMIL"],
  GR: ["XETR", "XETR"],
  GY: ["XETR", "XETR"],
  EU: ["XETR", "XETR"],
  GF: ["Frankfurt", "XFRA"],
  LN: ["LSE", "XLON"],
  LI: ["LSE", "XLON"],
  SM: ["BME", "XMAD"],
  SQ: ["BME", "XMAD"],
  FH: ["Nasdaq Helsinki", "XHEL"],
  AV: ["Wiener Börse", "XWBO"],
  ID: ["Euronext Dublin", "XMSM"],
  UV: ["OTC", "OTCM"],
};

// Exchange column of the KID search.
const KID_PLACE = {
  London: ["LSE", "XLON"],
  "Xetra ETF": ["XETR", "XETR"],
  Xetra: ["XETR", "XETR"],
  BrsaItaliana: ["Borsa Italiana", "XMIL"],
  Mediolan: ["Borsa Italiana", "XMIL"],
  "EN Paris": ["Euronext Paris", "XPAR"],
  "Paryż": ["Euronext Paris", "XPAR"],
  "EN Amsterdam": ["Euronext Amsterdam", "XAMS"],
  Amsterdam: ["Euronext Amsterdam", "XAMS"],
  Frankfurt: ["Frankfurt", "XFRA"],
  Stuttgart: ["Stuttgart", "XSTU"],
  Munich: ["gettex", "XMUN"],
};

// assets/stocks.csv exchange for a US line.
// assets/etfs.csv files NYSE Arca funds under AMEX.
const US_FILE = {
  NASDAQ: ["NASDAQ", "XNAS"],
  NYSE: ["NYSE", "XNYS"],
  AMEX: ["NYSE American", "XASE"],
  CBOE: ["Cboe BZX", "BATS"],
  OTC: ["OTC", "OTCM"],
};
const US_ETF_FILE = {
  NASDAQ: ["NASDAQ", "XNAS"],
  NYSE: ["NYSE", "XNYS"],
  AMEX: ["NYSE Arca", "ARCX"],
  CBOE: ["Cboe BZX", "BATS"],
};

const CURRENCIES = new Set(["EUR", "USD", "GBP", "GBX"]);
const KINDS = new Set(["ETF", "ETC", "ETN", "ETP"]);

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function textOf(html) {
  return normalize(decodeEntities(String(html ?? "").replace(/<[^>]+>/g, " ")));
}

function pathArg(flag) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return "";
}

function rowOf({ ticker, name, exchange, mic, currency, type, isin, raw }) {
  const row = { query: isin || ticker, ticker, name: name || ticker, exchange };
  if (mic) row.mic = mic;
  row.currency = currency;
  row.type = type;
  row.isin = isin;
  row.raw = raw;
  return row;
}

// ---------- foreign shares (PDF) ----------

async function pdfBytes() {
  const local = pathArg("pdf");
  if (local) return fs.readFileSync(local);
  const page = await fetch(PAGE, { headers: { "User-Agent": UA } });
  if (!page.ok) throw new Error(`Foreign-markets page answered ${page.status}`);
  const html = await page.text();
  // The share list is the link right after "Wykaz zagranicznych instrumentów - akcje".
  const at = html.indexOf("instrumentów - akcje");
  const href = at < 0 ? "" : html.slice(at, at + 2000).match(/href="([^"]*_fileserver\/item\/\d+)"/)?.[1];
  if (!href) throw new Error("The foreign share list is not linked from the foreign-markets page");
  const url = new URL(href, PAGE).href;
  if (url !== SHARE_PDF) console.error(`Share list moved to ${url}`);
  const file = await fetch(url, { headers: { "User-Agent": UA } });
  if (!file.ok) throw new Error(`Share list answered ${file.status}`);
  return Buffer.from(await file.arrayBuffer());
}

// One line per row; words are grouped by baseline.
function pdfLines(bytes) {
  const python = spawnSync(
    "python3",
    [
      "-c",
      `
import json, sys
import fitz

doc = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")
lines = []
for page in doc:
    rows = {}
    for x0, y0, x1, y1, text, *_ in page.get_text("words"):
        key = round(y0 / 3)
        rows.setdefault(key, []).append((x0, text))
    for key in sorted(rows):
        lines.append([text for _, text in sorted(rows[key])])
json.dump(lines, sys.stdout)
`,
    ],
    { input: bytes, maxBuffer: 64 * 1024 * 1024 }
  );
  if (python.status !== 0) {
    const detail = python.stderr?.toString() || "";
    throw new Error(
      detail.includes("No module named 'fitz'")
        ? "PyMuPDF is missing: pip install pymupdf"
        : `Could not read the PDF${detail ? `: ${detail.trim()}` : ""}`
    );
  }
  return JSON.parse(python.stdout.toString("utf8"));
}

function loadUsIndex() {
  const byIsin = new Map();
  const byTicker = new Map();
  for (const [kind, file] of [["STOCK", STOCKS], ["ETF", ETFS]]) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    if (!/^ticker,exchange,isin/i.test(lines[0])) throw new Error(`${file.pathname} header is ${lines[0]}`);
    const places = kind === "ETF" ? US_ETF_FILE : US_FILE;
    for (const line of lines.slice(1)) {
      const [symbol, exchange, isin] = line.split(",");
      const place = places[exchange];
      if (!place) continue;
      const ticker = String(symbol).split(":").pop().toUpperCase();
      const hit = { kind, place, ticker, otc: exchange === "OTC" };
      const add = (map, key) => {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(hit);
      };
      if (toIsin(isin)) add(byIsin, isin);
      add(byTicker, ticker);
    }
  }
  return { byIsin, byTicker };
}

// One venue for the line: listed US exchanges first, OTC only when no
// listed line carries the ISIN.
function usPlace(index, isin, ticker) {
  const wanted = ticker.replace(/\//g, ".");
  const pick = (hits) => {
    const mics = new Set(hits.map((hit) => hit.place[1]));
    if (mics.size === 1) return hits[0];
    const same = hits.filter((hit) => hit.ticker === wanted);
    return new Set(same.map((hit) => hit.place[1])).size === 1 ? same[0] : null;
  };
  const all = index.byIsin.get(isin) || [];
  const listed = all.filter((hit) => !hit.otc);
  if (listed.length) return pick(listed);
  if (all.length) return pick(all);
  const byCode = (index.byTicker.get(wanted) || []).filter((hit) => !hit.otc && hit.kind === "STOCK");
  return byCode.length ? pick(byCode) : null;
}

function foreignShares(lines) {
  const index = loadUsIndex();
  const rows = [];
  const skipped = [];
  const preferred = [];
  let usa = 0;
  let funds = 0;
  for (const words of lines) {
    if (words.at(-1) !== "Akcja") continue;
    const isinAt = words.findIndex((word) => toIsin(word));
    const tickerAt = words.findIndex((word) => /^[^:\s]+:[A-Z]{2}$/.test(word));
    if (isinAt >= 0 && tickerAt < 0 && words.includes("PERP")) {
      preferred.push(words.join(" "));
      continue;
    }
    if (isinAt < 0 || tickerAt < 0 || tickerAt > isinAt) {
      skipped.push(words.join(" "));
      continue;
    }
    const isin = toIsin(words[isinAt]);
    const currency = words.slice(isinAt + 1, -1).join("").toUpperCase();
    const [code, suffix] = words[tickerAt].split(":");
    const ticker = code.toUpperCase();
    const name = normalize(words.slice(/^\d+$/.test(words[0]) ? 1 : 0, tickerAt).join(" "));
    if (!CURRENCIES.has(currency)) {
      skipped.push(words.join(" "));
      continue;
    }
    let place = SUFFIX[suffix];
    let type = "STOCK";
    if (suffix === "US") {
      const hit = usPlace(index, isin, ticker);
      place = hit ? hit.place : ["USA", ""];
      if (!hit) usa += 1;
      if (hit?.kind === "ETF") {
        type = "ETF";
        funds += 1;
      }
    }
    if (!place) {
      skipped.push(words.join(" "));
      continue;
    }
    const [exchange, mic] = place;
    rows.push(rowOf({
      ticker,
      name,
      exchange,
      mic,
      currency,
      type,
      isin,
      raw: [words[tickerAt], name, isin, currency, "Akcja"].join(" "),
    }));
  }
  if (skipped.length) throw new Error(`Share list has ${skipped.length} unread lines, first: ${skipped[0]}`);
  return { rows, usa, funds, preferred };
}

// ---------- ETF / ETC / ETN (KID search) ----------

async function kidRows() {
  const page = await fetch(KID_PAGE, { headers: { "User-Agent": UA } });
  if (!page.ok) throw new Error(`KID search answered ${page.status}`);
  const cookie = page.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ");
  const html = decodeEntities(await page.text());
  const announced = Number(html.match(/"rowsCount":(\d+)/)?.[1]);
  const action = html.match(/"changePageActionUrl":"([^"]+)"/)?.[1];
  if (!announced || !action) throw new Error("KID search page has no row count or page action");
  const response = await fetch(new URL(action, KID_PAGE), {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Cookie: cookie,
      Referer: KID_PAGE,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: `pageNum=1&pageSize=${announced + 100}&order=name&`,
  });
  if (!response.ok) throw new Error(`KID search page call answered ${response.status}`);
  const table = (await response.json()).table || "";
  const lines = [...table.matchAll(/<tr tabindex="0">([\s\S]*?)<\/tr>/g)].map((match) =>
    [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => {
      const spans = [...cell[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((span) => textOf(span[1]));
      return spans[1] ?? textOf(cell[1]);
    })
  );
  if (lines.length !== announced) throw new Error(`KID search announced ${announced} rows and returned ${lines.length}`);
  const rows = [];
  const skipped = [];
  for (const [name, bloomberg, isinCell, kind, ccy, market] of lines) {
    const isin = toIsin(isinCell);
    const currency = ccy === "GBp" ? "GBX" : normalize(ccy).toUpperCase();
    const place = KID_PLACE[normalize(market)];
    const type = normalize(kind).toUpperCase();
    const ticker = normalize(bloomberg).split(":")[0].toUpperCase();
    if (!isin || !place || !KINDS.has(type) || !CURRENCIES.has(currency) || !ticker) {
      skipped.push(`${name} ${bloomberg} ${isinCell} ${kind} ${ccy} ${market}`);
      continue;
    }
    rows.push(rowOf({
      ticker,
      name,
      exchange: place[0],
      mic: place[1],
      currency,
      type,
      isin,
      raw: [bloomberg, name, isin, kind, currency, market].join(" "),
    }));
  }
  if (skipped.length) throw new Error(`KID search has ${skipped.length} unread rows, first: ${skipped[0]}`);
  return rows;
}

// ---------- Warsaw (as brokers/bossa) ----------

const SHARE_BOARD = "https://www.bankier.pl/gielda/notowania/akcje";
const NC_BOARD = "https://www.bankier.pl/gielda/notowania/new-connect";
const ETF_BOARD = "https://www.bankier.pl/etf/notowania";

function profileSymbols(html) {
  return [...new Set(html.match(/data-symbol="([^"]+)"/g) ?? [])].map((hit) =>
    hit.slice('data-symbol="'.length, -1)
  );
}

function quoteSymbols(html) {
  const body = html.split("<tbody>").at(-1)?.split("</tbody>")[0] ?? "";
  const symbols = [];
  const seen = new Set();
  for (const match of body.matchAll(/quote\.html\?symbol=([^"&]+)/g)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    symbols.push(match[1]);
  }
  return symbols;
}

function etfNames(html) {
  const names = new Map();
  const pattern = /quote\.html\?symbol=([^"&]+)"[\s\S]{0,300}?m-tooltip__content">([^<]+)/g;
  for (const match of html.matchAll(pattern)) names.set(match[1], normalize(match[2]));
  return names;
}

async function profileHead(symbol) {
  const response = await fetch(
    `https://www.bankier.pl/inwestowanie/profile/quote.html?symbol=${encodeURIComponent(symbol)}`,
    { headers: { "user-agent": "Mozilla/5.0" } }
  );
  if (!response.ok) throw new Error(`${symbol} profile answered ${response.status}`);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < 280_000) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel();
  return Buffer.concat(chunks).toString("utf8");
}

function profileRow(html, fallbackName, type, exchange) {
  const isin = toIsin(html.match(/data-isin="([^"]+)"/)?.[1]);
  const unit = html.match(/data-unit="([^"]+)"/)?.[1] ?? "";
  if (!isin || unit !== "zł") return null;
  const suffix = normalize(html.match(/a-heading__suffix[^"]*">([^<]+)/)?.[1]);
  const wrapped = suffix.match(/^(.*)\(([^)]+)\)\s*$/);
  const ticker = normalize(wrapped ? wrapped[2] : suffix).toUpperCase();
  const name = normalize(wrapped ? wrapped[1] : fallbackName);
  if (!ticker) return null;
  return rowOf({
    ticker,
    name,
    exchange,
    mic: exchange === "NewConnect" ? "XNCO" : "XWAR",
    currency: "PLN",
    type,
    isin,
    raw: [ticker, name, exchange, "PLN", type].filter(Boolean).join(" "),
  });
}

async function warsawListings() {
  const [sharesPage, ncPage, etfPage] = await Promise.all([
    fetch(SHARE_BOARD),
    fetch(NC_BOARD),
    fetch(ETF_BOARD),
  ]);
  if (!sharesPage.ok) throw new Error(`GPW share board answered ${sharesPage.status}`);
  if (!ncPage.ok) throw new Error(`NewConnect board answered ${ncPage.status}`);
  if (!etfPage.ok) throw new Error(`GPW ETF board answered ${etfPage.status}`);
  const [sharesHtml, ncHtml, etfHtml] = await Promise.all([
    sharesPage.text(),
    ncPage.text(),
    etfPage.text(),
  ]);
  const jobs = [
    ...profileSymbols(sharesHtml).map((symbol) => ({ symbol, type: "STOCK", name: "", exchange: "GPW" })),
    ...quoteSymbols(ncHtml).map((symbol) => ({ symbol, type: "STOCK", name: "", exchange: "NewConnect" })),
    ...[...etfNames(etfHtml)].map(([symbol, name]) => ({ symbol, type: "ETF", name, exchange: "GPW" })),
  ];
  const rows = [];
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;
      const html = await profileHead(job.symbol);
      const row = profileRow(html, job.name, job.type, job.exchange);
      if (row) rows.push(row);
    }
  }
  await Promise.all(Array.from({ length: 12 }, worker));
  return rows;
}

// ---------- GlobalConnect (company list, as brokers/erstepl) ----------

// The exchange's server resets an HTTP/2 or undici connection; a plain
// HTTP/1.1 request is answered.
function postText(url, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        ALPNProtocols: ["http/1.1"],
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pl,en;q=0.8",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          if (response.statusCode !== 200) reject(new Error(`${url} answered ${response.statusCode}`));
          else resolve(Buffer.concat(chunks).toString("utf8"));
        });
      }
    );
    request.setTimeout(60_000, () => request.destroy(new Error(`${url} timed out`)));
    request.on("error", reject);
    request.end(body);
  });
}

async function globalConnectRows() {
  const html = await postText(
    "https://gpwglobalconnect.pl/ajaxindex.php",
    "format=html&lang=PL&offset=0&limit=500&action=GCCompany&start=listAjax&order=gls_nazwa&order_type=ASC&searchText="
  );
  const rows = [];
  for (const match of html.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const chunk = match[0];
    const isin = toIsin(chunk.match(/isin=([A-Z0-9]{12})/)?.[1]);
    const ticker = normalize(chunk.match(/class="grey">\(([^)]+)\)/)?.[1]).toUpperCase();
    const name = textOf(chunk.match(/class="name">\s*([\s\S]*?)<span/)?.[1]);
    if (!isin || !ticker || /^ETF/i.test(ticker) || /\bETF\b/i.test(name)) continue;
    rows.push(rowOf({
      ticker,
      name,
      exchange: "GlobalConnect",
      mic: "XGLO",
      currency: "PLN",
      type: "STOCK",
      isin,
      raw: [ticker, name, "GlobalConnect", "PLN", "STOCK"].join(" "),
    }));
  }
  return rows;
}

// ---------- assemble ----------

const foreign = foreignShares(pdfLines(await pdfBytes()));
const etfs = await kidRows();
const warsaw = await warsawListings();
const connect = await globalConnectRows();

const books = {
  foreign: foreign.rows.length,
  etf: etfs.length,
  GPW: warsaw.filter((row) => row.exchange === "GPW" && row.type === "STOCK").length,
  NewConnect: warsaw.filter((row) => row.exchange === "NewConnect").length,
  GPW_ETF: warsaw.filter((row) => row.exchange === "GPW" && row.type === "ETF").length,
  GlobalConnect: connect.length,
};
for (const [book, floor] of Object.entries(FLOOR)) {
  if (books[book] < floor) throw new Error(`${book} read is short: ${books[book]} (floor ${floor})`);
}

const seen = new Set();
const results = [];
for (const row of [...foreign.rows, ...etfs, ...warsaw, ...connect]) {
  const key = `${row.isin}:${row.exchange}:${row.currency}`;
  if (seen.has(key)) continue;
  seen.add(key);
  results.push(row);
}
results.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(
  new URL("bnpparibasbiuro-parsed.json", import.meta.url),
  JSON.stringify(stampRows(withoutObligations(results)), null, 2)
);

const byBook = new Map();
for (const row of results) {
  const label = `${row.exchange} ${row.type}`;
  byBook.set(label, (byBook.get(label) || 0) + 1);
}
console.error(
  `${results.length} listings (${[...byBook].sort().map(([label, count]) => `${count} ${label}`).join(", ")})`
);
console.error(`Books read: ${Object.entries(books).map(([book, count]) => `${book} ${count}`).join(", ")}`);
console.error(`Perpetual preferred lines left out: ${foreign.preferred.length}`);
console.error(`US lines filed as funds in etfs.csv (typed ETF): ${foreign.funds}`);
console.error(`US lines with no single venue in stocks.csv / etfs.csv (stored as USA): ${foreign.usa}`);
