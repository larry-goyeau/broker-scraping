// What Bao Minh Securities (BMSC) sells in shares and exchange-traded
// funds, with no login. The broker's web board (banggia.bmsc.com.vn sends
// you to trading.bmsc.com.vn) loads one static symbol file from the
// broker's BMSmart host, and that file is the book: each line names the
// floor, a type, the ISIN and today's session date. Only lines carrying
// the newest session date are today's board. STOCK and ETF on HOSE, HNX
// and UPCOM are kept. Covered warrants, bonds, futures, indexes and
// closed-end funds (FUND) are other products and are not written. The
// shared rules are in ../vix/vnboard.mjs.
//
//   https://trading.bmsc.com.vn/vi/board
//   https://bmsmart.bmsc.com.vn/symbol/symbol_static_data.json
//
//   node brokers/bmsc/bmsc_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { finish, staticBoard } from "../vix/vnboard.mjs";

const FILE = "https://bmsmart.bmsc.com.vn/symbol/symbol_static_data.json";

const { lines, leftOut } = await staticBoard(FILE);
const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("bmsc-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
