// What Apex Capital (Апекс Капитал ҮЦК, Ulaanbaatar) sells in shares online,
// with no login. It trades the Mongolian Stock Exchange and foreign
// markets through its trading system trader.apex.mn and the app "Apex
// Traders". It publishes no instrument list.
//
// Mongolian Stock Exchange, its stock page:
//   "цахим арилжааны систем trader.apex.mn болон гар утасны "Apex Traders"
//    аппликэйшнээр дамжуулан та хөрөнгийн зах зээлд оролцох боломжтой юм"
//   "Апекс Капитал ҮЦК нь дотоодын хөрөнгийн зах зээл дээр арилжаалагдаж
//    буй бүх төрлийн үнэт цаасыг /хувьцаа, бонд, ... нээлттэй хөрөнгө
//    оруулалтын сан/ харилцагчдадаа хамгийн бага шимтгэлээр зуучлан санал
//    болгож байна", with "1% шимтгэл" (1 % commission).
//   https://apex.mn/mn/personal/stock
// So the MSE catalogue is the exchange's whole share book: every listed
// company share and the two exchange-traded funds (ALTT, FTI), in tugriks;
// suspended, delisted and never-traded lines, closed-end funds, bonds and
// asset-backed securities out (../invescore/mseBook.mjs).
//
// United States, its home page:
//   "Дэлхийн компаниудад хөрөнгө оруулья Apple, Tesla, Microsoft, Amazon...
//    ... гадаад хөрөнгийн зах зээлтэй шууд холбогдож, олон улсын арилжаанд
//    оролцох ... Гадаадын улс 33 Бирж 150 Арилжааны шимтгэл 1%"
//   "ХУВЬЦААНЫ АРИЛЖАА Монголын хөрөнгийн бирж болон гадаад зах зээл дээр
//    хувьцаа худалдах авах, арилжаанд оролцох бүрэн боломжтой."
//   https://apex.mn/mn
// The page gives 33 countries and 150 exchanges without naming them, and
// shows US tickers (GOOGL TSLA JPM ...); broker-list.json gives only the
// United States, so only the US is added: with no list, the whole US
// exchange book of the day (../wellstrade/usBook.mjs: one row per title on
// its primary listing, in dollars; warrants, rights and units out). OTC
// Markets is not named and is not added. The other foreign exchanges are
// not named on Apex's pages and are left out.
//
// Restriction in broker-list.json: none.
//
// Run-time checks: both pages must still carry the lines above.
//
//   node brokers/apexcapital/apexcapital_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { mseBook } from "../invescore/mseBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function words(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return (await response.text()).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/\s+/g, " ");
}

for (const [url, phrases] of [
  ["https://apex.mn/mn/personal/stock", ["trader.apex.mn", "Apex Traders", "1% шимтгэл"]],
  ["https://apex.mn/mn", ["Арилжааны шимтгэл 1%", "Монголын хөрөнгийн бирж болон гадаад зах зээл дээр хувьцаа худалдах авах"]],
]) {
  const text = await words(url);
  for (const phrase of phrases) if (!text.includes(phrase)) throw new Error(`${url} no longer says: ${phrase}`);
}

const mse = await mseBook();
const us = await usBook();
const rows = [...mse.rows.map((row) => ({ ...row })), ...us];
for (const ticker of ["APU", "KHAN", "TTL"]) {
  if (!rows.some((row) => row.exchange === "Mongolian Stock Exchange" && row.ticker === ticker)) throw new Error(`MSE ${ticker} is missing`);
}
for (const ticker of ["AAPL", "TSLA", "SPY"]) {
  if (!us.some((row) => row.ticker === ticker)) throw new Error(`US ${ticker} is missing`);
}
if (us.length < 5000) throw new Error(`only ${us.length} US rows`);

const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("apexcapital-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
const counts = {};
for (const row of written) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${written.length} rows`, counts, "MSE left out:", mse.left);
