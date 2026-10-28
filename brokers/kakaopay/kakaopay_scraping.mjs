// What Kakao Pay Securities (카카오페이증권) sells in shares and
// exchange-traded products, with no login. It is a mobile-only broker
// (accounts and orders in the Kakao Pay / Kakao Talk apps), so every order
// is an online one.
//
// The fee page has two share lines, domestic "국내 (ETF/ETN 포함)" (KRX
// 0.015%, NXT 0.014% online) and overseas "해외 (ETF/ETN 포함)" (0.1%
// online), and the overseas taxes are for "해외 (미국) 뉴욕/나스닥/아멕스".
// The FAQ: "KRX는 모든 상장 주식이 거래되지만, NXT는 지정된 종목만 거래가
// 가능해요". Neither page publishes a list of names.
//
// Korea. Every KRX-listed share, ETF and ETN, which is the KRX book of the
// day (./krxBook.mjs): KOSPI and KOSDAQ shares (common and preferred),
// ETFs and ETNs, less the lines in a trading halt. KONEX is left out: no
// page of the firm names it, the domestic taxes it prints are KOSPI's and
// KOSDAQ's only ("코스피 : 매도금액의 0.20%", "코스닥 : 매도금액의 0.20%"),
// and broker-list.json has KOSPI and KOSDAQ only. NXT (Nextrade) is a second
// venue for a subset of the same lines, reached through the firm's
// combined routing (통합모드); it adds no title and no row.
//
// United States. No list, and no stated count. The places named are
// "뉴욕/나스닥/아멕스" (NYSE, Nasdaq, AMEX). In Korean brokers' market codes
// AMEX is the bucket for every US listing that is neither NYSE nor Nasdaq:
// Toss's catalogue (../toss/toss-parsed.json) files NYSE American, NYSE
// Arca and Cboe BZX listings (SPY, IVV and the other Arca and Cboe ETFs)
// under AMEX. So the three names cover the whole US exchange book
// (../wellstrade/usBook.mjs: every listed share, ADR, preferred, closed-end
// fund, ETF and ETN, less warrants, rights, units, listed notes and open
// halts), which is the catalogue. OTC lines are not in it. No exception is
// named on the firm's pages. Korean rules ask a retail client for a deposit
// and an online course before a first leveraged or inverse foreign ETP:
// that depends on the client, not the title, and removes nothing. The US
// is one NBBO market: one row per title, in dollars.
//
//   https://www.kakaopaysec.com/guide/feeGuide/dynamicPage.do
//   https://www.kakaopaysec.com/customer/faq/dynamicPage.do
//
//   node brokers/kakaopay/kakaopay_scraping.mjs

import { writeCatalogue } from "../mitsubishiufjesmart/japan.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { krxBook } from "./krxBook.mjs";

const SITE = "https://www.kakaopaysec.com";
const EVIDENCE = [
  [`${SITE}/guide/feeGuide/dynamicPage.do`, /국내 \(ETF\/ETN 포함\) KRX 한국거래소 0\.015%/],
  [`${SITE}/guide/feeGuide/dynamicPage.do`, /해외 \(ETF\/ETN 포함\) 0\.1%/],
  [`${SITE}/guide/feeGuide/dynamicPage.do`, /해외 \(미국\) 뉴욕\/나스닥\/아멕스/],
  [`${SITE}/customer/faq/dynamicPage.do`, /KRX는 모든 상장 주식이 거래되지만, NXT는 지정된 종목만 거래가 가능해요/],
];

const words = (html) =>
  html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;?/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const pages = new Map();
for (const [url, pattern] of EVIDENCE) {
  if (!pages.has(url)) {
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    pages.set(url, words(await response.text()));
  }
  if (!pattern.test(pages.get(url))) throw new Error(`${url} no longer says ${pattern.source}`);
}
if (/코넥스|KONEX/i.test([...pages.values()].join(" "))) throw new Error("a Kakao Pay page now names KONEX: check whether it is sold");

const krx = await krxBook();
const us = await usBook();

writeCatalogue(import.meta.url, "kakaopay-parsed.json", [...krx.rows, ...us], {
  "KOSPI STOCK": 800,
  "KOSDAQ STOCK": 1500,
  "KOSPI ETF": 800,
  XNAS: 3000,
  XNYS: 2000,
  ARCX: 1500,
});
console.error(`KRX halted, left out: ${krx.halted.length}; US left out: ${Object.entries(us.report.leftOut).map(([what, list]) => `${list.length} ${what}`).join(", ")}`);
