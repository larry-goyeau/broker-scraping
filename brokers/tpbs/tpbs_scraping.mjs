// What Tien Phong Securities (TPBS) sells in shares and exchange-traded
// funds, with no login. The TPBS iTrade web price board loads every
// security from one public market-data call, and that list is the book.
// Each line names the market (STO HOSE, STX HNX, UPX UPCOM, HCX the bond
// floor), a security group (ST a share, EF an ETF, MF a closed-end fund, EW
// a covered warrant, BS a bond) and the ISIN. Shares and ETFs on HOSE, HNX
// and UPCOM are kept; closed-end funds, covered warrants and bonds are other
// products and are not written. A line with no price band (no reference,
// ceiling or floor price) has no session and is not written. The board
// homepage link (banggia.tpbs.com.vn) did not answer; the iTrade board is
// the broker's other public board on the same data.
// The shared rules are in ../vix/vnboard.mjs.
//
//   https://itrade.tpbs.com.vn/price-board
//   https://cpmdds.tpbs.com.vn/market-data/api/v1/stock/info
//
//   node brokers/tpbs/tpbs_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { boardOf, clean, finish, getJson, tally } from "../vix/vnboard.mjs";

const URL_INFO = "https://cpmdds.tpbs.com.vn/market-data/api/v1/stock/info";
const HEADERS = { Origin: "https://itrade.tpbs.com.vn", Referer: "https://itrade.tpbs.com.vn/" };
const OTHER = { MF: "closed-end funds", EW: "covered warrants", BS: "bonds" };

const body = await getJson(URL_INFO, { headers: HEADERS });
if (!Array.isArray(body?.data) || !body.data.length) throw new Error(`${URL_INFO} has no listings`);

const lines = [];
const leftOut = new Map();
for (const line of body.data) {
  const ticker = clean(line.ticker_code).toUpperCase();
  const group = clean(line.security_group_id).toUpperCase();
  const market = clean(line.market_id).toUpperCase();
  if (OTHER[group]) {
    tally(leftOut, OTHER[group]);
    continue;
  }
  if (group !== "ST" && group !== "EF") throw new Error(`${ticker} has security group ${group || "none"}`);
  const exchange = boardOf(market);
  if (!exchange) throw new Error(`${ticker} is on market ${market || "none"}`);
  if (!(Number(line.reference_price) > 0 && Number(line.ceiling_price) > 0 && Number(line.floor_price) > 0)) {
    tally(leftOut, "lines with no price band");
    continue;
  }
  const isin = clean(line.symbol).toUpperCase();
  if (!/^VN[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`${ticker} has ISIN ${isin || "none"}`);
  const name = clean(line.symbol_name) || clean(line.symbol_english_name);
  lines.push({ ticker, name, exchange, type: group === "EF" ? "ETF" : "STOCK", isin });
}

const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("tpbs-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
