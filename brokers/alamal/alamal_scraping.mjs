// What Al-Amal Financial Investments (Amman, a member of the Amman Stock
// Exchange) sells online in shares, with no login. Its one online place is
// the Amman Stock Exchange: its notice of 2023-02-14, "تعديل عمولة التداول
// عبر الانترنت", announces "خدمة التداول الالكتروني في سوق عمان المالي من
// خلال الهواتف الذكية" (online trading on the ASE from smartphones, the
// "Al-Amal Financial Investments Co. E-Trade APP"), and its profile says
// its business is "التداول في بورصة عمان لحسابها ولحساب عملائها". It names
// no market, board or company it does not trade, so the book is every
// listed ASE share (first and second market) open to trade.
//
// The same profile adds that the company is "مرخصة كوسيط معرف للبورصات
// الاجنبية" (an introducing broker for foreign exchanges), and its home
// page offers a "الأسهم المحلية والعالمية" account, but no page names a
// foreign exchange, an online channel for it or a fee, so no foreign place
// is written. broker-list.json gives the ASE only.
//
//   https://www.alamal.com.jo/companyNews.php
//   https://www.alamal.com.jo/aboutUs.php
//   https://play.google.com/store/apps/details?id=com.manafsoft.ase_alamal_14
//
// The shared ASE book (../unitedarabjordan/ammanBook.mjs) reads the
// exchange's own list of listed shares, joins the ISIN from the Securities
// Depository Center and drops the lines the ASE has suspended. The ASE
// lists no ETF, fund or depository receipt, so every row is a share in
// dinars.
//
// Fees (no login), the same notice: "قامت الشركة وخلال سنة 2023 بتخفيض
// عمولات الشراء والبيع الى الحد الادنى بواقع 0.002%" (buy and sell
// commissions cut to the minimum, printed as 0.002%), for the online
// service.
//
//   node brokers/alamal/alamal_scraping.mjs

import { writeAmmanCatalogue } from "../unitedarabjordan/ammanBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const EVIDENCE = [
  [
    "https://www.alamal.com.jo/companyNews.php",
    [/تعديل عمولة التداول عبر الانترنت/, /خدمة التداول الالكتروني في سوق عمان المالي من خلال الهواتف الذكية/, /بتخفيض عمولات الشراء والبيع الى الحد الادنى بواقع 0\.002%/],
  ],
  ["https://www.alamal.com.jo/aboutUs.php", [/التداول في بورصة عمان لحسابها ولحساب عملائها/]],
];

// The pages still say what the header quotes, or the run stops.
for (const [url, patterns] of EVIDENCE) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await writeAmmanCatalogue(import.meta.url, "alamal-parsed.json");
