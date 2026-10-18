// Portu (WOOD & Co., Czech Republic) sells single shares and ETFs in its
// Brokerage mode from one list. The public page "Nabídka instrumentů pro
// Brokerage" pages that list ten at a time; the page reads it from the
// filtered-instruments endpoint (product 5 = Brokerage), with no login.
// The endpoint states the total, every line carries AllowInPortuBrokerage,
// the MIC, the currency and the Bloomberg ticker.
//
// Places: Prague (CP), Xetra (GY), Euronext Amsterdam (NA), London (LN),
// Nasdaq and the NYSE (US). Lines filed as "Cryptocurrency" are crypto
// ETNs and ETPs on Xetra and are kept as ETN. No ISIN is printed: the
// Bloomberg code is joined to ../../assets/stocks.csv and etfs.csv on the
// same place; one ISIN is kept, several stay on the row as matches.
// Portfolio products (the managed account) are not part of this list.
//
//   https://www.portu.cz/investice/jednotlive-akcie-etf
//   https://app.portu.cz/api/v1/expert/filtered-instruments
//
//   node brokers/portu/portu_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SOURCE = "https://app.portu.cz/api/v1/expert/filtered-instruments";
const BROKERAGE = 5;
const PAGE = 100;
const FLOOR = 350;
const ASSETS = [new URL("../../assets/stocks.csv", import.meta.url), new URL("../../assets/etfs.csv", import.meta.url)];

// MIC -> [exchange, places in the asset files]
const PLACE = {
  XPRA: ["Prague Stock Exchange", ["PSECZ"]],
  XETR: ["Xetra", ["XETR"]],
  XAMS: ["Euronext Amsterdam", ["EURONEXT", "XAMS"]],
  XLON: ["London Stock Exchange", ["LSE"]],
  XNAS: ["Nasdaq", ["NASDAQ"]],
  XNYS: ["NYSE", ["NYSE"]],
};
const TYPE = { Equity: "STOCK", ETF: "ETF", Cryptocurrency: "ETN" };

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function codeKey(value) {
  return normalize(value).toUpperCase().replace(/[\s._/-]+/g, "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// place -> code -> ISINs
function isinIndex() {
  const index = new Map();
  for (const file of ASSETS) {
    const table = parseCsv(fs.readFileSync(file, "utf8"));
    if (table[0]?.slice(0, 3).join(",") !== "ticker,exchange,isin") throw new Error(`${file.pathname} header changed`);
    for (const line of table.slice(1)) {
      const place = normalize(line[1]).toUpperCase();
      const code = codeKey(normalize(line[0]).split(":").pop());
      const isin = normalize(line[2]).toUpperCase();
      if (!code || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
      if (!index.has(place)) index.set(place, new Map());
      const book = index.get(place);
      if (!book.has(code)) book.set(code, new Set());
      book.get(code).add(isin);
    }
  }
  return index;
}

async function page(number) {
  const response = await fetch(SOURCE, {
    method: "POST",
    headers: { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/json", Origin: "https://www.portu.cz" },
    body: JSON.stringify({ Locale: "cs", Page: number, PageSize: PAGE, Product: BROKERAGE }),
  });
  if (!response.ok) throw new Error(`${SOURCE} page ${number} answered ${response.status}`);
  return response.json();
}

const items = new Map();
let total = Infinity;
for (let number = 1; items.size < total && number < 50; number += 1) {
  const data = await page(number);
  total = Number(data.Count);
  if (!Number.isInteger(total) || total < 1) throw new Error(`count is ${data.Count}`);
  if (!data.Items?.length) break;
  for (const item of data.Items) items.set(item.Id, item);
}
if (items.size !== total) throw new Error(`the list announced ${total} and returned ${items.size}`);
if (total < FLOOR) throw new Error(`${total} instruments, expected at least ${FLOOR}`);

const index = isinIndex();
const rows = [];
const unknown = [];
const tally = { one: 0, several: 0, none: 0 };
for (const item of items.values()) {
  if (item.AllowInPortuBrokerage !== true) continue;
  const mic = normalize(item.Exchange?.Mic).toUpperCase();
  const place = PLACE[mic];
  const type = TYPE[item.PrimaryAssetClassCode];
  const bloomberg = normalize(item.BloombergTicker);
  const code = bloomberg.split(" ")[0];
  if (!place || !type || !code) { unknown.push(`${bloomberg} ${mic} ${item.PrimaryAssetClassCode}`); continue; }
  const ticker = code.replace(/\//g, ".");
  const currency = normalize(item.Currency).toUpperCase();
  const name = normalize(item.Name) || ticker;
  const row = { query: ticker, ticker, name, exchange: place[0], mic, currency, type, isin: "", raw: [bloomberg, name, item.Exchange?.ShortName, mic, currency, item.PrimaryAssetClassCode].filter(Boolean).join(" ") };

  const groups = new Map();
  for (const file of place[1]) {
    const ids = index.get(file)?.get(codeKey(code));
    if (ids?.size) groups.set(file, ids);
  }
  const found = new Set([...groups.values()].flatMap((ids) => [...ids]));
  if (found.size === 1) { row.isin = [...found][0]; tally.one += 1; }
  else if (found.size > 1) { stampIsinMatches(row, groups, code); tally.several += 1; }
  else tally.none += 1;
  rows.push(row);
}
if (unknown.length) throw new Error(`unmapped line: ${unknown.join(", ")}`);

const unique = new Map();
for (const row of rows) unique.set(`${row.mic}|${row.ticker}|${row.currency}`, row);
const sorted = [...unique.values()].sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker));

fs.writeFileSync(new URL("portu-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(sorted)), null, 2));
const counts = {};
for (const row of sorted) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
console.error(`${sorted.length} rows of ${total} listed. ISIN ${tally.one}, several ${tally.several}, none ${tally.none}.`);
