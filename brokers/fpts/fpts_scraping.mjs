// What FPT Securities (FPTS) sells in shares and exchange-traded funds,
// with no login. FPTS is a member of HOSE and HNX and trades every listed
// code. Its LivePrice board is the book. The board's own trading screen
// now asks for a login, but the public HNX PRO board on the same host
// (linked from fpts.com.vn) embeds the same code list, and the data calls
// behind both answer without a login:
//
//   Data.ashx, action=company_name   every code the board knows, with its
//                                    floor (Ex: HO HOSE, HA HNX, UP UPCOM)
//                                    and its name; 1,976 codes in October
//                                    2026. No security type is printed.
//   hsx/data.ashx?s=quote&l=All      the HOSE quote lines.
//   hnx/data.ashx?s=quote&l=<codes>  the HNX and UPCOM quote lines.
//
// The code shape and the name tell the type:
//   - a three-character code is a share (a "Quỹ" fund certificate would
//     be a closed-end fund; there is none today);
//   - E1VFVN30 and the FUE… codes are exchange-traded funds ("Quỹ ETF …");
//     the FUC… codes are closed-end fund certificates, another product,
//     and are not written;
//   - C + three letters + four digits ("Chứng quyền …") is a covered
//     warrant, not written;
//   - the nine-character HNX codes ("Trái phiếu …") are bonds, not written.
// A code of any other shape stops the run.
//
// Every kept code is asked of the quote feed. Each quote line carries the
// exchange's KRX status tags; tag 30637 is the trading sanction code. A
// code marked SUS (trading suspended) is not written: 31 names on
// 2026-10-23, the same 31 that the APEC relay marks for
// ../xtsc/xtsc_scraping.mjs and ../vdsc/vdsc_scraping.mjs. Restricted,
// warned or controlled names (RES, TFR, C&R, WFR, WOV, WID, CTR) still
// trade and are kept. A code with no quote line, no status tag or no
// reference price stops the run. The list carries no delisted code: on
// 2026-10-23 every share and ETF on it was on VNDirect's listed file.
//
// The board prints no ISIN; the Vietnamese number is built from the
// ticker. The shared rules are in ../vix/vnboard.mjs. Fees (brokerage
// table as images, exchange fee in text):
// https://www.fpts.com.vn/ho-tro-khach-hang/dich-vu-tai-chinh/bieu-phi-dich-vu/giao-dich-chung-khoan-co-so/
//
//   https://liveprice.fpts.com.vn/hnxpro
//   https://liveprice.fpts.com.vn/Data.ashx   (POST action=company_name)
//   https://liveprice.fpts.com.vn/hsx/data.ashx?s=quote&l=All
//   https://liveprice.fpts.com.vn/hnx/data.ashx?s=quote&l=SHS,ACV
//
//   node brokers/fpts/fpts_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { clean, finish, fundType, getJson, isClosedEnd, mapLimit, tally } from "../vix/vnboard.mjs";

const HOST = "https://liveprice.fpts.com.vn";
const HEADERS = { Referer: `${HOST}/hnxpro`, Origin: HOST };
const FLOOR = { HO: "HOSE", HA: "HNX", UP: "UPCOM" };
const CHUNK = 100;

const list = await getJson(`${HOST}/Data.ashx`, {
  method: "POST",
  body: "action=company_name",
  headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
});
if (!Array.isArray(list) || list.length < 1500) throw new Error(`company_name has ${list?.length ?? "no"} codes`);

const lines = [];
const leftOut = new Map();
for (const item of list) {
  const ticker = clean(item.stock_code).toUpperCase();
  // A few names come in decomposed Unicode.
  const name = clean(item.name).normalize("NFC");
  const exchange = FLOOR[clean(item.Ex).toUpperCase()];
  if (!ticker || !exchange) throw new Error(`unreadable code ${JSON.stringify(item).slice(0, 120)}`);
  if (/^[A-Z0-9]{3}$/.test(ticker)) {
    if (isClosedEnd(name, ticker)) tally(leftOut, "closed-end funds");
    else lines.push({ ticker, name, exchange, type: "STOCK" });
  } else if (/^(FU[A-Z0-9]{6}|E1VFVN30)$/.test(ticker)) {
    if (fundType(name)) lines.push({ ticker, name, exchange, type: "ETF" });
    else if (isClosedEnd(name, ticker)) tally(leftOut, "closed-end funds");
    else throw new Error(`${ticker} "${name}" is a fund of no known kind`);
  } else if (/^C[A-Z0-9]{3}\d{4}$/.test(ticker) && exchange === "HOSE") {
    tally(leftOut, "covered warrants");
  } else if (/^[A-Z0-9]{9}$/.test(ticker) && exchange === "HNX" && /trái phiếu|^[A-Z0-9]{9}$/iu.test(name)) {
    tally(leftOut, "bonds");
  } else throw new Error(`${ticker} on ${exchange} ("${name}") has an unknown code shape`);
}

// Quote line: Info is [[field, value], …]; field 0 is the ticker, field 1
// the reference price, and one field holds "…|30637:<sanction code>|…".
const quotes = new Map();
function readQuotes(body, url) {
  if (!Array.isArray(body)) throw new Error(`${url} is not a quote list`);
  for (const line of body) {
    const info = Object.fromEntries(Array.isArray(line?.Info) ? line.Info : []);
    const ticker = clean(info[0]).toUpperCase();
    if (!ticker) throw new Error(`${url} has a quote line with no ticker`);
    const sanction = Object.values(info).map((value) => /(?:^|\|)30637:([A-Z&]+)/.exec(String(value))?.[1]).find(Boolean);
    quotes.set(ticker, { reference: Number(info[1]), sanction });
  }
}
const allHose = `${HOST}/hsx/data.ashx?s=quote&l=All`;
readQuotes(await getJson(allHose, { headers: HEADERS }), allHose);
const rest = lines.filter((line) => line.exchange !== "HOSE").map((line) => line.ticker);
const chunks = [];
for (let at = 0; at < rest.length; at += CHUNK) chunks.push(rest.slice(at, at + CHUNK));
await mapLimit(chunks, 4, async (codes) => {
  const url = `${HOST}/hnx/data.ashx?s=quote&l=${codes.join(",")}`;
  readQuotes(await getJson(url, { headers: HEADERS }), url);
});

const kept = [];
let suspended = 0;
for (const line of lines) {
  const quote = quotes.get(line.ticker);
  if (!quote) throw new Error(`${line.exchange} ${line.ticker} has no quote line`);
  if (!quote.sanction) throw new Error(`${line.ticker} has no trading sanction tag`);
  if (!(quote.reference > 0)) throw new Error(`${line.ticker} has no reference price`);
  if (quote.sanction === "SUS") suspended += 1;
  else kept.push(line);
}
if (suspended > 300) throw new Error(`${suspended} codes marked SUS, the quote feed looks wrong`);
if (suspended) tally(leftOut, "suspended names", suspended);

const rows = finish(kept, leftOut);
for (const [ticker, exchange, type] of [
  ["FPT", "HOSE", "STOCK"],
  ["SHS", "HNX", "STOCK"],
  ["ACV", "UPCOM", "STOCK"],
  ["E1VFVN30", "HOSE", "ETF"],
]) {
  const hit = rows.find((row) => row.ticker === ticker);
  if (!hit || hit.exchange !== exchange || hit.type !== type) throw new Error(`${ticker} is not a ${exchange} ${type}`);
}
fs.writeFileSync(new URL("fpts-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
