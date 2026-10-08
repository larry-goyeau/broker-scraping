// Rabee Securities sells every share listed on the Iraq Stock Exchange.
// The app says so, and the research table is that book, split by board.
// Regular, second and undisclosed are listed. The OTC platform is not a
// listing and is not written. Iraqi government bonds are another product
// and are not in these files. The exchange lists no ETF.
//
// The research table has no ISIN and lags a new listing. The exchange's
// instrument file prints the ISIN. A share stays when that file still
// carries it. A research row the instrument file has dropped is not
// written. A new listing the research table has not classified yet stays.
//
//   https://rs.iq/services/brokerage-services/
//   https://appapi.rs.iq/api/SiteStock/StocksList
//   https://ir.feedgfm.com/isx/ibe/?UNC=0&M=1&H=1&UID=IRPORTAL&SID=IRPORTAL&UE=ISX&L=EN&RT=303&SRC=ISX&AS=1
//
//   node brokers/rabee/rabee_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import dns from "node:dns";
import fs from "node:fs";

dns.setDefaultResultOrder("ipv4first");

const RESEARCH = "https://appapi.rs.iq/api/SiteStock/StocksList";
const BOOK = "https://ir.feedgfm.com/isx/ibe/?UNC=0&M=1&H=1&UID=IRPORTAL&SID=IRPORTAL&UE=ISX&L=EN&RT=303&SRC=ISX&AS=1";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const LISTED = new Set(["ISX-REGULAR", "ISX-SECOND", "UNDISCLOSED"]);
const KNOWN = new Set([...LISTED, "ISX-OTC"]);

async function getText(url, headers) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", ...headers },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function cells(line, width) {
  const parts = String(line || "").split("|");
  if (parts.length < width) throw new Error("a short instrument row");
  return parts;
}

const researchText = await getText(RESEARCH, {
  "rb-lang": "1",
  Origin: "https://rs.iq",
  Referer: "https://rs.iq/analysis/isx-listed-companies/",
});
const research = JSON.parse(researchText);
if (!Array.isArray(research) || research.length < 100) throw new Error(`${RESEARCH} has no book`);

const board = new Map();
for (const line of research) {
  const ticker = String(line.StockCode || "").trim().toUpperCase();
  const name = String(line.StockNameEnglish || line.StockName || "").replace(/\s+/g, " ").trim();
  const market = String(line.MarketType || "").trim().toUpperCase();
  if (!ticker || !name) throw new Error("a research row has no ticker or name");
  if (!KNOWN.has(market)) throw new Error(`${ticker} is on ${market || "no board"}`);
  if (board.has(ticker)) throw new Error(`repeated ${ticker}`);
  board.set(ticker, { name, market });
}

const bookText = await getText(BOOK);
const book = JSON.parse(bookText);
const header = String(book?.HED?.TD || "").split("|");
const column = Object.fromEntries(header.map((name, index) => [name, index]));
for (const name of ["SYMBOL", "SYMBOL_DESCRIPTION", "INSTRUMENT_TYPE", "CURRENCY", "EXCHANGE", "ISIN_CODE"]) {
  if (column[name] === undefined) throw new Error(`${BOOK} has no ${name}`);
}
const lines = book?.DAT?.TD;
if (!Array.isArray(lines) || lines.length < 90) throw new Error(`${BOOK} has no instruments`);

const rows = [];
const seen = new Set();
const leftOut = new Map();
function skip(label) {
  leftOut.set(label, (leftOut.get(label) || 0) + 1);
}

for (const line of lines) {
  const field = cells(line, header.length);
  const ticker = field[column.SYMBOL].trim().toUpperCase();
  const name = field[column.SYMBOL_DESCRIPTION].replace(/\s+/g, " ").trim();
  const kind = field[column.INSTRUMENT_TYPE].trim();
  const currency = field[column.CURRENCY].trim().toUpperCase();
  const exchange = field[column.EXCHANGE].trim().toUpperCase();
  const isin = field[column.ISIN_CODE].trim().toUpperCase();
  if (!ticker || !name) throw new Error("an instrument has no ticker or name");
  if (kind !== "0") throw new Error(`${ticker} is type ${kind || "unmarked"}`);
  if (exchange !== "ISX") throw new Error(`${ticker} is on ${exchange || "no exchange"}`);
  if (currency !== "IQD") throw new Error(`${ticker} is quoted ${currency || "nowhere"}`);
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`no ISIN for ${ticker}`);
  const known = board.get(ticker);
  if (known?.market === "ISX-OTC") {
    skip("OTC");
    continue;
  }
  if (seen.has(ticker) || seen.has(isin)) throw new Error(`repeated ${ticker} ${isin}`);
  seen.add(ticker);
  seen.add(isin);
  rows.push({
    query: ticker,
    ticker,
    name: known?.name || name,
    exchange: "ISX",
    currency: "IQD",
    type: "STOCK",
    isin,
    raw: [ticker, known?.name || name, "ISX", isin, "STOCK"].join(" "),
  });
}

for (const [ticker, known] of board) {
  if (!LISTED.has(known.market) || seen.has(ticker)) continue;
  skip("off the instrument file");
}

if (rows.length < 90) throw new Error(`only ${rows.length} ISX shares`);
for (const ticker of ["TASC", "BBOB", "IBSD", "AISP"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
}
const asiacell = rows.find((row) => row.ticker === "TASC");
if (asiacell.isin !== "IQ000A1J4EL6") throw new Error(`TASC is ${asiacell.isin}`);

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("rabee-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const skipped = [...leftOut].map(([kind, count]) => `${count} ${kind}`).join(", ");
console.error(`${rows.length} listings (ISX STOCK). Left out: ${skipped || "none"}.`);
