// What Saman Brokerage (کارگزاری بانک سامان) sells in shares and ETFs, with
// no login. Its online system ("سامانه معاملات برخط سامان", Tadbir Online
// Plus, and the Hamrah Plus Saman app) trades the TSE and IFB books.
//
//   https://samanbourse.ir/fa/کارگزاری-سامان/معاملات-آنلاین
//
// Places: Tehran Stock Exchange and Iran Fara Bourse, as in the broker-list
// row; its rules page carries a fee schedule for each ("سقف نرخ کارمزدها و
// خدمات در بازار سرمایه ایران" and "نرخ و سقف کارمزد انواع معاملات در
// فرابورس ایران", which covers the IFB first, second and base markets).
//
// Saman publishes no symbol list and excludes no board, market or fund, so
// the catalogue is the two exchanges' whole book, read by
// brokers/farabi/iranBook.mjs (source and filters there): every TSE and IFB
// share (IFB base market included) and every TSE/IFB exchange-traded fund
// the supervisor has open, in rials; halted symbols, rights, bonds and IME
// funds out.
//
// Fees: the two SEO schedules, as PDFs on samanbourse.ir (rules page of 23
// Mehr 1402): TSE shares buy 0.3712% / sell 0.88% (broker 0.304% each side,
// sell tax 0.5%), IFB shares buy 0.3632% / sell 0.88%.
//
//   https://samanbourse.ir/fa/قوانین-و-آیین-نامه-ها
//   https://samanbourse.ir/ModuleFiles/Download/سقف نرخ کارمزدها و خدمات در بازار سرمایه ایران.pdf
//   https://samanbourse.ir/ModuleFiles/Download/کارمزد فرابورس.pdf
//
//   node brokers/saman/saman_scraping.mjs

import { iranBook, iranBookSummary, iranPageSays } from "../farabi/iranBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("saman-parsed.json", import.meta.url);
const RULES = "https://samanbourse.ir/fa/قوانین-و-آیین-نامه-ها";
const FEES_TSE = "https://samanbourse.ir/ModuleFiles/Download/سقف نرخ کارمزدها و خدمات در بازار سرمایه ایران.pdf";
const FEES_IFB = "https://samanbourse.ir/ModuleFiles/Download/کارمزد فرابورس.pdf";
const ONLINE = "https://samanbourse.ir/fa/کارگزاری-سامان/معاملات-آنلاین";

await Promise.all([
  iranPageSays(RULES, [/سقف نرخ کارمزدها و خدمات در بازار سرمایه ایران/, /نرخ و سقف کارمزد انواع معاملات در فرابورس ایران/]),
  iranPageSays(FEES_TSE, [], { pdf: true }),
  iranPageSays(FEES_IFB, [], { pdf: true }),
  iranPageSays(ONLINE, [/سامانه معاملات برخط سامان/]),
]);

const rows = await iranBook();
fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
console.error(`Saman Brokerage: ${iranBookSummary(rows)}`);
