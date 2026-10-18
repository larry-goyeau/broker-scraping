// What Kirin Securities sells in shares and exchange-traded
// funds, with no login. The broker's web trading board (the Altisss "Web
// Trading System") is the book. Its stream server sends each floor's whole
// symbol list on one subscription: ST is a share, MF a fund (a "Quỹ ETF"
// is an ETF, any other "Quỹ" a closed-end fund), EW a covered warrant.
// Shares and ETFs on HOSE, HNX and UPCOM are kept. Covered warrants and
// closed-end funds are other products and are not written. The list prints
// no ISIN; the Vietnamese number is built from the ticker. The stream host
// is the one the board's own config names. The shared rules are in
// ../vix/vnboard.mjs.
//
//   https://trading.vncsi.com.vn/
//   https://trading.vncsi.com.vn/assets/config.json
//   https://trading.kirins.vn/market/socket.io (topic KRXMDDS|STKLST|STO|VI, STX, UPX)
//
//   node brokers/kirin/kirin_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { altisssBoard, finish } from "../vix/vnboard.mjs";

const STREAM = "https://trading.kirins.vn";

const { lines, leftOut } = await altisssBoard(STREAM);
const rows = finish(lines, leftOut);
fs.writeFileSync(new URL("kirin-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
