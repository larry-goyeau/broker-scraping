// What Charisma Brokerage (کارگزاری کاریزما) sells in shares and ETFs, with
// no login. Its platforms (Exir "سامانه معاملات آنلاین", the Charisma app,
// Charisma Trader) trade the shares of listed TSE and IFB companies and the
// exchange-traded funds: "با خرید سهام شرکت های بورسی و فرابورسی از طریق
// پلتفرم های ما می تونی مالک اون ها بشی".
//
//   https://charisma.ir/brokerage/overview
//
// Places: Tehran Stock Exchange and Iran Fara Bourse, as in the broker-list
// row (the IME and energy exchanges, options and futures: not shares/ETFs).
//
// Charisma publishes no symbol list and excludes no board, market or fund,
// so the catalogue is the two exchanges' whole book, read by
// brokers/farabi/iranBook.mjs (source and filters there): every TSE and IFB
// share (IFB base market included) and every TSE/IFB exchange-traded fund
// the supervisor has open, in rials; halted symbols, rights, bonds and IME
// funds out.
//
// Fee page (SEO rates for 1405): "سهام و حق تقدم در بورس تهران 0٫3712٪
// 0٫88٪"; IFB shares 0.3632% buy / 0.88% sell; equity ETF 0.2245% / 0.23%,
// mixed ETF 0.1175% / 0.12625%, fixed-income ETF 0.036875% each side.
//
//   https://learning.charisma.ir/beginning-investing/کارمزد-معاملات/
//
//   node brokers/charisma/charisma_scraping.mjs

import { iranBook, iranBookSummary, iranPageSays } from "../farabi/iranBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("charisma-parsed.json", import.meta.url);
const FEES = "https://learning.charisma.ir/beginning-investing/کارمزد-معاملات/";
const ONLINE = "https://charisma.ir/brokerage/overview";

await Promise.all([
  iranPageSays(FEES, [/سهام و حق تقدم در بورس تهران 0\.3712%/, /فرابورس 0\.3632/]),
  iranPageSays(ONLINE, [/سهام شرکت های بورسی و فرابورسی/]),
]);

const rows = await iranBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Charisma Brokerage: ${iranBookSummary(rows)}`);
