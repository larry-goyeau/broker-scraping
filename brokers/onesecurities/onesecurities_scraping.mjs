// ONE Securities (a subsidiary of ONE Bank PLC; DSE member, CSE TREC 148)
// sells on both Bangladeshi exchanges and prints no list of its own. Its
// services page offers "Trading of Share on Both Stock Exchanges", and its
// menu carries an online-trading application form and a trading link for
// each exchange ("DSE Online Trading Application Form Trading Link CSE
// Online Trading Application Form Trading Link"). The Chittagong Stock
// Exchange lists it among its members (https://www.cse.com.bd/stockbroker/all).
//
//   https://www.onesecuritiesbd.com/products-services/services
//   https://www.onesecuritiesbd.com/products-services/products
//
// No board, segment or category is excluded on its pages, so the
// catalogue is both exchanges whole: every open Dhaka line (../mika/dseBook.mjs)
// and every open Chittagong line (./chittagongBook.mjs), main-board shares
// and SME-board shares (open only to qualified investors under the BSEC SME
// rules: a client condition, a remark, not a removal). A company listed on
// both exchanges gets one row per place, same ISIN. The closed-end mutual
// funds are typed FUND by the books and dropped by stampRows; no ETF is
// listed in Bangladesh. Bonds, debentures, sukuk, treasury bonds, the
// Alternative Trading Boards, suspended and never-traded lines stay out.
// All in taka (XDHA, XCHG).
//
// Fees: https://www.onesecuritiesbd.com/products-services/products
// ("Brokerage Commission 0.25% to 0.45%", the same for the direct, margin
// and non-resident accounts; take 0.45%)
//
//   node brokers/onesecurities/onesecurities_scraping.mjs

import { writeBangladeshCatalogue } from "./chittagongBook.mjs";

await writeBangladeshCatalogue(import.meta.url, "onesecurities-parsed.json", {
  places: ["DSE", "CSE"],
  evidence: [
    {
      url: "https://www.onesecuritiesbd.com/products-services/services",
      patterns: [/Trading of Share on Both Stock Exchanges/i, /DSE Online Trading Application Form/i, /CSE Online Trading Application Form/i],
    },
    {
      url: "https://www.onesecuritiesbd.com/products-services/products",
      patterns: [/Brokerage Commission 0\.25% to 0\.45%/i],
    },
  ],
});
