// What Thien Viet Securities (TVS) sells in shares and exchange-traded
// funds, with no login. The TVS price board (a VPS-style board) loads one
// stock file and then quotes. The stock file keeps names that have left
// the market, so the book is the stock file cut to the codes the quote
// feed still answers for; the quote's market code (10 HOSE, 02 HNX, 03 or
// 04 UPCOM) is the floor. The file has no type. Every share ticker is
// three characters; an eight-character code named "Quỹ ETF" is an ETF; FUC…
// codes are closed-end funds; C…#### codes are covered warrants; longer
// codes on HNX are bonds and futures. Only shares and ETFs are written.
// The board prints no ISIN; the Vietnamese number is built from the
// ticker. The shared rules are in ../vix/vnboard.mjs.
//
//   https://banggia.tvs.vn/
//   https://banggia.tvs.vn/getlistallstock
//   https://banggia.tvs.vn/getliststockdata/FPT,VNM
//
//   node brokers/tvs/tvs_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { boardOf, clean, finish, fundType, getJson, isClosedEnd, mapLimit, pause, tally } from "../vix/vnboard.mjs";

const HOST = "https://banggia.tvs.vn";
const CHUNK = 100;

function kindOf(ticker, name) {
  if (/^[A-Z0-9]{3}$/.test(ticker)) return "STOCK";
  if (/^C[A-Z0-9]{3}\d{4}$/.test(ticker)) return "covered warrants";
  if (isClosedEnd(name, ticker)) return "closed-end funds";
  if (/^(FUE|E1V)[A-Z0-9]{5}$/.test(ticker) && fundType(name)) return "ETF";
  return "bonds and futures";
}

const book = await getJson(`${HOST}/getlistallstock`);
if (!Array.isArray(book) || !book.length) throw new Error(`${HOST}/getlistallstock has no listings`);

const leftOut = new Map();
const wanted = new Map();
for (const line of book) {
  const ticker = clean(line.stock_code).toUpperCase();
  const name = clean(line.name_vn) || clean(line.name_en);
  const kind = kindOf(ticker, name);
  if (kind === "STOCK" || kind === "ETF") wanted.set(ticker, { ticker, name, type: kind, filed: boardOf(line.post_to) });
  else tally(leftOut, kind);
}

const market = new Map();
const codes = [...wanted.keys()];
const chunks = [];
for (let start = 0; start < codes.length; start += CHUNK) chunks.push(codes.slice(start, start + CHUNK));
await mapLimit(chunks, 4, async (chunk) => {
  const quotes = await getJson(`${HOST}/getliststockdata/${chunk.join(",")}`);
  if (!Array.isArray(quotes)) throw new Error(`no quotes for ${chunk[0]}…`);
  for (const quote of quotes) market.set(clean(quote.sym).toUpperCase(), clean(quote.mc));
  await pause(150);
});

const lines = [];
let moved = 0;
for (const line of wanted.values()) {
  if (!market.has(line.ticker)) {
    tally(leftOut, "names with no quote (delisted)");
    continue;
  }
  const exchange = boardOf(market.get(line.ticker));
  if (!exchange) throw new Error(`${line.ticker} has market code ${market.get(line.ticker)}`);
  if (exchange !== line.filed) moved += 1;
  lines.push({ ticker: line.ticker, name: line.name, exchange, type: line.type });
}
if (moved) console.error(`${moved} names are filed under another floor in the stock file; the quote's floor is kept.`);

const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("tvs-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
