// What Phu Hung Securities (PHS) sells in shares and exchange-traded funds,
// with no login. The PHS KRX price board loads every symbol from one call,
// and that list is the book: each line names the floor and a type. STOCK
// and ETF on HOSE, HNX and UPCOM are kept. Covered warrants, bonds,
// futures and indexes are other products and are not written; OPTION on
// this board is the three closed-end fund certificates, which are not
// written either. The list prints no ISIN; the Vietnamese number is built
// from the ticker. The shared rules are in ../vix/vnboard.mjs.
//
//   https://priceboard.phs.vn/
//   https://priceboard.phs.vn:8443/api/v1/market/all-stock
//
//   node brokers/phs/phs_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { finish, staticBoard } from "../vix/vnboard.mjs";

const LIST = "https://priceboard.phs.vn:8443/api/v1/market/all-stock";

const { lines, leftOut } = await staticBoard(LIST);
const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("phs-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
