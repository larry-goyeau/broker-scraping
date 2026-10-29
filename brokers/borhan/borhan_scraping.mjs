// What Borhan Sahand Brokerage (کارگزاری برهان سهند) sells in shares and
// ETFs, with no login. Its online page offers its systems (OMEX, Rayan
// Hamafza's Exir) for the securities "قابل معامله در بورس و فرابورس".
//
//   https://bsbourse.ir/onlinee
//
// Places: Tehran Stock Exchange and Iran Fara Bourse, as in the broker-list
// row.
//
// Borhan publishes no symbol list and excludes no board, market or fund, so
// the catalogue is the two exchanges' whole book, read by
// brokers/farabi/iranBook.mjs (source and filters there): every TSE and IFB
// share (IFB base market included) and every TSE/IFB exchange-traded fund
// the supervisor has open, in rials; halted symbols, rights, bonds and IME
// funds out.
//
// Fees: page "نرخ کارمزد معاملات": shares and rights buy 0.38% (broker 0.304
// + exchange 0.076) / sell 0.88% (with the 0.5% tax), one row for TSE and
// IFB; ETFs 0.116% / 0.119%.
//
//   https://bsbourse.ir/transaction
//
//   node brokers/borhan/borhan_scraping.mjs

import { iranBook, iranBookSummary, iranPageSays } from "../farabi/iranBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("borhan-parsed.json", import.meta.url);
const FEES = "https://bsbourse.ir/transaction";
const ONLINE = "https://bsbourse.ir/onlinee";

await Promise.all([
  iranPageSays(FEES, [/نرخ کارمزد معاملات/, /0\.304 0\.076 0\.5 0\.88/]),
  iranPageSays(ONLINE, [/اوراق بهادار قابل معامله در بورس و فرابورس/]),
]);

const rows = await iranBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Borhan Sahand Brokerage: ${iranBookSummary(rows)}`);
