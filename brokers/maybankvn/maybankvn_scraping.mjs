// What Maybank Securities Vietnam sells in shares and exchange-traded
// funds, with no login. The broker's price board (an Innotech board) loads
// its symbol list from one script, AutoComplete.ashx, that the board page
// names; that list is the book. Each line is "code | name | floor | type":
// S is a share, E an ETF, U a closed-end fund certificate, W a covered
// warrant, D a bond, F a future. Shares and ETFs on HOSE, HNX and UPCOM are
// kept; the rest are other products and are not written. The list prints
// no ISIN; the Vietnamese number is built from the ticker. The shared rules
// are in ../vix/vnboard.mjs.
//
//   https://priceboard.maybank-kimeng.com.vn/
//   https://priceboard.maybank-kimeng.com.vn/AutoComplete.ashx?version=…&lid=vi-vn
//
//   node brokers/maybankvn/maybankvn_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { boardOf, clean, finish, request, tally } from "../vix/vnboard.mjs";

const BOARD = "https://priceboard.maybank-kimeng.com.vn/";
const KEPT = { S: "STOCK", E: "ETF" };
const LEFT_OUT = { U: "closed-end funds", W: "covered warrants", D: "bonds", F: "futures" };

const page = await (await request(BOARD, { headers: { Accept: "text/html" } })).text();
const path = /["'](\/AutoComplete\.ashx\?[^"']+)["']/.exec(page)?.[1];
if (!path) throw new Error(`${BOARD} names no AutoComplete.ashx`);
const url = new URL(path.replace(/&amp;/g, "&"), BOARD).href;
const script = await (await request(url, { headers: { Accept: "*/*", Referer: BOARD } })).text();
const array = /var\s+acStockArray\s*=\s*(\[[\s\S]*?\]);/.exec(script)?.[1];
if (!array) throw new Error(`${url} has no acStockArray`);
const list = JSON.parse(array);
if (!Array.isArray(list) || !list.length) throw new Error(`${url} has no listings`);

const leftOut = new Map();
const lines = [];
for (const item of list) {
  const parts = String(item).split("|").map(clean);
  if (parts.length !== 4) throw new Error(`unreadable line ${JSON.stringify(item)}`);
  const [ticker, name, floor, kind] = parts;
  if (LEFT_OUT[kind]) {
    tally(leftOut, LEFT_OUT[kind]);
    continue;
  }
  const type = KEPT[kind];
  if (!type) throw new Error(`${ticker} has type ${kind || "none"}`);
  const exchange = boardOf(floor);
  if (!exchange) throw new Error(`${ticker} is on ${floor || "no board"}`);
  lines.push({ ticker, name, exchange, type });
}

const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("maybankvn-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
