// What Woori Investment Securities (우리투자증권) sells online (MTS, and HTS
// for corporate clients) in shares and exchange-traded products, with no
// login.
//
// The commission page prices four share markets online: "KRX (코스피/코스닥)
// 0.010%", "NXT (넥스트레이드 거래 종목) 0.010%", "K-OTC 0.100%" and, abroad,
// "미국 0.20%". Its tax tables cover KOSPI, KOSDAQ and K-OTC shares, ETFs
// and ETNs. The US market page names the exchanges, "거래소 뉴욕거래소(NYSE),
// 나스닥(NASDAQ), 아멕스(AMEX)", and the service page the one country,
// "거래가능국가 : 미국". No page publishes a list of names.
//
// Korea. Every KOSPI and KOSDAQ share, ETF and ETN: the KRX book of the day
// (../kakaopay/krxBook.mjs), less the lines in a trading halt. KONEX is not
// priced or named anywhere ("KRX (코스피/코스닥)") and stays out, as in
// broker-list.json. NXT (Nextrade) trades a subset of the same KRX lines as
// a second venue: no extra title, no extra row.
//
// K-OTC. Priced online, so sold online. The catalogue is the market's own
// company list (KOFIA's K-OTC site, the public API behind its 기업리스트
// page): the 지정기업부, 등록기업부 and 상장폐지지정기업부 sections, one common
// share each, with the ISIN the list prints. K-OTC has no MIC; rows are
// exchange "K-OTC", no mic, KRW. The site publishes no halt list that can
// be read without an account, so no K-OTC line is removed for a halt.
//
// United States. No list, no stated count. The three names "NYSE, NASDAQ,
// AMEX" are Korean brokers' three US market codes, AMEX being the bucket for
// every listing that is neither NYSE nor Nasdaq (Toss files NYSE American,
// NYSE Arca and Cboe BZX listings, SPY among them, under AMEX:
// ../toss/toss-parsed.json). So the catalogue is the whole US exchange book
// (../wellstrade/usBook.mjs: every listed share, ADR, preferred, closed-end
// fund, ETF and ETN, less warrants, rights, units, listed notes and open
// halts). No exception is named. Foreign ETPs need a one-off ETP agreement
// ("해외 ETP 약정 신청"), and Korean rules ask a retail client for a deposit
// and an online course before leveraged or inverse ones: conditions on the
// client, not on the titles. The US is one NBBO market: one row per title,
// in dollars.
//
//   https://fundsupermarket.wooriib.com/fmc/FMC3090002/main.do   (commissions)
//   https://fundsupermarket.wooriib.com/fmc/FMC3090030/main.do   (US market)
//   https://fundsupermarket.wooriib.com/fmc/FMC3090031/main.do   (overseas service)
//   https://www.k-otc.or.kr/public/corp/corpList
//
//   node brokers/woori/woori_scraping.mjs

import { writeCatalogue } from "../mitsubishiufjesmart/japan.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { krxBook } from "../kakaopay/krxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const SITE = "https://fundsupermarket.wooriib.com/fmc";
const KOTC_API = "https://www.k-otc.or.kr/public/api";
const SECTIONS = new Set(["지정", "등록", "상폐"]);

const EVIDENCE = [
  [`${SITE}/FMC3090002/main.do`, /KRX \(코스피\/코스닥\) 0\.010% 0\.498%/],
  [`${SITE}/FMC3090002/main.do`, /NXT \(넥스트레이드 거래 종목\) 0\.010% 0\.498%/],
  [`${SITE}/FMC3090002/main.do`, /K-OTC 0\.100% 0\.498%/],
  [`${SITE}/FMC3090002/main.do`, /미국 0\.20% 0\.50%/],
  [`${SITE}/FMC3090030/main.do`, /거래소 뉴욕거래소\(NYSE\), 나스닥\(NASDAQ\), 아멕스\(AMEX\)/],
  [`${SITE}/FMC3090031/main.do`, /거래가능국가 : 미국/],
];

const words = (html) =>
  html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;?/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

async function checkPages() {
  const pages = new Map();
  for (const [url, pattern] of EVIDENCE) {
    if (!pages.has(url)) {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90_000) });
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      pages.set(url, words(await response.text()));
    }
    if (!pattern.test(pages.get(url))) throw new Error(`${url} no longer says ${pattern.source}`);
  }
  const fees = pages.get(`${SITE}/FMC3090002/main.do`);
  if (/코넥스|KONEX/i.test(fees)) throw new Error("the Woori fee page now names KONEX: check whether it is sold");
}

async function kotcBook() {
  const response = await fetch(KOTC_API, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json; charset=UTF-8", Referer: "https://www.k-otc.or.kr/public/corp/corpList" },
    body: JSON.stringify({ class: "CorpService", method: "selectCorpSrch", param: { itemCd: "", settleTrm: "", grpGb: "" } }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`K-OTC company list answered ${response.status}`);
  const body = await response.json();
  if (!body.success || !Array.isArray(body.contents)) throw new Error("K-OTC company list not read");
  const rows = [];
  const sections = {};
  for (const line of body.contents) {
    const section = String(line.GRPGBNM || "").trim();
    if (!SECTIONS.has(section)) throw new Error(`K-OTC section ${section} for ${line.SHORTCD}`);
    const code = String(line.SHORTCD || "").trim();
    const isin = String(line.ITEMCD || "").trim();
    if (!/^[0-9A-Z]{6}$/.test(code) || !/^KR[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`K-OTC line not read: ${JSON.stringify(line)}`);
    sections[section] = (sections[section] || 0) + 1;
    rows.push({
      query: isin,
      ticker: code,
      name: String(line.KOREANSHTNM || "").trim(),
      exchange: "K-OTC",
      currency: "KRW",
      type: "STOCK",
      isin,
      raw: [code, line.KOREANSHTNM, "K-OTC", `${section}기업부`, line.BUSINESSMIDBRNNM].filter(Boolean).join(" | "),
    });
  }
  if (rows.length < 80) throw new Error(`K-OTC company list has only ${rows.length} lines`);
  return { rows, sections };
}

await checkPages();
const krx = await krxBook();
const kotc = await kotcBook();
const us = await usBook();

writeCatalogue(import.meta.url, "woori-parsed.json", [...krx.rows, ...kotc.rows, ...us], {
  "KOSPI STOCK": 800,
  "KOSDAQ STOCK": 1500,
  "KOSPI ETF": 800,
  "K-OTC STOCK": 80,
  XNAS: 3000,
  XNYS: 2000,
  ARCX: 1500,
});
console.error(`KRX halted, left out: ${krx.halted.length}; K-OTC sections ${JSON.stringify(kotc.sections)}`);
console.error(`US left out: ${Object.entries(us.report.leftOut).map(([what, list]) => `${list.length} ${what}`).join(", ")}`);
