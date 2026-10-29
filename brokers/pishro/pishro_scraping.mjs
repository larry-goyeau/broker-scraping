// What Pishro Brokerage (کارگزاری پیشرو) sells in shares and ETFs, with no
// login. Its trading page offers the online securities system "سامانه آنلاین
// اوراق (آنلاین پلاس)" (Tadbir Online Plus), plus Kaman and algorithmic
// systems; Online Plus trades the TSE and IFB books.
//
//   https://pishrobroker.ir/home/trades
//
// Places: Tehran Stock Exchange and Iran Fara Bourse, as in the broker-list
// row. Pishro's pages name "بورس اوراق و کالا" and link the IFB site; they
// exclude neither exchange.
//
// Pishro publishes no symbol list and excludes no board, market or fund, so
// the catalogue is the two exchanges' whole book, read by
// brokers/farabi/iranBook.mjs (source and filters there): every TSE and IFB
// share (IFB base market included) and every TSE/IFB exchange-traded fund
// the supervisor has open, in rials; halted symbols, rights, bonds and IME
// funds out.
//
// Fees: the FAQ "کارمزد معاملات سهام چقدر است؟" ("بر اساس مصوبه سازمان
// بورس"): listed shares "کارمزد خرید= ارزش معامله * 003712/0", sell 0088/0
// (0.3712% / 0.88%, decimals written right to left); fixed-income funds
// 0.01875% each side. The answer sits in the page's script
// (app/home/FAQ/page-*.js), read here.
//
//   https://pishrobroker.ir/home/FAQ
//
//   node brokers/pishro/pishro_scraping.mjs

import { iranBook, iranBookSummary, iranPageSays } from "../farabi/iranBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("pishro-parsed.json", import.meta.url);
const FAQ = "https://pishrobroker.ir/home/FAQ";
const ONLINE = "https://pishrobroker.ir/home/trades";

async function feeAnswer() {
  const html = await iranPageSays(FAQ, [], { raw: true });
  const chunk = html.match(/static\/chunks\/app\/home\/FAQ\/page-[0-9a-f]+\.js/);
  if (!chunk) throw new Error(`${FAQ} no longer loads its FAQ script`);
  await iranPageSays(`https://pishrobroker.ir/_next/${chunk[0]}`, [/کارمزد معاملات سهام چقدر است/, /کارمزد خرید= ارزش معامله \* 003712\/0/, /کارمزد فروش= ارزش معامله \* 0088\/0/], { raw: true });
}

await Promise.all([feeAnswer(), iranPageSays(ONLINE, [/سامانه آنلاین اوراق \(آنلاین پلاس\)/])]);

const rows = await iranBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Pishro Brokerage: ${iranBookSummary(rows)}`);
