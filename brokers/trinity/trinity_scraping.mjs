// Trinity Securities (บริษัทหลักทรัพย์ ทรีนีตี้, SET member) sells Thai
// shares and derivatives, through a marketing officer or online ("ฝ่าย
// E-Business (เพื่อซื้อขายหุ้นผ่านอินเทอร์เน็ต)", its internet-trading
// desk). Its one place is the Stock Exchange of Thailand, both boards (SET
// and mai, the two places of its broker-list row; one XBKK order book). It
// prints no list and its fee page prices every SET trade on one scale, with
// no board, NVDR, DR, ETF or REIT left out, so the catalogue is the whole
// SET book.
//
//   https://www.trinitythai.com/th/Service/Equity/23   (fees)
//   https://www.trinitythai.com/en/InternetTrading
//
// Left out (in ../kgithailand/setBook.mjs): warrants and derivative
// warrants, rights, foreign-board lines (.F, .Q), pre-IPO lines, and lines
// with no trade for more than 30 days (suspended, halted or delisting).
// The Vietnam fund (SSI-SCA), private funds and debentures are not
// exchange-traded here.
//
// Fees: "ค่าธรรมเนียมการซื้อขายหลักทรัพย์" page, a daily-value scale printed
// as an image: internet, Cash Account 0.200% (up to 5 million baht a day)
// down to 0.120%, Cash Balance / Credit Balance 0.150% down to 0.100%,
// through an officer 0.250% down to 0.150%; plus 0.007% exchange fees,
// VAT 7%, minimum 50 baht a day ("ค่าธรรมเนียมการซื้อขายหลักทรัพย์ขั้นต่ำ 50
// บาทต่อวัน"). The run checks the page's text and that the scale image is
// still the one read (2026-10-28).
//
//   node brokers/trinity/trinity_scraping.mjs

import { writeSetCatalogue } from "../kgithailand/setBook.mjs";
import { pageSays } from "../alphasec/pdfSays.mjs";

const FEES = "https://www.trinitythai.com/th/Service/Equity/23";
await pageSays(FEES, [
  /ค่าธรรมเนียมการซื้อขายหลักทรัพย์ขั้นต่ำ 50 บาทต่อวัน/,
  /ผ่านอินเทอร์เน็ต/,
  /web_file_manager_29397_1754560690_25288_file1\.png/,
], { raw: true });

const rows = await writeSetCatalogue(import.meta.url, "trinity-parsed.json");
if (rows.length < 1500) throw new Error(`only ${rows.length} SET rows`);
