// What Viet Dragon Securities (Rong Viet, VDSC) sells in shares and
// exchange-traded funds, with no login. LiveDragon, the broker's public
// price board, is the book:
//
//   autocompleteStock.jsp   every code the board takes in its search box,
//                           1,871 in October 2026 (shares, ETFs,
//                           closed-end funds and covered warrants), with
//                           no floor.
//   hsx/hsxInit.rv, hnx/hnxInit.rv, upcom/upcomInit.rv
//                           one board per floor; each code is on exactly
//                           one of them, which is its place.
//   hsx/hsxETFInit.rv       the HOSE fund board: "Quỹ ETF …" lines are
//                           ETFs, the FUC… lines are closed-end funds.
//
// An init call answers only inside the session that the root, all.rv and
// the floor page open, so those pages are read first and their cookies sent back.
// The board's firewall rejects a request with no browser language header.
//
// Kept: shares on HOSE, HNX and UPCOM and the HOSE ETFs. Left out: covered
// warrants (C + three letters + four digits), the closed-end fund
// certificates (FUCTVGF4, FUCTVGF5, FUCVREIT), which are other products.
// The board prints the exchange's admin status only for restricted names
// ("RES", "C&R"); restricted names still trade and are kept. Whether the
// exchange has suspended a name is not on the board: as in
// ../kbsvn/kbsvn_scraping.mjs it is the KRX trading sanction code on
// APEC's public relay of the exchange feed (MDAProxy/getAllStock); a code
// marked "SUS" is not written (31 names on 2026-10-21, the same 31 as
// KBSV's run). The board prints no ISIN; the Vietnamese number is built
// from the ticker (../vix/vnboard.mjs).
//
// Fees: https://www.vdsc.com.vn/ca-nhan/bieu-phi (vdsc_cost.mjs).
//
//   https://livedragon.vdsc.com.vn/general/autocompleteStock.jsp
//   https://livedragon.vdsc.com.vn/hsx/hsx.rv  (and hnx/hnx.rv, upcom/upcom.rv, hsx/hsxETF.rv)
//   https://board-api.apec.com.vn/MDAProxy/getAllStock
//
//   node brokers/vdsc/vdsc_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { UA, clean, finish, fundType, getJson, isClosedEnd, pause, request, tally } from "../vix/vnboard.mjs";

const HOST = "https://livedragon.vdsc.com.vn";
const BASE = { "User-Agent": UA, "Accept-Language": "vi,en;q=0.9" };
const AJAX = { Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest" };
const FLOORS = [
  ["HOSE", "hsx/hsx", "hsx/hsxInit"],
  ["HNX", "hnx/hnx", "hnx/hnxInit"],
  ["UPCOM", "upcom/upcom", "upcom/upcomInit"],
  ["ETF", "hsx/hsxETF", "hsx/hsxETFInit"],
];
const STATUS = "https://board-api.apec.com.vn/MDAProxy/getAllStock";
const STATUS_HEADERS = { Origin: "https://trading.apec.com.vn", Referer: "https://trading.apec.com.vn/" };
const WARRANT = /^C[A-Z]{3}\d{4}$/;

async function jsonText(response, url) {
  const text = (await response.text()).trim();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url} is not JSON: ${text.slice(0, 120)}`);
  }
}

// The board keeps its session in cookies: all.rv opens it, each floor page
// adds its own, and the init call answers only with all of them (without
// them the floor page itself answers 500).
const jar = new Map();
function keep(response) {
  for (const line of response.headers.getSetCookie?.() || []) {
    const pair = line.split(";")[0];
    const at = pair.indexOf("=");
    if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
  return response;
}
const cookies = () => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");

// The root answers 302 to all.rv and sets the first cookie on the way, so
// the redirect is not followed by fetch.
async function open(path) {
  const response = keep(await fetch(`${HOST}/${path}`, { redirect: "manual", headers: { ...BASE, Accept: "text/html,*/*", Cookie: cookies() } }));
  await response.text();
  if (response.status !== 200 && response.status !== 302) throw new Error(`${HOST}/${path} answered ${response.status}`);
}

async function board(page, init) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await opening();
    await open(`${page}.rv`);
    const url = `${HOST}/${init}.rv?groupId=&sectorId=`;
    const body = await jsonText(keep(await request(url, { headers: { ...BASE, ...AJAX, Cookie: cookies(), Referer: `${HOST}/${page}.rv` } })), url);
    if (body?.success && Array.isArray(body.stocks) && body.stocks.length) {
      if (!Array.isArray(body.names) || body.names.length !== body.stocks.length) throw new Error(`${url} changed shape`);
      return body;
    }
    last = `${url} answered ${JSON.stringify(body).slice(0, 120)}`;
    await pause(1500 * (attempt + 1));
  }
  throw new Error(last);
}

async function opening() {
  jar.clear();
  await open("");
  await open("all/all.rv");
}

await opening();
const searchUrl = `${HOST}/general/autocompleteStock.jsp`;
const search = await jsonText(await request(searchUrl, { headers: { ...BASE, ...AJAX, Cookie: cookies(), Referer: `${HOST}/all/all.rv` } }), searchUrl);
if (!Array.isArray(search) || search.length < 1700) throw new Error(`the search list has ${search?.length ?? "no"} codes`);
const codes = new Map(search.map((item) => [clean(item.id).toUpperCase(), clean(item.label)]));

const placeOf = new Map();
const nameOf = new Map();
const etfBoard = new Set();
const restricted = new Map();
for (const [floor, page, init] of FLOORS) {
  const body = await board(page, init);
  body.stocks.forEach(([symbol], index) => {
    const ticker = clean(symbol).toUpperCase();
    if (floor === "ETF") {
      etfBoard.add(ticker);
      return;
    }
    if (placeOf.has(ticker)) throw new Error(`${ticker} is on ${placeOf.get(ticker)} and ${floor}`);
    placeOf.set(ticker, floor);
    nameOf.set(ticker, clean(body.names[index]));
  });
  for (const [ticker, status] of Object.entries(body.listAdminStatus || {})) restricted.set(ticker, status);
  await pause(800);
}
const missing = [...codes.keys()].filter((ticker) => !placeOf.has(ticker));
if (missing.length) throw new Error(`${missing.length} searchable codes are on no floor board: ${missing.slice(0, 20).join(" ")}`);
const extra = [...placeOf.keys()].filter((ticker) => !codes.has(ticker));
if (extra.length > 20) throw new Error(`${extra.length} board codes are not in the search list`);

const suspended = new Set();
const statusLines = await getJson(STATUS, { headers: STATUS_HEADERS });
if (!Array.isArray(statusLines) || statusLines.length < 2000) throw new Error(`the status file has ${statusLines?.length ?? "no"} lines`);
for (const line of statusLines) {
  if (clean(line.symbolTradingSanctionStatusCode).toUpperCase() === "SUS") suspended.add(clean(line.symbol).toUpperCase());
}

const lines = [];
const leftOut = new Map();
for (const [ticker, exchange] of placeOf) {
  const name = nameOf.get(ticker) || clean(codes.get(ticker)).replace(/^[A-Z0-9]+ - /, "");
  if (WARRANT.test(ticker)) {
    tally(leftOut, "covered warrants");
    continue;
  }
  let type = "STOCK";
  if (etfBoard.has(ticker) || /^qu[ỹy]\s/iu.test(name)) {
    if (isClosedEnd(name, ticker) || !fundType(name)) {
      tally(leftOut, "closed-end funds");
      continue;
    }
    type = "ETF";
  }
  if (suspended.has(ticker)) {
    tally(leftOut, "suspended lines");
    continue;
  }
  lines.push({ ticker, name, exchange, type });
}

const rows = finish(lines, leftOut);
for (const [ticker, exchange, type] of [
  ["VCB", "HOSE", "STOCK"],
  ["SHS", "HNX", "STOCK"],
  ["ACV", "UPCOM", "STOCK"],
  ["VDS", "HOSE", "STOCK"],
  ["E1VFVN30", "HOSE", "ETF"],
  ["FUEVFVND", "HOSE", "ETF"],
]) {
  const hit = rows.find((row) => row.ticker === ticker);
  if (!hit || hit.exchange !== exchange || hit.type !== type) throw new Error(`${ticker} is not a ${exchange} ${type}`);
}
if (rows.some((row) => /^FUC/.test(row.ticker) || WARRANT.test(row.ticker))) throw new Error("a closed-end fund or a warrant was kept");
fs.writeFileSync(new URL("vdsc-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`${codes.size} searchable codes, ${restricted.size} restricted names kept, ${suspended.size} suspended codes on the exchange feed.`);
