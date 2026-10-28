// What OKB Securities (OKB証券, Ogaki Kyoritsu Bank group) sells in shares
// and exchange-traded funds, with no login.
//
// Shares are traded online only, at home and abroad (FAQ: "株式の取引は、国内
// ・海外ともにオンライントレードのみでのお取扱となります"), so the online offer
// is the whole share offer.
//
// Japan. The stock page: "東京証券取引所(プライム・スタンダード・グロース)に上場
// されている株式と米国株式を取り扱っています", and the ETF/ETN page: "東京証券取引
// 所に上場されているETF(上場投資信託)・ETN(上場投資証券)を 取り扱っています". The
// FAQ on transfers in says what the firm holds: "OKB証券へ移管できる株式は、東京
// 証券取引所上場(プライム・スタンダード・グロース、日本銀行出資証券・外国株式を除く)
// の株式およびETF・ETN・REITに限ります". So Tokyo is the TSE book
// (../hachijuni/tseBook.mjs) without the Tokyo-listed foreign shares and
// without the 出資証券 section (the Bank of Japan's 8301 is named; the other
// line, 8421, is in the same section and is not a Prime/Standard/Growth
// share): Prime, Standard and Growth domestic shares, ETFs (foreign-domiciled
// ones included: the firm opens foreign-securities accounts for its US
// trading) and ETNs, less TOKYO PRO Market, bond-type class shares, delisted
// and 整理銘柄 lines. REITs are sold but left out as in the other Japanese
// catalogues. The online trade names no other domestic exchange.
//
// United States. Unlike the other two Japanese brokers of this batch, OKB
// publishes its US list: the stock page's table (ticker, Japanese name,
// market NASDAQ or NewYork, summary), dated ("2025年12月19日 現在"), agency
// orders, limit only ("現地委託取引の取扱いとなります", "指値のみのご注文と
// なります"). The table is the US catalogue; no US ETF is in it. broker-list
// says 49 names (27 NYSE, 22 Nasdaq); the run reads what the table holds.
// The ISIN and the listing venue come from ../../assets (usRow in
// ../mitsubishiufjesmart/japan.mjs); the run checks the venue against the
// table's market column. One row in dollars per name.
//
// Fees: domestic shares 0.33% of the trade value, minimum 330 yen, maximum
// 141,900 yen; US shares 1.32%, minimum USD 11.
//
//   https://www.okb-sec.co.jp/service/products/stock/
//   https://www.okb-sec.co.jp/service/products/etf_etn/
//   https://www.okb-sec.co.jp/service/onlinetrade/contents/
//   https://www.okb-sec.co.jp/faq/
//   https://www.okb-sec.co.jp/service/fee/
//
//   node brokers/okb/okb_scraping.mjs

import { fetchText, textOf, usRow, writeCatalogue } from "../mitsubishiufjesmart/japan.mjs";
import { tseBook } from "../hachijuni/tseBook.mjs";

const SITE = "https://www.okb-sec.co.jp";
const STOCK = `${SITE}/service/products/stock/`;
const ETF = `${SITE}/service/products/etf_etn/`;
const FAQ = `${SITE}/faq/`;
const FEES = `${SITE}/service/fee/`;
const VENUE = { NASDAQ: "XNAS", NewYork: "XNYS" };

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function checkPages() {
  const checks = [
    [ETF, "東京証券取引所に上場されているETF(上場投資信託)・ETN(上場投資証券)を 取り扱っています"],
    [FAQ, "株式の取引は、国内・海外ともにオンライントレードのみでのお取扱となります"],
    [FAQ, "東京証券取引所上場(プライム・スタンダード・グロース、日本銀行出資証券・外国株式を除く)の株式およびETF・ETN・REITに限ります"],
    [FEES, "国内株式等売買委託手数料 【計算式】 手数料(税込) ＝ 約定代金 × 0.33％"],
    [FEES, "米国株式売買委託手数料 【計算式】 手数料(税込) ＝ 約定代金 × 1.32％"],
  ];
  for (const [url, phrase] of checks) {
    if (!textOf(await fetchText(url)).includes(phrase)) throw new Error(`${url} no longer says ${phrase}`);
    await pause(600);
  }
}

async function usList() {
  const html = await fetchText(STOCK);
  const text = textOf(html);
  for (const phrase of ["東京証券取引所(プライム・スタンダード・グロース)に上場されている株式と米国株式を取り扱っています", "現地委託取引の取扱いとなります"]) {
    if (!text.includes(phrase)) throw new Error(`OKB stock page no longer says ${phrase}`);
  }
  const table = html.match(/<table>[\s\S]*?ティッカー[\s\S]*?<\/table>/)?.[0];
  if (!table) throw new Error("OKB US table not found");
  const rows = [];
  const mismatched = [];
  for (const match of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => textOf(cell[1]));
    if (!cells.length) continue;
    const [ticker, name, market] = cells;
    if (!/^[A-Z][A-Z.]*$/.test(ticker) || !VENUE[market]) throw new Error(`OKB US line not read: ${cells.join(" | ")}`);
    const row = usRow({ symbol: ticker, name, type: "STOCK", note: market });
    if (row.mic !== VENUE[market]) mismatched.push(`${ticker} (${market}, lists say ${row.mic || row.exchange})`);
    rows.push(row);
  }
  if (rows.length < 30) throw new Error(`OKB US table has only ${rows.length} names`);
  return { rows, mismatched, asOf: text.match(/(\d{4}年\d{1,2}月\d{1,2}日) 現在/)?.[1] || "?" };
}

await checkPages();
const us = await usList();
const tokyo = await tseBook({ foreignShares: false, contributions: false });

writeCatalogue(import.meta.url, "okb-parsed.json", [...tokyo.rows, ...us.rows], {
  "Tokyo STOCK": 3500,
  "Tokyo ETF": 300,
  XNAS: 15,
  XNYS: 15,
});
console.error(`US list of ${us.asOf}: ${us.rows.length} names${us.mismatched.length ? `; venue differs from the table: ${us.mismatched.join(", ")}` : ""}`);
console.error(`Tokyo left out: ${JSON.stringify(tokyo.dropped)}`);
