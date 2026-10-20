// What Stanbic IBTC Stockbrokers sells on the Nigerian Exchange, with no
// login. The broker's equities price listing reads one public Standard
// Bank feed, and that feed is the book: every NGX line of the day, each
// with its market segment. Main Board (EQTY), Premium, Growth and the
// listed REITs (REITCEF) are shares; the ETF segment is the funds, and
// the non-interest segment adds one bank and one ETF. Bonds and sukuk
// (DEBT, IMPACT, the non-interest debt), the NGX indexes (INDX), the
// memorandum mutual funds (MFUND) and the closed-end infrastructure and
// real-estate funds on the Main Board are other products and are not
// written. The feed prints an ISIN on about half the lines; a code with
// a bad check digit is dropped and the shared lists fill it when they
// know the ticker.
//
//   https://www.stanbicibtcstockbrokers.com/nigeriastockbroking/stockbroking/market-news/equities-price-listing
//   https://feeds.standardbank.com/Market-Data-Files/NSB/Rates/allNGAStock.json
//
//   node brokers/stanbicibtc/stanbicibtc_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const FEED = "https://feeds.standardbank.com/Market-Data-Files/NSB/Rates/allNGAStock.json";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const PLACE = "Nigerian Exchange";
const SHARES = new Set(["EQTY", "PREMIUM", "GROWTH", "REITCEF"]);
const LEFT_OUT = { DEBT: "bonds", IMPACT: "impact bonds", INDX: "indexes", MFUND: "mutual funds" };
// The columns the feed's own ColumnDef names.
const COLUMNS = { Symbol: "1", Name: "2", Sector: "3", Close: "9", MktSegment: "20", ISINCode: "21", Date: "0" };
const FLOOR = { STOCK: 120, ETF: 8 };

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", Referer: "https://www.stanbicibtcstockbrokers.com/" },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

function isinCheck(code) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(code)) return false;
  const digits = code.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

const leftOut = new Map();
const tally = (label) => leftOut.set(label, (leftOut.get(label) || 0) + 1);

function kindOf(segment, sector, name) {
  if (segment === "ETF") return "ETF";
  if (segment === "NON-INTEREST") {
    if (sector === "ETF") return "ETF";
    if (sector === "DEBT" || sector === "NON-INTEREST") return "sukuk";
    return "STOCK";
  }
  if (SHARES.has(segment)) {
    if (/\bFUND\b/.test(name) && !/REIT/i.test(sector)) return "closed-end funds";
    return "STOCK";
  }
  if (LEFT_OUT[segment]) return LEFT_OUT[segment];
  throw new Error(`unknown market segment ${segment || "(none)"} on ${name}`);
}

const body = await getJson(FEED);
const table = body?.DataTable;
for (const [label, index] of Object.entries(COLUMNS)) {
  if (table?.ColumnDef?.[index] !== label) throw new Error(`feed column ${index} is ${table?.ColumnDef?.[index]}, not ${label}`);
}
const lines = table.Rows;
if (!Array.isArray(lines) || lines.length < 250) throw new Error(`feed has ${lines?.length ?? 0} lines`);

const stamps = lines.map((line) => Date.parse(clean(line[COLUMNS.Date]).split(" ")[0])).filter(Number.isFinite);
const latest = Math.max(...stamps);
const day = clean(lines.find((line) => Date.parse(clean(line[COLUMNS.Date]).split(" ")[0]) === latest)[COLUMNS.Date]).split(" ")[0];
const age = (Date.now() - latest) / 86_400_000;
if (!(age < 10)) throw new Error(`feed is dated ${day}`);

const rows = [];
const seen = new Set();
let badIsins = 0;
for (const line of lines) {
  const ticker = clean(line[COLUMNS.Symbol]).toUpperCase();
  const name = clean(line[COLUMNS.Name]);
  const segment = clean(line[COLUMNS.MktSegment]).toUpperCase();
  const sector = clean(line[COLUMNS.Sector]);
  if (!ticker || !name) throw new Error(`unreadable line ${JSON.stringify(line).slice(0, 160)}`);
  const type = kindOf(segment, sector, name);
  if (type !== "STOCK" && type !== "ETF") {
    tally(type);
    continue;
  }
  if (seen.has(ticker)) throw new Error(`${ticker} repeats`);
  seen.add(ticker);
  let isin = clean(line[COLUMNS.ISINCode]).replace(/\s+/g, "").toUpperCase();
  if (isin && !isinCheck(isin)) {
    badIsins += 1;
    isin = "";
  }
  rows.push({
    query: isin || ticker,
    ticker,
    name,
    exchange: PLACE,
    mic: "XNGN",
    currency: "NGN",
    type,
    ...(isin ? { isin } : {}),
    raw: [ticker, name, sector, segment, isin, PLACE].filter(Boolean).join(" "),
  });
}

const isins = new Set();
for (const row of rows) {
  if (!row.isin) continue;
  if (isins.has(row.isin)) throw new Error(`ISIN ${row.isin} repeats`);
  isins.add(row.isin);
}
const count = { STOCK: 0, ETF: 0 };
for (const row of rows) count[row.type] += 1;
for (const [type, floor] of Object.entries(FLOOR)) {
  if (count[type] < floor) throw new Error(`only ${count[type]} ${type} lines`);
}

rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("stanbicibtc-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const skipped = [...leftOut].map(([label, value]) => `${value} ${label}`).join(", ");
console.error(
  `${rows.length} listings (${day}): ${PLACE} STOCK ${count.STOCK}, ${PLACE} ETF ${count.ETF}; ${isins.size} feed ISINs, ${badIsins} dropped. Left out: ${skipped || "none"}.`
);
