// What Finhay Securities (FHSC, formerly Vina Securities) sells in shares
// and exchange-traded funds, with no login. The "Bảng giá" tab of the
// broker's web app is open before login and loads one stock-info call from
// the broker's own data feed; that list is the book. Each line names the
// floor and a type: STOCK a share, FUND_CERTIFICATE a fund ("Quỹ ETF …" is
// an ETF, any other "Quỹ" a closed-end fund), WARRANT a covered warrant,
// BOND a bond. Shares and ETFs on HOSE, HNX and UPCOM are kept. Covered
// warrants, bonds and closed-end funds are other products and are not
// written, nor is a line with no price band. The list prints no ISIN; the
// Vietnamese number is built from the ticker. The shared rules are in
// ../vix/vnboard.mjs.
//
//   https://invest.fhsc.com.vn/bang-gia
//   https://satellite.vinasecurities.com/datafeed/v2/stocks-info
//
//   node brokers/finhay/finhay_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { boardOf, clean, finish, fundType, getJson, tally } from "../vix/vnboard.mjs";

const FEED = "https://satellite.vinasecurities.com/datafeed/v2/stocks-info";
const HEADERS = { Origin: "https://invest.fhsc.com.vn", Referer: "https://invest.fhsc.com.vn/" };
const OTHER = { WARRANT: "covered warrants", BOND: "bonds" };

const body = await getJson(FEED, { headers: HEADERS });
if (String(body?.error_code) !== "0" || !Array.isArray(body.result) || !body.result.length) {
  throw new Error(`${FEED} has no listings: ${clean(body?.message)}`);
}

const lines = [];
const leftOut = new Map();
for (const line of body.result) {
  const ticker = clean(line.symbol).toUpperCase();
  const name = clean(line.name);
  const kind = clean(line.stockType).toUpperCase();
  if (OTHER[kind]) {
    tally(leftOut, OTHER[kind]);
    continue;
  }
  let type = "";
  if (kind === "STOCK") type = "STOCK";
  else if (kind === "FUND_CERTIFICATE" && fundType(name)) type = "ETF";
  else if (kind === "FUND_CERTIFICATE") tally(leftOut, "closed-end funds");
  else throw new Error(`${ticker} has stockType ${kind || "none"}`);
  if (!type) continue;
  const exchange = boardOf(line.exchange);
  if (!exchange) throw new Error(`${ticker} is on ${clean(line.exchange) || "no board"}`);
  if (!(Number(line.reference) > 0 && Number(line.ceiling) > 0 && Number(line.floor) > 0)) {
    tally(leftOut, "lines with no price band");
    continue;
  }
  lines.push({ ticker, name, exchange, type });
}

const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("finhay-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
