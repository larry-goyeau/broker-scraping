// What Al Rowad Securities Brokerage sells in shares and exchange-traded
// funds, with no login. Al Rowad is a member of the Egyptian Exchange and
// says it brokers the buying and selling of shares and bonds on and off the
// floor ("الوساطة فى بيع وشراء الأسهم والسندات داخل وخارج المقصورة"), with
// no list narrower than the market. Its public e-trade site (TEA Computers)
// carries the price ticker of every line the trading system quotes, and
// that ticker is the book: one Reuters code (.CA) and Arabic name per line.
// Shares and the EGX 30 index ETF are kept. Listed mutual and real-estate
// fund certificates, subscription rights and sukuk are other products and
// are not written. The rules are in ./egxboard.mjs.
//
//   https://alrowadonline.com/NewLogin.aspx
//   https://alrowadonline.com/About.aspx
//
//   node brokers/rowad/rowad_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { finish, tickerBoard } from "./egxboard.mjs";

const PAGE = "https://alrowadonline.com/NewLogin.aspx";

const rows = finish(await tickerBoard(PAGE), "Al Rowad");
fs.writeFileSync(new URL("rowad-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
