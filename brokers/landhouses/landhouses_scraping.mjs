// Land and Houses Securities (LH Securities, Thailand) sells on one place,
// the Stock Exchange of Thailand, and prints no list of its own. Its
// tariff page charges one sliding scale for shares and, in its note, for
// listed units: "ค่านายหน้าสำหรับการซื้อขายหน่วยลงทุน เช่น กองทุนรวม, ETF,
// Property Fund ... เป็นลักษณะขั้นบันไดเช่นเดียวกับหลักทรัพย์ประเภทหุ้น"
// (bond-fund units at the rate agreed with the client). No page leaves
// out a board (SET or mai), NVDRs, DRs, REITs or ETFs. So the catalogue is
// the whole SET book.
//
// Left out (in ../kgithailand/setBook.mjs): warrants and derivative
// warrants, rights, foreign-board lines (.F, .Q), pre-IPO lines, and lines
// with no trade for more than 30 days (suspended, halted or delisting).
// The account-types page says a Credit Balance account trades only "หุ้น
// ที่บริษัทฯ กำหนด", and the "ประกาศหุ้น Turnover List" link points to SET's
// cash-balance list (names bought only with cash up front): both depend
// on the account, so they are remarks, not removals.
//
// The pages load their text from ajax/about_detail.php (id 52 the tariff,
// id 53 the account types).
//
// Fees (no login): daily-value scale, internet Cash Balance 0.15% down to
// 0.10%, plus 0.007% exchange fees and VAT, minimum 30 baht a day:
//   https://www.lhsec.co.th/infocus.php?method=detail&id=52
//   https://www.lhsec.co.th/infocus.php?method=detail&id=53
//
//   node brokers/landhouses/landhouses_scraping.mjs

import { writeSetCatalogue } from "../kgithailand/setBook.mjs";

await writeSetCatalogue(import.meta.url, "landhouses-parsed.json");
