// What AIS Securities sells in shares and exchange-traded funds, with no
// login. The AIS price board runs on a VPS-style datafeed. Its floor lists
// are the book: hose, hnx and upcom are the shares on each floor, hsx_e the
// ETFs on HOSE. The stock file gives each code its name and a type (S share,
// E fund) and must agree with the lists. Covered warrants, bonds and
// closed-end funds are on other lists and are not written. The quote feed
// on the same host prints the ISIN as symCode. The shared rules are in
// ../vix/vnboard.mjs.
//
//   https://banggia.aisec.com.vn/
//   https://datafeedapi.aisec.com.vn/getlistallstock
//   https://datafeedapi.aisec.com.vn/getlistckindex/hose   (hnx, upcom, hsx_e)
//   https://datafeedapi.aisec.com.vn/getliststockdata/FPT,VNM
//
//   node brokers/ais/ais_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { clean, finish, getJson, mapLimit, pause, tally } from "../vix/vnboard.mjs";

const FEED = "https://datafeedapi.aisec.com.vn";
const LISTS = [
  ["hose", "HOSE", "STOCK", "S"],
  ["hnx", "HNX", "STOCK", "S"],
  ["upcom", "UPCOM", "STOCK", "S"],
  ["hsx_e", "HOSE", "ETF", "E"],
];
const CHUNK = 80;

const book = await getJson(`${FEED}/getlistallstock`);
if (!Array.isArray(book) || !book.length) throw new Error(`${FEED}/getlistallstock has no listings`);
const master = new Map(book.map((line) => [clean(line.stock_code).toUpperCase(), line]));

const lines = [];
const leftOut = new Map();
for (const [path, exchange, type, kind] of LISTS) {
  const codes = await getJson(`${FEED}/getlistckindex/${path}`);
  if (!Array.isArray(codes) || !codes.length) throw new Error(`${path} list is empty`);
  for (const raw of codes) {
    const ticker = clean(raw).toUpperCase();
    const line = master.get(ticker);
    if (!line) throw new Error(`${ticker} on ${path} is not in the stock file`);
    if (clean(line.type).toUpperCase() !== kind) throw new Error(`${ticker} on ${path} has type ${line.type}`);
    lines.push({ ticker, name: clean(line.name_vn) || clean(line.name_en), exchange, type });
  }
}
for (const line of book) {
  const label = { W: "covered warrants", T: "bonds", R: "bonds", D: "bonds" }[clean(line.type).toUpperCase()];
  if (label) tally(leftOut, label);
}

const isin = new Map();
const codes = lines.map((line) => line.ticker);
const chunks = [];
for (let start = 0; start < codes.length; start += CHUNK) chunks.push(codes.slice(start, start + CHUNK));
await mapLimit(chunks, 4, async (chunk) => {
  const quotes = await getJson(`${FEED}/getliststockdata/${chunk.join(",")}`);
  if (!Array.isArray(quotes)) throw new Error(`no quotes for ${chunk[0]}…`);
  for (const quote of quotes) {
    const code = clean(quote.sym).toUpperCase();
    const number = clean(quote.symCode).toUpperCase();
    if (chunk.includes(code) && /^VN[A-Z0-9]{9}\d$/.test(number)) isin.set(code, number);
  }
  await pause(150);
});
const missing = codes.filter((code) => !isin.has(code));
if (missing.length) throw new Error(`no ISIN for ${missing.slice(0, 10).join(", ")}`);
for (const line of lines) line.isin = isin.get(line.ticker);

const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("ais-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
