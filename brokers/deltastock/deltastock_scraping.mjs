// What Deltastock sells as real shares and ETFs, with no login. The
// "Real Stocks" page says "1700+ stocks in leading companies listed on the
// NYSE and NASDAQ", bought in Delta Trading. Its "Real Stock List" fills
// one table from a single POST to getList.asp: symbol, a name and a type
// code (the page's own helper prints 5 as ETF and everything else as
// Stock). Type 1 is a share, 5 an ETF, 7 an ADR (the name printed is the
// depositary bank, so the company name is taken from the lists) and 8 a
// GDR. The whole book comes in one answer; nothing is paged.
//
// The list names no venue and no ISIN. Both come from ../../assets/stocks.csv
// and etfs.csv on NASDAQ, NYSE, AMEX and CBOE, matched on the ticker
// (BRK B -> BRK.B). AMEX in those lists is NYSE American for a share and
// NYSE Arca for a fund. One ISIN on that place is kept, several stay on
// `matches`. A ticker the lists do not file on a US exchange keeps
// exchange "US". Left out: the OEIC lines (AMZN/100 of the Global Single
// Stock ETF Umbrella, ITSW of ITS World ETF Fund, European-listed funds,
// not NYSE or Nasdaq lines) and the GDR (type 8, FIVE, X5's London
// receipt), which are not on the US exchanges the page sells.
//
//   https://www.deltastock.com/english/investments/stocks.asp
//   https://www.deltastock.com/english/investments/stocks-list.asp
//   https://www.deltastock.com/resources/stocks/functions/getList.asp
//
//   node brokers/deltastock/deltastock_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const LIST = "https://www.deltastock.com/resources/stocks/functions/getList.asp";
const REFERER = "https://www.deltastock.com/english/investments/stocks-list.asp";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);

// The page claims 1700+; a read well under that is an error.
const FLOOR = { total: 1500, STOCK: 1200, ETF: 200 };

// Type code -> what the line is. Anything else is a change of format.
const KIND = { 1: "STOCK", 5: "ETF", 7: "STOCK", 8: "GDR" };

// List place -> the row's exchange and MIC, for a share and for a fund.
const SHARE_PLACE = {
  NASDAQ: ["NASDAQ", "XNAS"],
  NYSE: ["NYSE", "XNYS"],
  AMEX: ["NYSE American", "XASE"],
  CBOE: ["Cboe BZX", "BATS"],
};
const FUND_PLACE = { ...SHARE_PLACE, AMEX: ["NYSE Arca", "ARCX"] };
const ORDER = ["NASDAQ", "NYSE", "AMEX", "CBOE"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getList() {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(LIST, {
        method: "POST",
        // The firewall answers 403 to a POST without the form content type.
        headers: {
          "User-Agent": UA,
          Accept: "*/*",
          Referer: REFERER,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "",
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`getList answered ${response.status}`);
      const body = await response.json();
      if (!body.success || !Array.isArray(body.data)) throw new Error("getList answer has no data array");
      return body.data;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * 2 ** attempt);
  }
  throw new Error(last);
}

// ticker -> place -> { isins, names }
function loadLists() {
  const index = new Map();
  for (const file of [STOCKS, ETFS]) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    if (!/^ticker,exchange,isin,name/i.test(lines[0])) throw new Error(`${file.pathname} header is ${lines[0]}`);
    for (const line of lines.slice(1)) {
      const [symbol, place, isin, ...rest] = line.split(",");
      if (!SHARE_PLACE[place]) continue;
      if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin || "")) continue;
      const code = String(symbol).split(":").pop().toUpperCase();
      if (!index.has(code)) index.set(code, new Map());
      const book = index.get(code);
      if (!book.has(place)) book.set(place, { isins: new Set(), names: [] });
      book.get(place).isins.add(isin);
      book.get(place).names.push(rest.join(",").trim().replace(/^"(.*)"$/, "$1").replace(/""/g, '"'));
    }
  }
  return index;
}

const items = await getList();
if (items.length < FLOOR.total) throw new Error(`getList returned ${items.length} lines`);

const lists = loadLists();
const rows = [];
const leftOut = [];
const tally = { one: 0, several: 0, none: 0 };

for (const item of items) {
  const symbol = String(item.Symbol || "").trim().toUpperCase();
  const printed = String(item.IssuerName || "").replace(/\s+/g, " ").trim();
  const kind = KIND[String(item.type)];
  if (!symbol) throw new Error(`line without a symbol: ${JSON.stringify(item)}`);
  if (!kind) throw new Error(`unknown type ${item.type} on ${symbol}`);
  // An OEIC line is a European-listed fund, not a US one.
  if (kind === "GDR" || symbol.includes("/") || /\bOEIC\b/i.test(printed)) {
    leftOut.push(`${symbol} (${printed})`);
    continue;
  }
  if (!/^[A-Z]{1,5}( [A-Z])?$/.test(symbol)) throw new Error(`unreadable symbol ${symbol}`);
  const ticker = symbol.replace(" ", ".");

  const book = lists.get(ticker) || new Map();
  const pick = ORDER.find((place) => book.has(place));
  const places = kind === "ETF" ? FUND_PLACE : SHARE_PLACE;
  const [exchange, mic] = pick ? places[pick] : ["US", ""];
  // An ADR line prints its depositary bank; the company is the list's name.
  const name = String(item.type) === "7" && pick ? book.get(pick).names[0] || printed : printed;

  const row = { query: ticker, ticker, name: name || ticker, exchange };
  if (mic) row.mic = mic;
  row.currency = "USD";
  row.type = kind;
  row.isin = "";
  row.raw = [symbol, printed, item.type, item.ID].filter(Boolean).join(" ");
  if (pick) {
    const ids = book.get(pick).isins;
    if (ids.size === 1) {
      row.isin = [...ids][0];
      tally.one += 1;
    } else {
      stampIsinMatches(row, new Map([[pick, ids]]), ticker);
      tally.several += 1;
    }
    row.query = row.isin || ticker;
  } else tally.none += 1;
  rows.push(row);
}

const unique = new Map();
for (const row of rows) {
  const key = `${row.exchange}|${row.ticker}`;
  if (unique.has(key)) throw new Error(`${key} listed twice`);
  unique.set(key, row);
}
const sorted = [...unique.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));

const byType = { STOCK: 0, ETF: 0 };
const byPlace = {};
for (const row of sorted) {
  byType[row.type] += 1;
  byPlace[row.exchange] = (byPlace[row.exchange] || 0) + 1;
}
if (byType.STOCK < FLOOR.STOCK) throw new Error(`only ${byType.STOCK} shares`);
if (byType.ETF < FLOOR.ETF) throw new Error(`only ${byType.ETF} ETFs`);
if ((byPlace.NASDAQ || 0) < 300 || (byPlace.NYSE || 0) < 300) throw new Error(`thin places ${JSON.stringify(byPlace)}`);

fs.writeFileSync(
  new URL("deltastock-parsed.json", import.meta.url),
  JSON.stringify(stampRows(withoutObligations(sorted)), null, 2)
);

console.error(
  `deltastock: ${sorted.length} rows (${byType.STOCK} STOCK, ${byType.ETF} ETF) ` +
    `${Object.entries(byPlace).map(([place, count]) => `${place} ${count}`).join(", ")}; ` +
    `ISIN ${tally.one}, several ${tally.several}, none ${tally.none}; left out ${leftOut.join(", ") || "none"}`
);
