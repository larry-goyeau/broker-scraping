// What Thien Viet Securities (TVS) sells in shares and exchange-traded
// funds, with no login. (TVS is not Tan Viet, TVSI, in ../tvsi.) The TVS
// public price board (banggia.tvs.vn) runs on a VPS-style datafeed on the
// same host. Its master file, getlistallstock, is the book: one line per
// security with its code, its name and its floor (post_to HOSE, HNX or
// UPCOM). The file prints no security type, so the code tells:
//   - a three-character code is a share;
//   - E1VFVN30 and the FUE… codes are exchange-traded funds ("Quỹ ETF …");
//     the FUC… codes are closed-end fund certificates, another product,
//     and are not written;
//   - C + three letters + four digits ("Chứng quyền …") is a covered
//     warrant, not written;
//   - the nine-character HNX codes with no name (41…, GB…) are futures,
//     and every other longer code ("Trái phiếu …", bank and company
//     bonds) is a bond; neither is written.
// A code of any other shape stops the run.
// The master file keeps expired and delisted codes, so every kept code is
// asked of the board's quote feed (getliststockdata): a code the feed does
// not return, or returns with no reference price, has no session today and
// is not written. The feed's market code (10 HOSE, 02 HNX, 03/04 UPCOM)
// must agree with the master file's floor. The board prints no ISIN; the
// Vietnamese number is built from the ticker. The host often resets
// connections, so every call is retried. The shared rules are in
// ../vix/vnboard.mjs.
//
//   https://banggia.tvs.vn/
//   https://banggia.tvs.vn/getlistallstock
//   https://banggia.tvs.vn/getliststockdata/FPT,VNM
//
//   node brokers/tvs/tvs_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { boardOf, clean, finish, fundType, isClosedEnd, mapLimit, pause, request, tally } from "../vix/vnboard.mjs";

const FEED = "https://banggia.tvs.vn";
const CHUNK = 80;
const TRIES = 10;
const HEADERS = { Referer: `${FEED}/`, Origin: FEED };

// The host drops many connections mid-answer, so a cut or unreadable body
// is retried like a failed call.
async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    try {
      const response = await request(url, { headers: HEADERS }, 1);
      const text = await response.text();
      return JSON.parse(text);
    } catch (error) {
      last = String(error.message || error);
    }
    await pause(600 * (attempt + 1));
  }
  throw new Error(`${url}: ${last}`);
}

function kindOf(ticker, name, exchange) {
  if (/^[A-Z0-9]{3}$/.test(ticker)) return isClosedEnd(name, ticker) ? "closed-end funds" : "STOCK";
  if (/^(FU[A-Z0-9]{6}|E1VFVN30)$/.test(ticker)) {
    if (/^FUE/.test(ticker) || ticker === "E1VFVN30") {
      if (!fundType(name)) throw new Error(`${ticker} is a fund code but not named an ETF: ${name}`);
      return "ETF";
    }
    if (/^FUC/.test(ticker) && isClosedEnd(name, ticker)) return "closed-end funds";
    throw new Error(`${ticker} is an unknown fund code: ${name}`);
  }
  if (/^C[A-Z]{3}\d{4}$/.test(ticker)) return "covered warrants";
  if (exchange === "HNX" && !name && /^(4\d[A-Z0-9]{7}|GB\d{2}[A-Z]\d{4})$/.test(ticker)) return "futures";
  if (/^[A-Z0-9]{8,10}$/.test(ticker) && (/^tr[áa]i phi[ếe]u/iu.test(name) || /\d{4,}/.test(ticker))) return "bonds";
  throw new Error(`${ticker} on ${exchange} has an unknown code shape: ${name}`);
}

const book = await getJson(`${FEED}/getlistallstock`);
if (!Array.isArray(book) || !book.length) throw new Error(`${FEED}/getlistallstock has no listings`);

const candidates = [];
const leftOut = new Map();
const seen = new Set();
for (const line of book) {
  const ticker = clean(line.stock_code).toUpperCase();
  const name = clean(line.name_vn) || clean(line.name_en);
  const exchange = boardOf(line.post_to);
  if (!ticker) throw new Error(`a line has no code: ${JSON.stringify(line).slice(0, 120)}`);
  if (!exchange) throw new Error(`${ticker} is on ${clean(line.post_to) || "no floor"}`);
  if (seen.has(ticker)) throw new Error(`${ticker} repeats in the master file`);
  seen.add(ticker);
  const kind = kindOf(ticker, name, exchange);
  if (kind !== "STOCK" && kind !== "ETF") {
    tally(leftOut, kind);
    continue;
  }
  candidates.push({ ticker, name, exchange, type: kind });
}

const quoted = new Map();
const chunks = [];
for (let start = 0; start < candidates.length; start += CHUNK) chunks.push(candidates.slice(start, start + CHUNK).map((line) => line.ticker));
await mapLimit(chunks, 3, async (chunk) => {
  const quotes = await getJson(`${FEED}/getliststockdata/${chunk.join(",")}`);
  if (!Array.isArray(quotes)) throw new Error(`no quotes for ${chunk[0]}…`);
  for (const quote of quotes) {
    const code = clean(quote.sym).toUpperCase();
    if (chunk.includes(code)) quoted.set(code, quote);
  }
  await pause(150);
});
if (quoted.size < candidates.length / 2) throw new Error(`only ${quoted.size} of ${candidates.length} codes were quoted`);

const lines = [];
let noSession = 0;
for (const line of candidates) {
  const quote = quoted.get(line.ticker);
  if (!quote || !(Number(quote.r) > 0)) {
    noSession += 1;
    continue;
  }
  const board = boardOf(quote.mc);
  if (board !== line.exchange) throw new Error(`${line.ticker} is ${line.exchange} in the master file but market ${quote.mc} in the quote feed`);
  lines.push(line);
}
if (noSession) tally(leftOut, "names with no session today", noSession);

const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("tvs-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
