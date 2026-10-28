// What Jett (OOO "MULTIBROKER", Tashkent, jett.uz) sells in shares, with
// no login. Jett is an app over the brokers Silk Capital, ALKES RESEARCH
// and Finance Invest Brok; its clients order on the Republican Stock
// Exchange "Tashkent" (UZSE), which its FAQ calls "единственной фондовой
// биржей в стране" and which "предоставляет участника возможность
// торговать акциями и облигациями удаленно в онлайн режиме". Its plans
// page prices shares on two boards of that exchange, for every plan
// (Инвестор, Трейдер, Pro): "листинговых акций (STK, покупка/продажа)"
// (exchange 0,31 %, depository 0,05 %, broker 0.63 % or 1 %) and
// "акциями вне листинга (SMS, покупка/продажа)" (exchange 0,41 %,
// depository 0,07 %, broker 0.51 % or 1 %). Neither page names a share,
// board or segment Jett does not take. broker-list.json gives one place,
// Tashkent Republican Stock Exchange, with no restriction.
//
// So the book is the whole share market of UZSE: the quotation-list
// shares (STK: Premium, Standard, Transit, Privatizatsiya; ordinary and
// preferred) and the shares of the exchange's off-exchange board (ВТП,
// SMS) that have traded. Uzbekistan lists no ETF, ETN or ETC. Left out, as
// the shared reader does: bonds (BND, SMB), issuers in the quotation list
// for their bonds only, suspended lines (the exchange's suspension and
// resumption notices), lines in liquidation, never-traded lines, and codes
// that are not Uzbek share codes. Every line trades in sums (UZS). The
// reading is in ../freedomuzbekista/uzseBook.mjs, shared with Freedom
// Broker Uzbekistan.
//
//   https://jett.uz/ru/plans   (tariff)
//   https://jett.uz/ru/        (FAQ)
//   https://jett.uz/ru/partners
//   https://uzse.uz/isu_infos
//   https://uzse.uz/isu_infos/names?mkt_id=STK
//   https://uzse.uz/otcmarkets/isu_elsis
//   https://uzse.uz/boards/notice/list?page=<n>
//
//   node brokers/jett/jett_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { uzseListings } from "../freedomuzbekista/uzseBook.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const TARIFF = "https://jett.uz/ru/plans";
const OUTPUT = new URL("jett-parsed.json", import.meta.url);

const EVIDENCE = [
  /Комиссия брокера на приобретение листинговых акций \(STK, покупка\/продажа\)/,
  /Комиссия брокера на торговлю акциями вне листинга \(SMS, покупка\/продажа\)/,
  /Комиссия биржи на приобретение листинговых акций \(STK, покупка\/продажа\) 0,31%/,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await sleep(2000 * attempt);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "ru" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return await response.text();
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
  }
  throw new Error(last);
}

function words(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const tariff = words(await get(TARIFF));
for (const pattern of EVIDENCE) if (!pattern.test(tariff)) throw new Error(`${TARIFF} no longer says ${pattern}`);

const { rows, leftOut, listed, otc, orderDay, noticesRead } = await uzseListings({ otc: true });
rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
const stamped = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

for (const ticker of ["URTS", "SQBN", "UZMK", "KVTS"]) {
  if (!stamped.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Jett catalogue`);
}
console.error(`UZSE order list of ${orderDay}; ${noticesRead} suspension notices read`);
console.error(`quotation list (STK): ${listed}; off-exchange board (SMS): ${otc}; dropped as bonds: ${rows.length - stamped.length}`);
console.error(`left out (${leftOut.length}): ${leftOut.slice(0, 40).join("; ")}${leftOut.length > 40 ? " ..." : ""}`);
console.error(`wrote ${OUTPUT.pathname} (${stamped.length} rows)`);
