// What Everest Securities (EVS) sells in shares and exchange-traded funds, with no
// login. The broker's web price board (the FSS FlexTrade app) is the book:
// its round-lot snapshot and its odd-lot snapshot per floor, which name
// the floor, a type and, for funds, ETF or closed-end. The round-lot
// snapshot on some hosts misses recent listings that the odd-lot one has,
// so the two are joined. Shares and ETFs on HOSE, HNX and UPCOM are kept.
// Covered warrants, bonds, futures and closed-end funds are other products
// and are not written. A line with no trading date has no session today (a
// delisted name) and is not written. The board prints no ISIN; the
// Vietnamese number is built from the ticker.
// The shared rules are in ../vix/vnboard.mjs.
//
//   https://trade.eves.com.vn/evrtrade/priceboard
//   https://trade.eves.com.vn/datafeed/instruments
//   https://trade.eves.com.vn/datafeed/oddLotInstruments?exchange=UPCOM   (HOSE, HNX)
//
//   node brokers/eves/eves_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { finish, fssBoard } from "../vix/vnboard.mjs";

const HOST = "https://trade.eves.com.vn";

const { lines, leftOut } = await fssBoard(HOST);
const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("eves-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
