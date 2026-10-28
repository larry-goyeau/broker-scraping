// What Hachijuni Securities (八十二証券, Hachijuni Nagano Bank group) sells
// through its online trade.
//
// Tokyo only. The products-and-hours page lists one share market for the
// online service, "東京証券取引所（プライム・スタンダード・グロース）", cash and
// round lots only ("現物株の単元株取引に限定しております"), and only names whose
// best-execution market is the TSE ("最良執行市場を東京証券取引所としている
// 銘柄に限定し、お取次ぎいたします"). The best-execution policy says the same:
// online orders go to the TSE alone, for names whose selected market (the
// busiest one, per Nomura Research Institute's terminal) is the TSE; a name
// whose selected market is Nagoya, Fukuoka or Sapporo is taken at the branch
// only. A TSE-listed line is almost always selected on the TSE and no list of
// the others is published, so the catalogue is the whole TSE book (see
// ./tseBook.mjs): Prime, Standard and Growth shares, domestic and foreign,
// the 出資証券 line, and the ETF/ETN section, less TOKYO PRO Market, the
// REIT/fund section, bond-type class shares, JASDEC's not-handled 8301,
// delisted, 整理銘柄 and dropped ETF/ETN lines.
//
// ETFs stay: the same page says foreign-domiciled ETFs on the TSE need a
// foreign securities account ("東京証券取引所に上場している外国籍のETFのお取引
// には、外国証券口座の開設が必要となります"), which depends on the client, so
// it is a remark, not a removal. Also a remark: clients whose account is at
// 八十二長野銀行 cannot buy shares online ("八十二長野銀行をお取扱部店として
// いるお客様は、株式のご購入のお取引はご利用いただけません"). The page names no
// limit on ETNs. Every row is in yen on XTKS.
//
//   https://www.82sec.co.jp/trade/commodity.php
//   https://www.82sec.co.jp/trade/service.php
//   https://www.82sec.co.jp/info/images/bestexecution.pdf
// Fees (online share tariff, 0.6325 % up to 1 million yen, minimum 1,375 yen):
//   https://www.82sec.co.jp/trade/fee.php
//
//   node brokers/hachijuni/hachijuni_scraping.mjs

import { fetchText, textOf, writeCatalogue } from "../mitsubishiufjesmart/japan.mjs";
import { tseBook } from "./tseBook.mjs";

const COMMODITY = "https://www.82sec.co.jp/trade/commodity.php";
const FEES = "https://www.82sec.co.jp/trade/fee.php";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function checkPages() {
  const commodity = textOf(await fetchText(COMMODITY));
  for (const phrase of [
    "東京証券取引所（プライム・スタンダード・グロース）",
    "現物株の単元株取引に限定",
    "最良執行市場を東京証券取引所としている銘柄に限定",
    "外国籍のETF",
  ]) {
    if (!commodity.includes(phrase)) throw new Error(`Hachijuni products page no longer says ${phrase}`);
  }
  await pause(1000);
  const fees = textOf(await fetchText(FEES));
  if (!fees.includes("株式売買手数料") || !fees.includes("オンライントレード")) {
    throw new Error("Hachijuni fee page no longer shows the online share tariff");
  }
}

await checkPages();
const { rows, dropped, added, liquidation } = await tseBook();
writeCatalogue(import.meta.url, "hachijuni-parsed.json", rows, { "Tokyo STOCK": 3500, "Tokyo ETF": 400 });
console.error("Left out:", JSON.stringify(dropped));
console.error(`整理銘柄 dropped: ${liquidation.join(", ") || "none"}`);
console.error(`Added since the month-end file (${added.length}): ${added.join("; ")}`);
