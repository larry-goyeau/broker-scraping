// What KB Securities Vietnam (KBSV) sells in shares and exchange-traded
// funds, with no login. The KBSV price board (KB Buddy) loads one search
// file and one code list per floor, and those are the book. The floor lists
// HOSE, HNX and UPCOM are the shares on each floor; the search file gives
// each code its name and a type (stock, fund, cw, bond, future). A fund
// named "Quỹ ETF" is an ETF; any other fund is a closed-end fund and is not
// written, nor are covered warrants, bonds and futures. The board prints no
// ISIN; the Vietnamese number is built from the ticker. The shared rules
// are in ../vix/vnboard.mjs.
//
//   https://kbbuddywts.kbsec.com.vn/
//   https://kbbuddywts.kbsec.com.vn/iis-server/investment/stock/search/data
//   https://kbbuddywts.kbsec.com.vn/iis-server/investment/index/HOSE/stocks   (HNX, UPCOM)
//
//   node brokers/kbsv/kbsv_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { BOARDS, boardOf, clean, finish, fundType, getJson, tally } from "../vix/vnboard.mjs";

const API = "https://kbbuddywts.kbsec.com.vn/iis-server/investment";
const OTHER = { fund: "closed-end funds", cw: "covered warrants", bond: "bonds", corpbond: "corporate bonds", future: "futures" };

const search = await getJson(`${API}/stock/search/data`);
if (!Array.isArray(search) || !search.length) throw new Error("the search file is empty");
const master = new Map(search.map((line) => [clean(line.symbol).toUpperCase(), line]));

const lines = [];
const leftOut = new Map();
for (const exchange of BOARDS) {
  const body = await getJson(`${API}/index/${exchange}/stocks`);
  if (!Array.isArray(body?.data) || !body.data.length) throw new Error(`${exchange} list is empty`);
  for (const raw of body.data) {
    const ticker = clean(raw).toUpperCase();
    const line = master.get(ticker);
    if (!line) throw new Error(`${ticker} on ${exchange} is not in the search file`);
    if (clean(line.type) !== "stock" || boardOf(line.exchange) !== exchange) {
      throw new Error(`${ticker} on ${exchange} is ${line.type} on ${line.exchange}`);
    }
    lines.push({ ticker, name: clean(line.name) || clean(line.nameEn), exchange, type: "STOCK" });
  }
}
for (const line of search) {
  const kind = clean(line.type);
  if (kind === "stock") continue;
  const name = clean(line.name) || clean(line.nameEn);
  if (kind === "fund" && fundType(name)) {
    lines.push({ ticker: line.symbol, name, exchange: boardOf(line.exchange), type: "ETF" });
  } else {
    tally(leftOut, OTHER[kind] || `${kind || "untyped"} lines`);
  }
}

const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("kbsv-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
