// What Christfund Securities (恒豐證券, Hong Kong) sells online in shares
// and ETFs, with no login: Hong Kong securities, Shanghai and Shenzhen
// A-shares through Northbound Stock Connect, and Shanghai and Shenzhen
// B-shares, on its ieasy trading platform.
// The services page: "港股市場 -普通正股、認股證、債券、ETF及房地產信託基金
// (REIT) 等等" and "上交所及深交所市場 - 通過 (滬港通/深港通) 買賣的合資格A股
// ( HKEX名單 )", then "網上交昜平台". It publishes no list of its own.
//
// Fees (證券收費表, effective 1 January 2023): Hong Kong "網上交易經紀佣金
// 交易金額之 0.075% 最低 HK$50" (by phone 0.10%, minimum HK$75). The table
// is headed "(香港)" and has no line for Stock Connect commission.
//
// Hong Kong: no page names an HKEX board or kind of share or fund that is
// not traded, so (owner rule: the whole place unless the broker names an
// exception) the catalogue is HKEX's whole book of shares, REITs and ETPs
// (../primehk/hkexBook.mjs; HKD, USD and RMB counters as their own codes;
// suspended lines out). Warrants and bonds are sold too but are not shares
// or ETFs, so they are left out.
//
// Stock Connect: "HKEX名單" links HKEX's eligible-securities page, so the
// list is HKEX's Northbound buy-and-sell lists (../bocomhk/connectBook.mjs),
// ETFs included. The broker's Stock Connect risk statement (下載區 →
// 滬深港通買賣風險聲明, a PDF) says "深交所創業板 只限於機構專業投資者買賣":
// ChiNext shares stay with a remark (a property of the client). STAR Market
// shares stay with a remark too (Stock Connect rule: institutional
// professional investors only; the broker's pages do not exclude the
// board).
//
// B-shares: service.php and price.php do not name them, but both trading
// platform manuals on 下載區 (增強版使用手冊(HTML), 標準版使用手冊(JAVA):
// "恒豐證券網上交易系統") show the platform's tabs 港股買賣 | IPO申請 |
// 滬深B股買賣 | 戶口設定 in their screenshots (HTML manual pages 5, 6 and
// 10; Java manual pages 5 and 6). The manuals are old (Internet Explorer
// screenshots of 2011) and no tariff line names B-shares, but nothing
// withdraws the offer, and the platform's current translation file
// (ieasy.iasia.com.hk/Christfund/tc/user/translation.js) still has B-share
// order messages ("B股下單價格超出範圍"). Owner rule (2026-10-28): an
// uncertain title is kept. So the Shanghai B-shares (USD) and Shenzhen
// B-shares (HKD) are added from the two exchanges' own lists, less
// suspended and delisted lines (./bShareBook.mjs). The tab is only in
// screenshots, so the two manuals are pinned by SHA-256: a new file throws
// and must be read again.
//
//   https://www.christfund.com/service.php
//   https://www.christfund.com/download.php
//   https://www.christfund.com/form/disclaimer.pdf
//   https://www.christfund.com/form/html_manual.pdf
//   https://www.christfund.com/form/java_manual.pdf
//   https://www.hkex.com.hk/Mutual-Market/Stock-Connect/Eligible-Stocks/View-All-Eligible-Securities
//   https://www.sse.com.cn/assortment/stock/list/share/
//   https://www.szse.cn/market/product/stock/list/index.html
//
// Fees: https://www.christfund.com/price.php
//
//   node brokers/christfund/christfund_scraping.mjs

import { createHash } from "node:crypto";
import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence, hkCatalogue } from "../bocomhk/hkCatalogue.mjs";
import { bShareBook } from "./bShareBook.mjs";

const SITE = "https://www.christfund.com";

await evidence(`${SITE}/service.php`, [
  /港股市場 -普通正股、認股證、債券、ETF及房地產信託基金\(REIT\)/,
  /上交所及深交所市場 - 通過 \(滬港通\/深港通\) 買賣的合資格A股 \( HKEX名單 \)/,
  /網上交昜平台/,
]);
await evidence(`${SITE}/download.php`, [/滬深港通買賣風險聲明/, /增強版使用手冊\(HTML\)/, /標準版使用手冊\(JAVA\)/]);

// The 滬深B股買賣 tab is in the manuals' screenshots: pin the files.
const MANUALS = {
  "form/html_manual.pdf": "d0f5ec5ec5131f44c196d62e3cda26e0efd5c0353f2de5b9bf11227864ce4688",
  "form/java_manual.pdf": "2a2163582d8004a2102e3f716f4f8a9af3df5de3a832ff4d8c75c705c165a6dd",
};
for (const [file, sha] of Object.entries(MANUALS)) {
  const response = await fetch(`${SITE}/${file}`, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${response.status} ${SITE}/${file}`);
  const got = createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
  if (got !== sha) throw new Error(`${SITE}/${file} changed (sha256 ${got}): check its 滬深B股買賣 tab again`);
}
await evidence(`${SITE}/price.php`, [/網上交易經紀佣金 交易金額之 0\.075% 最低 HK\$50/]);

const rows = await hkCatalogue({
  folder: "christfund",
  connect: { STAR: "remark", ChiNext: "remark" },
  least: { HKEX: 2500, connect: 3500 },
});

const b = await bShareBook();
const bRows = stampRows(withoutObligations(b.rows));
const taken = new Set(rows.map((row) => `${row.mic}|${row.ticker}`));
for (const row of bRows) if (taken.has(`${row.mic}|${row.ticker}`)) throw new Error(`B-share ${row.mic}:${row.ticker} already in the catalogue`);
const all = [...rows, ...bRows];
fs.writeFileSync(new URL("./christfund-parsed.json", import.meta.url), JSON.stringify(all, null, 2));
console.error(`christfund: + ${bRows.length} B-shares (${bRows.filter((row) => row.mic === "XSHG").length} SSE USD, ${bRows.filter((row) => row.mic === "XSHE").length} SZSE HKD; quotes ${JSON.stringify(b.quotes)}; left out ${JSON.stringify(b.left)}) = ${all.length} rows`);
