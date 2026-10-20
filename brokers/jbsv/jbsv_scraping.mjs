// What JB Securities Vietnam (JBSV) sells in shares and exchange-traded
// funds, with no login. jbsv.com.vn sends clients to the Finavi web
// trading system (JBSV's fee schedule and terms are served from the same
// host), and that board loads one static symbol file, which is the book:
// each line names the floor, a type and the price band. The board drops a
// share with no price band, and so does this. STOCK and ETF on HOSE, HNX
// and UPCOM are kept. Covered warrants, bonds, futures, indexes and
// closed-end funds (FUND) are other products and are not written. The file
// prints no ISIN; the Vietnamese number is built from the ticker. The
// shared rules are in ../vix/vnboard.mjs.
//
//   https://jbsv.com.vn/
//   https://wts.finavi.com.vn/
//   https://wts.finavi.com.vn/s3/market/symbol.json
//
//   node brokers/jbsv/jbsv_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { finish, staticBoard } from "../vix/vnboard.mjs";

const FILE = "https://wts.finavi.com.vn/s3/market/symbol.json";

const { lines, leftOut } = await staticBoard(FILE);
const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("jbsv-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
