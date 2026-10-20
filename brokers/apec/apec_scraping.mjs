// What APEC Securities sells in shares and exchange-traded funds, with no
// login. APEC's own web price board (trading.apec.com.vn) reads its
// symbol list from board-api.apec.com.vn: getlistallstock gives each code
// with its floor (post_to: HOSE, HNX, UPCOM) and a type: S a share, E an
// ETF, M a closed-end fund, W a covered warrant, B a bond. Shares and ETFs
// are kept; closed-end funds, covered warrants and bonds are other products
// and are not written.
//
// The list is APEC's master file and still carries about 115 codes that
// left the market (BBC, SVI, FLC and the like); nothing on APEC's board
// tells them apart, as the board keeps a price band and a status line for
// them too. Two more reads settle each code:
//   - listed or delisted: VNDirect's public securities file
//     (api-finfo.vndirect.com.vn/v4/stocks, status:listed), which drops a
//     code on its delisting date. A code it does not list on HOSE, HNX or
//     UPCOM is no longer listed and is not written.
//   - suspended: APEC's own MDAProxy/getAllStock carries each code's KRX
//     status from the exchange feed. A trading sanction "SUS" (trading
//     suspended) is not written. "TFR" comes with a restricted (RES, C&R)
//     admin status: restricted names still trade and are kept, as are
//     warned (WFR, WID, WOV) and controlled (CTR) names.
// The board prints no ISIN; the Vietnamese number is built from the
// ticker. The shared rules are in ../vix/vnboard.mjs.
//
//   https://trading.apec.com.vn/
//   https://board-api.apec.com.vn/getlistallstock
//   https://board-api.apec.com.vn/MDAProxy/getAllStock
//   https://api-finfo.vndirect.com.vn/v4/stocks?q=status:listed~floor:HOSE,HNX,UPCOM&size=
//
//   node brokers/apec/apec_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { boardOf, clean, finish, getJson, pause, tally } from "../vix/vnboard.mjs";

const API = "https://board-api.apec.com.vn";
const HEADERS = { Origin: "https://trading.apec.com.vn", Referer: "https://trading.apec.com.vn/" };
const LISTED = "https://api-finfo.vndirect.com.vn/v4/stocks?q=status:listed~floor:HOSE,HNX,UPCOM&size=";
const OTHER = { M: "closed-end funds", W: "covered warrants", B: "bonds" };
const KEPT = { S: "STOCK", E: "ETF" };

async function call(path) {
  const body = await getJson(`${API}${path}`, { headers: HEADERS });
  await pause(300);
  return body;
}

const master = await call("/getlistallstock");
if (!Array.isArray(master) || master.length < 2000) throw new Error(`getlistallstock has ${master?.length ?? "no"} lines`);

const status = new Map();
for (const line of await call("/MDAProxy/getAllStock")) status.set(clean(line.symbol).toUpperCase(), line);
if (status.size < 2000) throw new Error(`getAllStock has ${status.size} lines`);

// One response the size of the file, or a page repeats rows.
const expected = Number((await getJson(`${LISTED}1`)).totalElements);
const file = (await getJson(`${LISTED}${expected}`)).data;
if (!(expected > 1400) || !Array.isArray(file) || file.length !== expected) {
  throw new Error(`the listed file has ${file?.length ?? "no"} rows, not ${expected}`);
}
const listed = new Set(file.map((line) => clean(line.code).toUpperCase()));

const lines = [];
const leftOut = new Map();
for (const item of master) {
  const ticker = clean(item.stock_code).toUpperCase();
  const kind = clean(item.type).toUpperCase();
  const name = clean(item.name_vn) || clean(item.name_short) || clean(item.name_en);
  if (OTHER[kind]) {
    tally(leftOut, OTHER[kind]);
    continue;
  }
  if (!KEPT[kind]) throw new Error(`${ticker} has type ${kind || "none"}`);
  const exchange = boardOf(item.post_to);
  if (!exchange) throw new Error(`${ticker} is on ${item.post_to || "no floor"}`);
  if (!listed.has(ticker)) {
    tally(leftOut, "delisted names");
    continue;
  }
  if (clean(status.get(ticker)?.symbolTradingSanctionStatusCode).toUpperCase() === "SUS") {
    tally(leftOut, "suspended lines");
    continue;
  }
  lines.push({ ticker, name, exchange, type: KEPT[kind] });
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
for (const gone of ["BBC", "SVI", "FLC"]) {
  if (rows.some((row) => row.ticker === gone)) throw new Error(`${gone} left the market and was kept`);
}
fs.writeFileSync(new URL("apec-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
