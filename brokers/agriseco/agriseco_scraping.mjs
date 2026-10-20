// What Agriseco (Agribank Securities) sells in shares and exchange-traded
// funds, with no login. The broker's web price board, linked from
// agriseco.com.vn, is the FSS FlexTrade app, and its feeds are the book:
// the round-lot snapshot and the odd-lot snapshot per floor, which name the
// floor, a type and, for funds, ETF or closed-end. The round-lot snapshot
// on some hosts misses recent listings that the odd-lot one has, so the two
// are joined. Shares and ETFs on HOSE, HNX and UPCOM are kept. Covered
// warrants, bonds, futures and closed-end funds are other products and are
// not written. A line with no trading date has no session today (a
// delisted name) and is not written. The board prints no ISIN; the
// Vietnamese number is built from the ticker.
// The shared rules are in ../vix/vnboard.mjs.
//
//   https://trading.agr.vn/priceboard
//   https://trading.agr.vn/datafeed/instruments
//   https://trading.agr.vn/datafeed/oddLotInstruments?exchange=UPCOM   (HOSE, HNX)
//
//   node brokers/agriseco/agriseco_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { finish, fssBoard } from "../vix/vnboard.mjs";

const HOST = "https://trading.agr.vn";

const { lines, leftOut } = await fssBoard(HOST);
const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("agriseco-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
