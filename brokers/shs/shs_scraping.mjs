// What Saigon-Hanoi Securities (SHS) sells in shares and exchange-traded
// funds, with no login. The SHS sBoard price board loads one static symbol
// file, and that file is the book: each line names the floor, a type and
// the ISIN, and carries the session date it was last seen. Only lines from
// the newest session are today's board; an older date is a delisted name
// left in the file. STOCK and ETF on HOSE, HNX and UPCOM are kept. Covered
// warrants, bonds, futures, indexes and closed-end funds (FUND) are other
// products and are not written. The shared rules are in ../vix/vnboard.mjs.
//
//   https://shsmart.shs.com.vn/vi/board
//   https://shsmart.shs.com.vn/media/symbol_static_data_pilot.json
//
//   node brokers/shs/shs_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { finish, staticBoard } from "../vix/vnboard.mjs";

const FILE = "https://shsmart.shs.com.vn/media/symbol_static_data_pilot.json";

const { lines, leftOut } = await staticBoard(FILE);
const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("shs-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
