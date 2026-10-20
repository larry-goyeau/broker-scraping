// What KB Securities Vietnam (KBSV) sells in shares and exchange-traded
// funds, with no login. The KB Buddy web trading price board loads every
// security from one public JSON call, and that list is the book. Each line
// names the floor (HOSE, HNX, UPCOM; XHNF is the derivatives market) and a
// type: stock, fund, cw (covered warrant), future, bond (government bonds
// on HNX) and corpbond (corporate bonds, no floor). Stocks are kept. A fund
// named "Quỹ ETF …" is an ETF and is kept; any other fund is a closed-end
// fund certificate (FUCTVGF4, FUCVREIT) and is left out, with the covered
// warrants, futures and bonds, which are other products. The list prints
// no ISIN; the Vietnamese number is built from the ticker. The shared
// rules are in ../vix/vnboard.mjs.
//
// The list holds only listed names, but it also carries names whose
// trading the exchange has suspended, and nothing KBSV publishes says
// which: neither the list nor the board's quote call (investment/stock/iss)
// has a status field. The status is the exchange's own KRX trading
// sanction code, read from an independent public board that relays the
// exchange feed: APEC's MDAProxy/getAllStock (symbolTradingSanctionStatusCode).
// A code marked "SUS" (trading suspended) is not written. "TFR" comes with
// a restricted admin status; restricted names still trade and are kept.
// The FSS boards' datafeed (e.g. xpower.vixs.vn/datafeed/instruments,
// symbolStatusCode) carries the same codes; on 2026-10-20 both marked the
// same 31 names.
//
//   https://kbbuddywts.kbsec.com.vn/
//   https://kbbuddywts.kbsec.com.vn/iis-server/investment/stock/search/data
//   https://board-api.apec.com.vn/MDAProxy/getAllStock
//
//   node brokers/kbsvn/kbsvn_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { boardOf, clean, finish, fundType, getJson, tally } from "../vix/vnboard.mjs";

const LIST = "https://kbbuddywts.kbsec.com.vn/iis-server/investment/stock/search/data";
const HEADERS = { Origin: "https://kbbuddywts.kbsec.com.vn", Referer: "https://kbbuddywts.kbsec.com.vn/" };
const OTHER = { cw: "covered warrants", future: "futures", bond: "bonds", corpbond: "corporate bonds" };
const STATUS = "https://board-api.apec.com.vn/MDAProxy/getAllStock";
const STATUS_HEADERS = { Origin: "https://trading.apec.com.vn", Referer: "https://trading.apec.com.vn/" };

const body = await getJson(LIST, { headers: HEADERS });
if (!Array.isArray(body) || body.length < 2000) throw new Error(`the list has ${body?.length ?? "no"} lines`);

const suspended = new Set();
const statusLines = await getJson(STATUS, { headers: STATUS_HEADERS });
if (!Array.isArray(statusLines) || statusLines.length < 2000) throw new Error(`the status file has ${statusLines?.length ?? "no"} lines`);
for (const line of statusLines) {
  if (clean(line.symbolTradingSanctionStatusCode).toUpperCase() === "SUS") suspended.add(clean(line.symbol).toUpperCase());
}

const lines = [];
const leftOut = new Map();
for (const item of body) {
  const ticker = clean(item.symbol).toUpperCase();
  const kind = clean(item.type).toLowerCase();
  const name = clean(item.name) || clean(item.nameEn);
  if (OTHER[kind]) {
    tally(leftOut, OTHER[kind]);
    continue;
  }
  const exchange = boardOf(item.exchange);
  if (!exchange) throw new Error(`${ticker} (${kind}) is on ${item.exchange || "no floor"}`);
  if (kind !== "stock" && kind !== "fund") throw new Error(`${ticker} has type ${kind || "none"}`);
  const type = kind === "stock" ? "STOCK" : fundType(name);
  if (!type) tally(leftOut, "closed-end funds");
  else if (suspended.has(ticker)) tally(leftOut, "suspended lines");
  else lines.push({ ticker, name, exchange, type });
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
if (rows.some((row) => /^FUC/.test(row.ticker))) throw new Error("a closed-end fund was kept");
fs.writeFileSync(new URL("kbsvn-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
