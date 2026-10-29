// What Capital Investments (the investment arm of Capital Bank of Jordan,
// Amman) sells online in shares and ETFs, with no login: US-listed stocks
// and ETPs, through its trading application for regional and international
// markets (the GTN platform, "Capinvest Trader").
//
// Its brokerage page: "Our regional and international brokerage services
// provide clients with access to over 35 countries spread over MENA, GCC,
// North America, Europe, and Asia", through a brokerage desk; online, the
// fee schedule it publishes for its trading application, "International
// Brokerage Fees and Commission-online trading" (annex 2, "عمولات ورسوم
// الوساطة الدولية – التداول الالكتروني"), prices one market: "الولايات
// المتحدة الأمريكية", for "Stocks, ETPs & Warrants" and US options, and its
// note (5) says "يقتصر هذا الجدول على العمولات و الرسوم المستوفاه على
// التداول الالكتروني فقط" (the table covers online trading only). The other
// markets (regional, London, Europe, Asia) are priced only in the dealer
// schedules ("Regional Brokerage Fees and Commissions", "International
// Brokerage Fees and Commission"), so they are left out (owner rule:
// online only). broker-list.json's restriction says the same.
//
// The US annex names no exchange and no kind of share left out (it prices
// shares under $1), so the catalogue is the whole US exchange book of the
// day (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt, warrants, rights, units, when-issued lines
// and listed notes (usBook) and bonds (withoutObligations). OTC is not
// named and not added. One NBBO market: one row per title, on its primary
// listing, in dollars.
//
// The Amman Stock Exchange (broker-list.json's other place) is traded by
// Capital Investments' local brokerage department and in its ASE app
// (com.mfs.mtrade.cap), but no page or schedule gives a commission for ASE
// trades, so it is not written (owner rule: no published fee, no place).
//
//   https://www.capitalinv.com/en/investments/services/brokerage
//   https://www.capitalinv.com/en/investments/services/brokerage/account-opening-forms
//
// Fees (annex 2, online): shares under $1 0.4% of value, minimum $25 a
// deal, plus $15 a deal; $1 to $10 0.4% plus $15; $10 to $100 $0.035 a
// share plus $15; over $100 0.05% of value, minimum $30, maximum $250 or
// 10 cents a share; US options $3.5 a contract plus $15.
//   https://www.capitalinv.com/-/media/capital-invest/pdf/investor-relations/english/international-brokerage-fees-and-commotions---online-trading.pdf
//
//   node brokers/capitalinv/capitalinv_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const SITE = "https://www.capitalinv.com";
const ANNEX = `${SITE}/-/media/capital-invest/pdf/investor-relations/english/international-brokerage-fees-and-commotions---online-trading.pdf`;
const EVIDENCE = [
  [`${SITE}/en/investments/services/brokerage`, [/Regional and International Brokerage Department/, /access to over 35 countries/]],
  [
    `${SITE}/en/investments/services/brokerage/account-opening-forms`,
    [/International Brokerage Fees and Commission-online trading/, /international-brokerage-fees-and-commotions---online-trading\.pdf/],
  ],
];

async function get(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response;
}

// The pages still say what the header quotes, or the run stops. The annex
// is a scanned PDF: it must still be served.
for (const [url, patterns] of EVIDENCE) {
  const html = await (await get(url)).text();
  const text = `${html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ")} ${html}`;
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}
const annex = Buffer.from(await (await get(ANNEX)).arrayBuffer());
if (annex.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${ANNEX} is no longer a PDF`);

const us = await usBook();
const rows = stampRows(withoutObligations(us));
if (rows.length < 10_000) throw new Error(`only ${rows.length} US rows`);
fs.writeFileSync(new URL("capitalinv-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`capitalinv: ${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`US left out: ${Object.entries(us.report.leftOut).map(([what, list]) => `${list.length} ${what}`).join(", ")}; halts: ${us.report.halts.join(", ")}`);
