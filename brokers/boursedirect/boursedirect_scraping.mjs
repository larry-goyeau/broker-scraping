// What Bourse Direct actually quotes: ask their public search for each ISIN
// on the fund and share lists, keep the venues a ticket can name.
//
// The results page (`/fr/recherche?q=`) fills a DataTables grid from
// `/api/datatables/instruments/{ISIN}`. Each row carries a `data-href`
// `/fr/marche/{slug}/{name}-{ISIN}-{ticker}-{ccy}-{mic}/seance`. No login.
// Reuters prefixes the symbol with `E:` (most tapes) or `P:` (Xetra ETC /
// ETN). The slug sometimes repeats the quote currency (`ESOL-GBP-GBP-XSWX`).
// Satellite SIX lines (`E:SWDA-USD-XLON`, `…-SWDA-USD-XLON-USD-XSWX`) and
// the OTC / MTF / floor quotes are quote mirrors — those stay out.
//
// `node … ISIN` re-asks that search and replaces the old rows. `--refresh`
// does the same for every ISIN still on the list.
//
// A tracker can appear in search and still refuse the buy: no DIC /
// PRIIPs KID. FBT (US33733E2037, NYSE Arca, 2026-09-16) is the US
// packaged case; YIE10 (LU2976321161, ETFplus) is a LU UCITS the book
// has no KID for. Those lines stay and carry `nonEuResident`. YIE5P
// on the same sicav took the buy the same night — do not stamp the
// rest of YIS. American shares are not packaged and stay open.
//
// Ghost tapes, tickets of 2026-09-16 on the logged-in session:
// SE / DK stock off the home tape (ERCB, CBGB) → phone. LU / DE / IE /
// GB / CA / IT on SIX (CBSEU, ESOL, USPC, BTCW, ALM, ISP). CH on
// Xetra or ETFplus (NESR, CSOL) → Switzerland. US stock on Xetra
// (APC) → primary tape. GB on Xetra (WBIT, GUI, OD7F) → London.
// IE ETF on LSE (IWDA, CNDX) → order unavailable. LSE GBX twin of a
// GB ETC (WXBT / BTCW, WETP / ETHW) is AUTRE, no ticket — the USD
// line and Euronext take the buy. FI / FR / NL on Xetra, LU on LSE
// (CBSE), Diageo LSE and CH / US / FR / NL / XS on SIX stayed open.
//
//   node boursedirect/boursedirect_scraping.mjs
//   node boursedirect/boursedirect_scraping.mjs FR0000121014 IE00B4L5Y983
//   node boursedirect/boursedirect_scraping.mjs --refresh --start=400
//   node boursedirect/boursedirect_scraping.mjs --stocks-only --start=400
//
// Writes `boursedirect-parsed.json` next to this file.

import { stampRows } from "../accepted.mjs";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{9}\d\b/);
  return match ? match[0] : "";
}

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  return firstColumn.includes(":") ? firstColumn.split(":").pop().trim() : firstColumn;
}

function loadByIsin(csvPath, kind, into = new Map()) {
  if (!fs.existsSync(csvPath)) return into;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const name = columns.slice(isinIndex + 1).join(",").trim();
    const exchange =
      isinIndex >= 2 ? (columns[isinIndex - 1] || "").trim().toUpperCase() : "";
    if (!name) continue;

    const rows = into.get(isin) || [];
    into.set(isin, rows);
    rows.push({ ticker, kind, name, exchange });
  }
  return into;
}

// Catalogue codes the rest of the repo already speaks. MIC → that code.
const MIC_EXCHANGE = {
  XPAR: "EURONEXT",
  XAMS: "EURONEXT",
  XBRU: "EURONEXT",
  XLIS: "EURONEXT",
  XNAS: "NASDAQ",
  XNGS: "NASDAQ",
  XNMS: "NASDAQ",
  XNCM: "NASDAQ",
  XNYS: "NYSE",
  XASE: "AMEX",
  ARCX: "AMEX",
  BATS: "CBOE",
  XETR: "XETR",
  XLON: "LSE",
  XSWX: "SIX",
  XVTX: "SIX",
  XMIL: "MIL",
  ETFP: "MIL",
  XWBO: "VIE",
  XSTO: "OMXSTO",
  XHEL: "OMXHEX",
  XOSL: "OSL",
  XMCE: "BME",
  XMAD: "BME",
  XHKG: "HKEX",
  XTKS: "TSE",
};

const MARKET_EXCHANGES = new Set(Object.values(MIC_EXCHANGE));

function decode(html) {
  return String(html || "")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function tickerFor(rows, csvExchange, kind, fallback) {
  const pool = (rows || []).filter((row) => !kind || row.kind === kind);
  const onVenue = csvExchange ? pool.filter((row) => row.exchange === csvExchange) : [];
  return (onVenue[0] || pool[0] || {}).ticker || fallback || "";
}

function nameFor(rows, csvExchange, kind, fallback) {
  const pool = (rows || []).filter((row) => !kind || row.kind === kind);
  const onVenue = csvExchange ? pool.filter((row) => row.exchange === csvExchange) : [];
  return (onVenue[0] || pool[0] || {}).name || fallback;
}

function parseHref(href) {
  const path = decode(href).split("?")[0];
  const parts = path.split("/").filter(Boolean);
  const seance = parts.at(-1) === "seance" ? parts.at(-2) : parts.at(-1);
  if (!seance) return null;
  const bits = seance.split("-");
  const mic = bits.at(-1) || "";
  const currency = bits.at(-2) || "";
  if (!/^[A-Z]{4}$/.test(mic) || !/^[A-Z]{3}$/.test(currency)) return null;
  let head = bits.slice(0, -2);
  if (head.at(-1) === currency) head = head.slice(0, -1);
  const priorMic = head.at(-1) || "";
  if (/^[A-Z]{4}$/.test(priorMic) && MIC_EXCHANGE[priorMic] && priorMic !== mic) {
    return null;
  }
  const ticker = head.at(-1) || "";
  if (!/^[A-Z0-9.]{1,12}$/.test(ticker)) return null;
  return { isin: toIsin(head.at(-2) || ""), ticker, currency, mic };
}

function parseRow(cols) {
  const html = cols.map(String).join("\n");
  const href = decode((html.match(/data-href="([^"]+)"/) || [])[1] || "");
  const symbol = String((html.match(/data-symbol="([^"]+)"/) || [])[1] || "")
    .replace(/^[A-Z]:/, "")
    .trim()
    .toUpperCase();
  const name = decode(((html.match(/instru-name[^>]*>([^<]+)/) || [])[1] || "").trim());
  const market = decode(((html.match(/instru-market[^>]*>([^<]+)/) || [])[1] || "").trim());
  const parsed = parseHref(href);
  const isin = toIsin(cols[1]) || toIsin(parsed?.isin) || toIsin(href);
  // A hyphenated Reuters symbol (`SWDA-USD-XLON`) is a SIX satellite of
  // another listing, not a mnemonic a ticket would type. `P:ESOL` is the
  // Xetra ETC line the ticket of 2026-09-16 took.
  const ticker = symbol && !symbol.includes("-") && !symbol.includes(":") ? symbol : parsed?.ticker || "";
  const currency = parsed?.currency || "";
  const mic = parsed?.mic || "";
  const exchange = MIC_EXCHANGE[mic] || "";
  return { isin, ticker, name, market, currency, mic, exchange, href, symbol };
}

const NOT_A_TICKER = new Set(["USD", "EUR", "GBP", "GBX", "CHF", "JPY", "HKD", "SEK", "NOK", "DKK", ...Object.keys(MIC_EXCHANGE)]);

// Packaged: the ticket prints the missing DIC. An ISIN starting with US
// is not enough on its own for a share (accepted.mjs). YIE10 is the LU
// UCITS the ticket of 2026-09-16 refused the same way.
const NO_DIC = new Set(["LU2976321161"]);

function kidBlocked(type, isin) {
  if (!/^(ETF|ETC|ETN)$/i.test(type)) return false;
  const id = String(isin || "").toUpperCase();
  return id.startsWith("US") || NO_DIC.has(id);
}

// Home tape is Stockholm / Copenhagen. Xetra is a quote the ticket
// will not take online (ERCB, CBGB). Nokia FI on Xetra did take it.
function phoneOnlyHome(type, isin, exchange) {
  if (String(type || "").toUpperCase() !== "STOCK") return false;
  const id = String(isin || "").toUpperCase();
  const ex = String(exchange || "");
  if (id.startsWith("SE")) return ex !== "OMXSTO";
  if (id.startsWith("DK")) return ex !== "OMXCSE";
  return false;
}

function notOnSwiss(isin, exchange) {
  if (exchange !== "SIX") return false;
  return /^(LU|DE|IE|GB|CA|IT)/.test(String(isin || "").toUpperCase());
}

// Send-to-home: Nestlé Xetra (stock) / 21Shares ETFplus → Switzerland;
// Apple Xetra → Nasdaq. ASML, LVMH and Nokia on Xetra stayed open.
function sendHome(type, isin, exchange) {
  const id = String(isin || "").toUpperCase();
  const ex = String(exchange || "");
  const kind = String(type || "").toUpperCase();
  if (kind === "STOCK" && id.startsWith("CH") && ex === "XETR") return true;
  if (id.startsWith("CH") && ex === "MIL") return true;
  if (kind === "STOCK" && id.startsWith("US") && ex === "XETR") return true;
  if (id.startsWith("GB") && ex === "XETR") return true;
  return false;
}

// IWDA / CNDX 2026-09-16: tracker, LSE, « Passage d'ordre indisponible ».
function ieEtfOnLse(type, isin, exchange) {
  return String(type || "").toUpperCase() === "ETF"
    && String(isin || "").toUpperCase().startsWith("IE")
    && exchange === "LSE";
}

// CRUD LSE USD, same session: also « indisponible ». Paris CRUDP took the buy.
function deadTape(isin, exchange) {
  return String(isin || "").toUpperCase() === "GB00B15KXV33" && exchange === "LSE";
}

function wanted(row, csvRows, { fundsOnly, stocksOnly }) {
  if (!row.isin || !row.ticker || !row.currency || !row.exchange) return null;
  if (!/^[A-Z0-9.]{1,12}$/.test(row.ticker)) return null;
  if (NOT_A_TICKER.has(row.ticker)) return null;
  if (!MARKET_EXCHANGES.has(row.exchange)) return null;
  const hasEtf = (csvRows || []).some((item) => item.kind === "ETF");
  const hasStock = (csvRows || []).some((item) => item.kind === "STOCK");
  let type = "";
  if (hasEtf && !hasStock) type = "ETF";
  else if (hasStock && !hasEtf) type = "STOCK";
  else if (hasEtf) type = "ETF";
  else if (hasStock) type = "STOCK";
  if (!type) return null;
  if (fundsOnly && type !== "ETF") return null;
  if (stocksOnly && type !== "STOCK") return null;
  if (phoneOnlyHome(type, row.isin, row.exchange)) return null;
  if (notOnSwiss(row.isin, row.exchange)) return null;
  if (sendHome(type, row.isin, row.exchange)) return null;
  if (ieEtfOnLse(type, row.isin, row.exchange)) return null;
  if (deadTape(row.isin, row.exchange)) return null;
  return { ...row, type };
}

const SEARCH = "https://www.boursedirect.fr/api/datatables/instruments/";
const CONCURRENCY = 4;

function pathArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return new URL(fallback, import.meta.url);
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

// `--csv=PATH` the fund list (defaults to etfs.csv) and `--stocks-csv=PATH`
// the share list (defaults to stocks.csv). Bourse Direct is a French book:
// UCITS trackers and shares on Euronext, plus London, Xetra, the US tape
// and SIX. There is no spot crypto.
// `--funds-only` / `--etfs-only` answer for the trackers alone; `--stocks-only`
// for the shares.
const csvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const fundsOnly = hasFlag("funds-only") || hasFlag("etfs-only");
const stocksOnly = hasFlag("stocks-only");
const refresh = hasFlag("refresh");

const byIsin = new Map();
if (!stocksOnly) loadByIsin(csvPath, "ETF", byIsin);
if (!fundsOnly) loadByIsin(stocksCsvPath, "STOCK", byIsin);

const cliQueries = positionalArgs.map(toIsin).filter(Boolean);
const csvQueries = [...byIsin.keys()];
const queries = [...new Set(cliQueries.length > 0 ? cliQueries : csvQueries)];

const outputPath = new URL("boursedirect-parsed.json", import.meta.url);
const statePath = new URL("boursedirect-state.json", import.meta.url);

function loadJson(fileUrl) {
  if (!fs.existsSync(fileUrl)) return null;
  try {
    return JSON.parse(fs.readFileSync(fileUrl, "utf8"));
  } catch {
    return null;
  }
}

const results = [];
const seen = new Set();
const lookedUp = new Set();
const entryKey = (query, ticker, exchange, currency) =>
  `${query}:${ticker}:${exchange}:${currency || ""}`.toUpperCase();

const existing = loadJson(outputPath);
if (Array.isArray(existing)) {
  for (const entry of existing) {
    if (phoneOnlyHome(entry.type, entry.isin || entry.query, entry.exchange)) continue;
    if (notOnSwiss(entry.isin || entry.query, entry.exchange)) continue;
    if (sendHome(entry.type, entry.isin || entry.query, entry.exchange)) continue;
    if (ieEtfOnLse(entry.type, entry.isin || entry.query, entry.exchange)) continue;
    if (deadTape(entry.isin || entry.query, entry.exchange)) continue;
    if (kidBlocked(entry.type, entry.isin || entry.query)) entry.nonEuResident = true;
    else delete entry.nonEuResident;
    results.push(entry);
    if (entry?.query && entry?.ticker) {
      seen.add(entryKey(entry.query, entry.ticker, entry.exchange, entry.currency));
    }
    if (entry?.query) lookedUp.add(String(entry.query).toUpperCase());
  }
}

const priorState = cliQueries.length > 0 ? null : loadJson(statePath);
if (Array.isArray(priorState?.lookedUp)) {
  for (const isin of priorState.lookedUp) lookedUp.add(String(isin).toUpperCase());
}
if (cliQueries.length) {
  for (const isin of cliQueries) lookedUp.delete(isin);
} else if (refresh) {
  lookedUp.clear();
}

if (startIndex > 1) {
  for (const isin of queries.slice(0, startIndex - 1)) lookedUp.add(isin);
}

function saveState() {
  if (cliQueries.length) return;
  fs.writeFileSync(statePath, JSON.stringify({ lookedUp: [...lookedUp] }, null, 2));
}

function isGbxTwin(row, all) {
  if (row.exchange !== "LSE" || row.currency !== "GBX") return false;
  if (String(row.type || "").toUpperCase() !== "ETF") return false;
  const isin = String(row.isin || row.query || "").toUpperCase();
  if (!isin.startsWith("GB")) return false;
  return all.some(
    (other) =>
      String(other.isin || other.query || "").toUpperCase() === isin
      && other.exchange === "LSE"
      && other.currency
      && other.currency !== "GBX"
  );
}

function pruneGbxTwins() {
  const kept = results.filter((row) => !isGbxTwin(row, results));
  if (kept.length === results.length) return;
  results.length = 0;
  results.push(...kept);
  seen.clear();
  for (const row of results) {
    if (row?.query && row?.ticker) {
      seen.add(entryKey(row.query, row.ticker, row.exchange, row.currency));
    }
  }
}

function saveResults() {
  pruneGbxTwins();
  fs.writeFileSync(outputPath, JSON.stringify(stampRows(results), null, 2));
}

function forgetListings(isin) {
  const needle = String(isin).toUpperCase();
  for (let i = results.length - 1; i >= 0; i--) {
    const row = results[i];
    if (String(row.isin || row.query || "").toUpperCase() !== needle) continue;
    seen.delete(entryKey(row.query, row.ticker, row.exchange, row.currency));
    results.splice(i, 1);
  }
}

async function searchIsin(isin) {
  const url = `${SEARCH}${encodeURIComponent(isin)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json, text/javascript, */*",
        Referer: `https://www.boursedirect.fr/fr/recherche?q=${encodeURIComponent(isin)}`,
        "User-Agent": "Mozilla/5.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) return { status: response.status, rows: [] };
    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data.map(parseRow) : [];
    return { status: 200, rows };
  } catch {
    return { status: 0, rows: [] };
  } finally {
    clearTimeout(timer);
  }
}

async function searchWithRetry(isin) {
  let answer = await searchIsin(isin);
  for (let attempt = 0; attempt < 2 && answer.status !== 200; attempt++) {
    await sleep(400);
    answer = await searchIsin(isin);
  }
  return answer;
}

pruneGbxTwins();

const pending = queries.filter((isin) => !lookedUp.has(isin));
console.error(`${pending.length} ISINs to look up (${lookedUp.size} already done)`);

const skipped = new Map();
const bump = (reason) => skipped.set(reason, (skipped.get(reason) || 0) + 1);

for (let offset = 0; offset < pending.length; offset += CONCURRENCY) {
  const batch = pending.slice(offset, offset + CONCURRENCY);
  const answers = await Promise.all(batch.map((isin) => searchWithRetry(isin)));

  for (const [index, isin] of batch.entries()) {
    lookedUp.add(isin);
    const answer = answers[index];
    if (answer.status !== 200) {
      bump("search failed");
      console.error(`  ${isin}: search failed (${answer.status})`);
      continue;
    }
    const csvRows = byIsin.get(isin) || [];
    const hits = answer.rows
      .map((row) => wanted({ ...row, isin: row.isin || isin }, csvRows, { fundsOnly, stocksOnly }))
      .filter(Boolean);
    if (!hits.length) {
      bump(answer.rows.length ? "no kept venue" : "not listed");
      continue;
    }
    forgetListings(isin);
    for (const hit of hits) {
      const exchange = hit.exchange;
      const ticker = hit.ticker || tickerFor(csvRows, exchange, hit.type, "");
      const name = nameFor(csvRows, exchange, hit.type, hit.name);
      const key = entryKey(isin, ticker, exchange, hit.currency);
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = {
        query: isin,
        ticker,
        name,
        exchange,
        currency: hit.currency,
        type: hit.type,
        raw: [hit.name, hit.ticker, hit.mic, hit.market].filter(Boolean).join(" "),
        isin,
      };
      if (kidBlocked(hit.type, isin)) entry.nonEuResident = true;
      results.push(entry);
    }
  }

  const done = offset + batch.length;
  if (done <= 20 || done % 50 < CONCURRENCY || done >= pending.length) {
    console.error(`  looked up ${done}/${pending.length}, ${results.length} listings`);
  }
  if (done % 50 < CONCURRENCY) {
    saveState();
    saveResults();
  }
}

saveResults();
if (fs.existsSync(statePath)) fs.unlinkSync(statePath);

const byType = new Map();
const byEx = new Map();
let nonEu = 0;
for (const row of results) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  byEx.set(row.exchange, (byEx.get(row.exchange) || 0) + 1);
  if (row.nonEuResident) nonEu += 1;
}
console.error(
  `${results.length} matched (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`
);
console.error(`${nonEu} of them are non-EU-resident (no KID for European retail)`);
for (const [ex, count] of [...byEx].sort((a, b) => b[1] - a[1])) {
  console.error(`  ${String(count).padStart(5)} ${ex}`);
}
for (const [reason, count] of [...skipped].sort((a, b) => b[1] - a[1])) {
  console.error(`  ${String(count).padStart(5)} ${reason}`);
}

if (cliQueries.length) {
  const want = new Set(cliQueries);
  console.log(
    JSON.stringify(
      results.filter((row) => want.has(String(row.isin || row.query).toUpperCase())),
      null,
      2
    )
  );
}
