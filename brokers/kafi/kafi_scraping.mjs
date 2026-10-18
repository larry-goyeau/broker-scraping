// What Kafi Securities sells in shares and exchange-traded funds, with no
// login. The Kafi X web board loads one static symbol file (its config
// calls it marketDataUrl) from the broker's API host, and that file is the
// book: each line names the floor, a type and the ISIN. The board drops a
// share with no price band, and so does this. STOCK and ETF on HOSE, HNX
// and UPCOM are kept. Covered warrants, bonds, futures, indexes and
// closed-end funds (FUND) are other products and are not written. The
// shared rules are in ../vix/vnboard.mjs.
//
//   https://x.kafi.vn/web/vi
//   https://api.kafi.vn/x/customers/symbol/symbol_static_data.json
//
//   node brokers/kafi/kafi_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { finish, staticBoard } from "../vix/vnboard.mjs";

const FILE = "https://api.kafi.vn/x/customers/symbol/symbol_static_data.json";

const { lines, leftOut } = await staticBoard(FILE);
const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("kafi-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
