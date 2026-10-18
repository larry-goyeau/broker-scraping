// What An Binh Securities (ABS) sells in shares and exchange-traded funds,
// with no login. The ABS Invest price board is the book. Its exchange tabs
// are watch lists: VNINDEX is every HOSE share, HNX every HNX share, UPCOM
// every UPCOM share. ETFs have no tab of their own; they are on the HOSE
// put-through list ("Thoả thuận HOSE") as fund lines (secType 008), next to
// the shares. A fund named "Quỹ ETF" is an ETF; the closed-end and open-end
// funds on that list are not written, nor are covered warrants. The API
// wants the web app's fixed client headers (X-Sec-AS and an HMAC of the
// app's public key pair), which the board sends to every visitor. The
// board prints no ISIN; the Vietnamese number is built from the ticker.
// The shared rules are in ../vix/vnboard.mjs.
//
//   https://invest.abs.vn/priceboard
//   https://api.pro.abs.vn/v1/stock/category/summary/recommend-by-index/
//   https://api.pro.abs.vn/v1/stock/category/summary/recommend-by-index/1
//
//   node brokers/abs/abs_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { boardOf, clean, finish, fundType, getJson, tally } from "../vix/vnboard.mjs";

const API = "https://api.pro.abs.vn/v1/stock/category/summary/recommend-by-index/";
const HEADERS = {
  "Content-Type": "application/json",
  Origin: "https://invest.abs.vn",
  Referer: "https://invest.abs.vn/",
  "X-Sec-AS": "AbsWeb",
  "X-Sec-Identity": crypto.createHmac("sha256", "AbsWebKey").update("AbsWebSecret").digest("base64"),
  "x-device-id": crypto.randomUUID(),
};
const TABS = { VNINDEX: "HOSE", HNX: "HNX", UPCOM: "UPCOM" };
const PUT_THROUGH_HOSE = "Thoả thuận HOSE";

async function list(id) {
  const body = await getJson(`${API}${id}`, { headers: { ...HEADERS, "x-request-id": crypto.randomUUID() } });
  const items = body?.data?.detailLst;
  if (!Array.isArray(items) || !items.length) throw new Error(`watch list ${id} is empty`);
  if (Number(body.data.totalRecord) !== items.length) throw new Error(`watch list ${id} sent ${items.length} of ${body.data.totalRecord}`);
  return items;
}

const summary = await getJson(API, { headers: { ...HEADERS, "x-request-id": crypto.randomUUID() } });
if (!Array.isArray(summary?.data)) throw new Error("no watch lists");
const idOf = (name) => {
  const hit = summary.data.find((item) => clean(item.watchListName).normalize("NFC") === name.normalize("NFC"));
  if (!hit) throw new Error(`no watch list named ${name}`);
  return hit.watchListId;
};

const lines = [];
const leftOut = new Map();
for (const [tab, exchange] of Object.entries(TABS)) {
  for (const item of await list(idOf(tab))) {
    const ticker = clean(item.code).toUpperCase();
    if (boardOf(item.floorCode) !== exchange) throw new Error(`${ticker} on ${tab} is floor ${item.floorCode}`);
    if (clean(item.secType) !== "001") throw new Error(`${ticker} on ${tab} is secType ${item.secType}`);
    lines.push({ ticker, name: clean(item.securityName), exchange, type: "STOCK" });
  }
}
for (const item of await list(idOf(PUT_THROUGH_HOSE))) {
  const kind = clean(item.secType);
  if (kind === "001") continue;
  const name = clean(item.securityName);
  if (kind === "008" && fundType(name)) lines.push({ ticker: item.code, name, exchange: boardOf(item.floorCode), type: "ETF" });
  else tally(leftOut, kind === "008" ? "other funds" : `secType ${kind} lines`);
}
tally(leftOut, "covered warrants", (await list(idOf("Chứng quyền"))).length);

const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("abs-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
