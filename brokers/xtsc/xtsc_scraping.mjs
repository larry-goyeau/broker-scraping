// What Xuan Thien Securities (XTSC) sells in shares and exchange-traded
// funds, with no login. XTSC's public price board (priceboard.xtsc.vn,
// the XTInvest app) reads its symbol list from banggia.xtsc.vn:
// MDAProxy/getAllStock gives each code with its floor (marketId STO HOSE,
// STX HNX, UPX UPCOM) and a group: ST a share, EF an ETF, MF a closed-end
// fund, EW a covered warrant. Shares and ETFs are kept; closed-end funds
// and covered warrants are other products and are not written. A share
// whose name is a "Quỹ" fund certificate would be a closed-end fund too.
//
// The list is XTSC's master file and still carries about 40 UPCOM codes
// that left the market in 2026 (DAN, LTG, VTS, BCG and the like). The
// board keeps a price band for them, and their empty order book looks like
// any quiet UPCOM name, so nothing on XTSC's side tells them apart.
// VNDirect's public securities file (api-finfo.vndirect.com.vn/v4/stocks,
// status:listed) drops a code on its delisting date: a code it does not
// list on HOSE, HNX or UPCOM is no longer listed and is not written.
//
// XTSC's board has no status field either, so a code under an exchange
// trading suspension looks like any other. The status is the exchange's
// own KRX trading sanction code, read from an independent public board
// that relays the exchange feed: APEC's MDAProxy/getAllStock
// (symbolTradingSanctionStatusCode). A code marked "SUS" (trading
// suspended) is not written. Restricted (TFR with an RES or C&R admin
// status) and warned or controlled names (WFR, WOV, WID, CTR) still trade
// and are kept. The FSS boards' datafeed (xpower.vixs.vn/datafeed/
// instruments, symbolStatusCode) carries the same codes; on 2026-10-21
// both marked the same 31 XTSC names. If the status file comes back short
// or without the sanction field, the run stops.
//
// The host often drops the connection in the middle of the 470 KB answer,
// so the read is retried with a short timeout until the whole JSON comes
// back. The board prints no ISIN; the Vietnamese number is built from the
// ticker. XTSC publishes its fees at https://xtsc.vn/bieu-phi. The shared
// rules are in ../vix/vnboard.mjs.
//
//   https://priceboard.xtsc.vn/
//   https://banggia.xtsc.vn/MDAProxy/getAllStock
//   https://api-finfo.vndirect.com.vn/v4/stocks?q=status:listed~floor:HOSE,HNX,UPCOM&size=
//   https://board-api.apec.com.vn/MDAProxy/getAllStock
//
//   node brokers/xtsc/xtsc_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { boardOf, clean, finish, getJson, isClosedEnd, pause, request, tally } from "../vix/vnboard.mjs";

const BOOK = "https://banggia.xtsc.vn/MDAProxy/getAllStock";
const LISTED = "https://api-finfo.vndirect.com.vn/v4/stocks?q=status:listed~floor:HOSE,HNX,UPCOM&size=";
const OTHER = { MF: "closed-end funds", EW: "covered warrants" };
const KEPT = { ST: "STOCK", EF: "ETF" };
const STATUS = "https://board-api.apec.com.vn/MDAProxy/getAllStock";
const STATUS_HEADERS = { Origin: "https://trading.apec.com.vn", Referer: "https://trading.apec.com.vn/" };

async function readBook() {
  let last = "";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const response = await request(BOOK, { headers: { Referer: "https://priceboard.xtsc.vn/" }, timeout: 30_000 }, 1);
      return JSON.parse(await response.text());
    } catch (error) {
      last = String(error.cause?.code || error.message || error);
    }
    await pause(1_000 * Math.min(attempt + 1, 5));
  }
  throw new Error(`${BOOK} never came back whole: ${last}`);
}

const book = await readBook();
if (!Array.isArray(book) || book.length < 1500) throw new Error(`getAllStock has ${book?.length ?? "no"} lines`);

// One response the size of the file, or a page repeats rows.
const expected = Number((await getJson(`${LISTED}1`)).totalElements);
const file = (await getJson(`${LISTED}${expected}`)).data;
if (!(expected > 1400) || !Array.isArray(file) || file.length !== expected) {
  throw new Error(`the listed file has ${file?.length ?? "no"} rows, not ${expected}`);
}
const listed = new Set(file.map((line) => clean(line.code).toUpperCase()));

// The exchange's trading sanction code for every code, from APEC's board.
const statusLines = await getJson(STATUS, { headers: STATUS_HEADERS });
if (!Array.isArray(statusLines) || statusLines.length < 2000) throw new Error(`the status file has ${statusLines?.length ?? "no"} lines`);
const sanctioned = statusLines.filter((line) => clean(line.symbolTradingSanctionStatusCode));
if (sanctioned.length < statusLines.length * 0.9) {
  throw new Error(`only ${sanctioned.length} of ${statusLines.length} status lines carry symbolTradingSanctionStatusCode`);
}
const suspended = new Set();
for (const line of statusLines) {
  if (clean(line.symbolTradingSanctionStatusCode).toUpperCase() === "SUS") suspended.add(clean(line.symbol).toUpperCase());
}
if (suspended.size > 300) throw new Error(`${suspended.size} codes marked SUS, the status file looks wrong`);

const lines = [];
const leftOut = new Map();
for (const item of book) {
  const ticker = clean(item.symbol).toUpperCase();
  const group = clean(item.securityGroupId).toUpperCase();
  const name = clean(item.symbolName) || clean(item.symbolEnglishName);
  if (OTHER[group]) {
    tally(leftOut, OTHER[group]);
    continue;
  }
  if (!KEPT[group]) throw new Error(`${ticker} has group ${group || "none"}`);
  const exchange = boardOf(item.marketId);
  if (!exchange) throw new Error(`${ticker} is on ${item.marketId || "no floor"}`);
  if (group === "ST" && isClosedEnd(name, ticker)) {
    tally(leftOut, "closed-end funds");
    continue;
  }
  if (!listed.has(ticker)) {
    tally(leftOut, "delisted names");
    continue;
  }
  if (suspended.has(ticker)) {
    tally(leftOut, "suspended lines");
    continue;
  }
  lines.push({ ticker, name, exchange, type: KEPT[group] });
}

const rows = finish(lines, leftOut);
for (const [ticker, exchange, type] of [
  ["VCB", "HOSE", "STOCK"],
  ["SHS", "HNX", "STOCK"],
  ["ACV", "UPCOM", "STOCK"],
  ["E1VFVN30", "HOSE", "ETF"],
]) {
  const hit = rows.find((row) => row.ticker === ticker);
  if (!hit || hit.exchange !== exchange || hit.type !== type) throw new Error(`${ticker} is not a ${exchange} ${type}`);
}
fs.writeFileSync(new URL("xtsc-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
