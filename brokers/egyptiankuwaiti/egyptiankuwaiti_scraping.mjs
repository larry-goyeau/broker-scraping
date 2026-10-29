// What Egyptian Kuwaiti Brokerage (EKB Online) sells in shares and
// exchange-traded funds online, with no login. EKB is a member of the
// Egyptian Exchange; its e-trade site takes orders online and through its
// phone app ("تم اطلاق خدمة التداول عن طريق تطبيق الهاتف"). It names no
// list narrower than the market: its quote pages cover the main market,
// the OTC board and the Nile exchange ("بورصة النيل", the EGX SME market the
// broker list calls Nilex). So the place is the whole EGX listing.
//
// EKB's own sector board (Sectors.aspx, "all") is not used as the book: it
// is stale. It still carries some sixty delisted or long-suspended codes
// and misses about forty current lines (QNBE, VALU, TAQA, RMDA, ...). The
// book is the price ticker of Al Rowad's TEA Computers e-trade site, every
// line the exchange's trading system quotes, read and filtered by
// ../rowad/egxboard.mjs. Main, SME (Nilex) and OTC-board lines are all EGX
// rows. Shares and the EGX 30 index ETF are kept; listed mutual and
// real-estate fund certificates, subscription rights and sukuk are other
// products and are not written.
//
// Fee (owner's rule "no fees, no scraper"), account-opening contract on
// EKB's site, annex 2 "ملحق العمولات والمصروفات والرسوم":
//   "عمولات التداول 5 في الألف بحد أدنى 15 جنيه مصرى أو ما يعادل بالدولار
//    الأمريكى" (0.5 %, minimum EGP 15), and the later statement page of the
//   same PDF: "عمولة التداول 0.5 %".
//   https://egksco-online.com/etrade/UserFiles/File/Open%20account%20page/Open%20Account%20Contract.pdf
//
//   https://egksco-online.com/etrade/Home.aspx
//   https://egksco-online.com/etrade/Sectors.aspx
//
//   node brokers/egyptiankuwaiti/egyptiankuwaiti_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { clean, finish, pageText, tickerBoard } from "../rowad/egxboard.mjs";

const BOARD = "https://alrowadonline.com/NewLogin.aspx";
const TARIFF = "https://egksco-online.com/etrade/UserFiles/File/Open%20account%20page/Open%20Account%20Contract.pdf";
const EVIDENCE = [
  ["https://egksco-online.com/etrade/Home.aspx", /تم اطلاق خدمة التداول عن طريق تطبيق الهاتف/],
  ["https://egksco-online.com/etrade/Sectors.aspx", /بورصة النيل/],
];

const text = (html) => clean(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
for (const [url, pattern] of EVIDENCE) {
  if (!pattern.test(text(await pageText(url)))) throw new Error(`${url} no longer says ${pattern}`);
}
const tariff = await fetch(TARIFF, { method: "HEAD", signal: AbortSignal.timeout(60_000) });
if (!tariff.ok || !/pdf/i.test(tariff.headers.get("content-type") || "")) throw new Error(`${TARIFF}: tariff PDF gone (HTTP ${tariff.status})`);

const rows = finish(await tickerBoard(BOARD), "EKB");
fs.writeFileSync(new URL("egyptiankuwaiti-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
