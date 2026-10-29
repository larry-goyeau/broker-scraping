// ZA Bank (Hong Kong's first virtual bank) sells shares and ETFs in its app,
// on two places:
//
// - Hong Kong: "Comprehensive HK stock categories. We cover stocks, ETFs, VA
//   ETFs, CBBCs and warrants" (HK stocks page), with no list, so the place
//   is the whole HKEX book (../primehk/hkexBook.mjs through
//   ../bocomhk/hkCatalogue.mjs: shares, REITs and exchange-traded products,
//   leveraged and inverse products and virtual-asset ETFs included; HKD,
//   USD and RMB counters each on their own code; suspended and never-traded
//   lines left out). CBBCs and warrants are not shares or ETFs.
//     https://bank.za.group/en/hkstock
//
// - United States: "Choose from more than 6,000 US stocks and 3,000 ETFs"
//   (US stocks page). No list is published, so by the owner's stated-count
//   rule the place keeps the 6,000 most popular US shares and the 3,000
//   most popular US ETFs, ranked by 30-day traded value on TradingView's US
//   scanner (../tfcapital/usTop.mjs), from the whole US exchange book
//   (../wellstrade/usBook.mjs, one NBBO row per title on its primary
//   listing). Exchange-traded notes are neither and stay out; OTC lines are
//   not offered.
//     https://bank.za.group/en/usstock
//
// Fees ("Fees and Charges Guide for Investment Services", the PDF behind
// https://bank.za.group/en/rates-list): brokerage 0 on both markets;
// platform fee HK "0.05% of transaction amount (Min HKD 18 per order)",
// US "USD 0.0099 per share (Min USD 1.99 per order)".
//   https://cdn.zaticdn.com/if/ipage/prd/data/agreement/en_US/1001287.pdf
//
//   node brokers/zabank/zabank_scraping.mjs

import { evidence, hkCatalogue } from "../bocomhk/hkCatalogue.mjs";
import { usTop } from "../tfcapital/usTop.mjs";
import { pdfSays } from "../alphasec/pdfSays.mjs";

const US_STOCKS = 6_000;
const US_ETFS = 3_000;

await evidence("https://bank.za.group/en/hkstock", [/We cover stocks, ETFs, VA ETFs, CBBCs and warrants/]);
await evidence("https://bank.za.group/en/usstock", [/Choose from more than 6,000 US stocks and 3,000 ETFs/]);
await pdfSays("https://cdn.zaticdn.com/if/ipage/prd/data/agreement/en_US/1001287.pdf", [
  /0\.05% of transaction amount \(Min HKD 18 per order\)/,
  /USD 0\.0 ?099 per share \(Min USD 1 ?\. ?99 per order\)/,
]);

await hkCatalogue({
  folder: "zabank",
  us: {
    mics: null,
    filter: async (rows) => {
      const stocks = await usTop(rows.filter((row) => row.type === "STOCK"), US_STOCKS);
      const etfs = await usTop(rows.filter((row) => row.type === "ETF"), US_ETFS);
      console.error(`  US shares ${JSON.stringify(stocks.report)}; US ETFs ${JSON.stringify(etfs.report)}`);
      const kept = new Set([...stocks, ...etfs]);
      const left = {};
      for (const row of rows) {
        if (kept.has(row)) continue;
        const reason = row.type === "ETN" ? "US ETN (not offered)" : `US ${row.type} beyond the stated count`;
        (left[reason] ||= []).push(`${row.exchange}:${row.ticker}`);
      }
      return { kept: [...stocks, ...etfs], left };
    },
  },
  least: { HKEX: 2500, US: US_STOCKS + US_ETFS },
});
