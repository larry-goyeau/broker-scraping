// What Xalq Bank (Baku) sells in shares, with no login: the whole Baku Stock
// Exchange (BSE, MIC XIBE), its only place. The bank became a BSE member in
// 2025 (BSE disclosure of 26 Aug 2025, "Xalq Bank Becomes a Member of the
// Baku Stock Exchange"). Its broker page offers individuals and companies
// "Korporativ istiqrazlar və səhmlərin alqı-satqısı" (buying and selling
// corporate bonds and shares) with no list and no segment named, and the
// retail XalqOnline user guide has a "Qiymətli kağızlar" section (16.1 open
// an investment account, 16.2 my securities, 16.3 "Qiymətli kağızlar
// bazarı", the securities market) where the client picks a security and
// enters price, currency, quantity and validity. Nothing on these pages
// leaves out a segment, a board or a kind of share, so the catalogue is the
// whole BSE share book, read by ./bakuBook.mjs (Main and Standard market;
// the Growth market has no share today). broker-list.json names no
// restriction.
//
// Left out (in bakuBook.mjs): bonds, Central Bank notes and repo (the
// tariff prices them, but they are not shares); suspended and delisted lines
// announced on the BSE Disclosures page (none at the last run: the ABB halt
// of 20 Oct 2026 applied to that day only, and Unicapital, delisted in June
// 2026, is already off the Market Watch). The BSE lists no ETF, ETN or ETC.
// Lines whose only trade is their placement on the BSE ("no trade since
// listing" in raw) did trade once on the exchange and stay. All lines trade
// in AZN; ticker and query are the ISIN (the Market Watch prints no
// symbols).
//
// Fees (individuals, no login): "1.4 Səhmlərin alqı-satqısı", primary and
// secondary market, "0.06% min.5 AZN/USD/EUR" of the deal amount; OTC deals
// 0.06% min. 50 (secondary); depo account opening "Pulsuz" (free); companies
// pay "razılaşma əsasında" (by agreement).
//
//   https://api.xalqbank.az/storage/temp/processing/investisiya-xidmetleri-uzre-tarifler.pdf   (tariff)
//   https://www.xalqbank.az/az/ferdi/bank/tarifler
//   https://www.xalqbank.az/az/korporativ/diger-xidmetler/broker-emeliyyatlari
//   https://api.xalqbank.az/storage/XO-istifad-i-t-limat-Retail-Mob.pdf   (XalqOnline guide, section 16)
//   https://www.bfb.az/en/market-watch
//   https://www.bfb.az/en/news
//
//   node brokers/xalq/xalq_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bakuBook } from "./bakuBook.mjs";
import fs from "node:fs";

const rows = withoutObligations(await bakuBook());

// The book must keep the big names; a broken read fails here.
for (const [isin, label] of [["AZ1012006628", "Pasha Bank"], ["AZ1004004581", "ABB"]]) {
  if (!rows.some((row) => row.isin === isin)) throw new Error(`${label} ${isin} is missing from the Xalq Bank catalogue`);
}
if (rows.length < 20) throw new Error(`only ${rows.length} BSE shares`);
for (const row of rows) {
  if (row.mic !== "XIBE" || row.type !== "STOCK" || !/^AZ[0-9A-Z]{10}$/.test(row.isin)) throw new Error(`unexpected line ${JSON.stringify(row)}`);
}

fs.writeFileSync(new URL("xalq-parsed.json", import.meta.url), JSON.stringify(stampRows(rows), null, 2));
const byCurrency = {};
for (const row of rows) byCurrency[row.currency] = (byCurrency[row.currency] || 0) + 1;
console.error(`${rows.length} Baku Stock Exchange shares (${Object.entries(byCurrency).map(([currency, count]) => `${currency} ${count}`).join(", ")}); no trade since listing: ${rows.filter((row) => row.raw.includes("no trade since listing")).length}`);
