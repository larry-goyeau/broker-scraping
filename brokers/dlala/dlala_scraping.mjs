// What Dlala Brokerage sells in shares and exchange-traded funds, with no
// login. Dlala deals on the Qatar Stock Exchange alone. Its home page
// prints the QSE price ticker it streams to clients: one entry per line,
// each with the ticker in the logo file name (images/clients/QNBK.png) and
// a short name, last price and volume. That ticker is the book. The full
// names and the sector come from the broker's "Listed Companies" page,
// which files the two QSE funds under "ETFs"; it says it is the list
// "until September 2024", so a line listed since then keeps the ticker's
// short name. A line is an ETF when that page files it under ETFs or its
// name says ETF; every other line, the venture market included, is a
// share. Debt instruments are not on the ticker.
//
// No page prints an ISIN. One is copied from stocks.csv when that ticker on
// QSE names a single Qatari ISIN; the two funds have none there and stay
// without.
//
// The QSE account is in riyals and every line trades in riyals. venues.mjs
// has no Qatar book yet, so the rows say "Qatar Stock Exchange" with its
// MIC (DSMD) and resolveVenue leaves them unresolved.
//
//   https://www.dlalabroker.com/en/
//   https://www.dlalabroker.com/en/listed-companies/
//
//   node brokers/dlala/dlala_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const HOME = "https://www.dlalabroker.com/en/";
const LISTED = "https://www.dlalabroker.com/en/listed-companies/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const EXCHANGE = "Qatar Stock Exchange";
const MIC = "DSMD";
const FLOOR = { STOCK: 45, ETF: 2 };
// The section titles of the Listed Companies page. A new one is a change
// worth looking at, so it stops the run.
const SECTIONS = {
  "Banks & Financial Services": "STOCK",
  "Consumer Goods & Services": "STOCK",
  Industrial: "STOCK",
  Insurance: "STOCK",
  "Real Estate": "STOCK",
  Telecoms: "STOCK",
  Transportation: "STOCK",
  "Venture Market": "STOCK",
  ETFs: "ETF",
};

async function textOf(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(45000) });
      if (response.ok) return await response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw new Error(last);
}

const clean = (value) =>
  String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#8217;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// The home page ticker: <li><img src=".../images/clients/QNBK.png"><span
// class="marqueeupdate_1">QNB:17.5/1,234</span></li>.
function tickerBook(html) {
  const book = new Map();
  for (const match of html.matchAll(/images\/clients\/([^"/.]+)\.png"\s*>\s*<span class="marqueeupdate_\d+">([^<]*)<\/span>/g)) {
    const ticker = match[1].trim().toUpperCase();
    const text = clean(match[2]);
    const name = text.replace(/:[^:]*$/, "").trim();
    if (!/^[A-Z][A-Z0-9]{2,7}$/.test(ticker) || !name || !/:[\d.,]+\/[\d,]+$/.test(text)) throw new Error(`unreadable ticker entry ${JSON.stringify(match[0]).slice(0, 200)}`);
    if (book.has(ticker)) throw new Error(`${ticker} repeats on the ticker`);
    book.set(ticker, { ticker, short: name, text });
  }
  return book;
}

// The Listed Companies page: one table per section, a title row, a
// "Code / Name" header, then one code and name per row.
function listedCompanies(html) {
  const found = new Map();
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map((match) => match[1]);
  for (const table of tables) {
    const cells = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((row) => [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => clean(cell[1])));
    const title = (cells[0]?.[0] || "").replace(/\s*Section$/, "");
    const type = SECTIONS[title];
    if (!type) throw new Error(`unknown section on the Listed Companies page: ${cells[0]?.[0]}`);
    if (cells[1]?.join("|") !== "Code|Name") throw new Error(`${title} has no Code/Name header`);
    for (const [code, name, ...rest] of cells.slice(2)) {
      const ticker = String(code || "").toUpperCase();
      if (!/^[A-Z][A-Z0-9]{2,7}$/.test(ticker) || !name || rest.length) throw new Error(`unreadable line in ${title}: ${code} ${name}`);
      if (found.has(ticker)) throw new Error(`${ticker} repeats on the Listed Companies page`);
      found.set(ticker, { name, section: title, type });
    }
  }
  if (found.size < 50) throw new Error(`the Listed Companies page printed ${found.size} lines`);
  return found;
}

// stocks.csv files Qatar as QSE. A ticker that names exactly one Qatari ISIN
// there is that line; anything else stays without.
function qseIsins() {
  const found = new Map();
  for (const line of fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8").split(/\r?\n/)) {
    const [ticker, place, isin] = line.split(",");
    if (place !== "QSE" || !/^QA[A-Z0-9]{10}$/.test(isin || "")) continue;
    const code = String(ticker).split(":").pop().trim().toUpperCase();
    if (!found.has(code)) found.set(code, new Set());
    found.get(code).add(isin);
  }
  return found;
}

const book = tickerBook(await textOf(HOME));
const listed = listedCompanies(await textOf(LISTED));
const isins = qseIsins();

const rows = [];
const fresh = [];
for (const line of book.values()) {
  const entry = listed.get(line.ticker);
  if (!entry) fresh.push(line.ticker);
  const name = entry?.name || line.short;
  const type = entry?.type || (/\bETF\b/i.test(name) ? "ETF" : "STOCK");
  if ((type === "ETF") !== /\bETF\b/i.test(name)) throw new Error(`${line.ticker} (${name}) is filed under ${entry?.section}`);
  const hit = isins.get(line.ticker);
  const isin = type === "STOCK" && hit?.size === 1 ? [...hit][0] : "";
  rows.push({
    query: isin || line.ticker,
    ticker: line.ticker,
    name,
    exchange: EXCHANGE,
    mic: MIC,
    currency: "QAR",
    type,
    ...(isin ? { isin } : {}),
    raw: [line.ticker, line.short, name, entry?.section || "not on the Listed Companies page", "QAR"].join(" "),
  });
}

const count = { STOCK: 0, ETF: 0 };
for (const row of rows) count[row.type] += 1;
for (const [type, floor] of Object.entries(FLOOR)) {
  if (count[type] < floor) throw new Error(`only ${count[type]} ${type} lines on the ticker (expected at least ${floor})`);
}
// A ticker much shorter than the company list means the marquee lost lines.
if (rows.length < listed.size - 6) throw new Error(`the ticker has ${rows.length} lines, the Listed Companies page ${listed.size}`);

rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("dlala-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const delisted = [...listed.keys()].filter((ticker) => !book.has(ticker));
const withIsin = rows.filter((row) => row.isin).length;
console.error(
  `${rows.length} listings: ${EXCHANGE} STOCK ${count.STOCK}, ${EXCHANGE} ETF ${count.ETF}; ${withIsin} ISINs.` +
    ` Not on the 2024 company list: ${fresh.join(", ") || "none"}. On that list but not on the ticker: ${delisted.join(", ") || "none"}.`,
);
