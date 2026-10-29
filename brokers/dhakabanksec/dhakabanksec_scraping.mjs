// Dhaka Bank Securities (DBSL, a subsidiary of Dhaka Bank) sells online on
// the Dhaka Stock Exchange and prints no list of its own. Its online
// service is "Real Time Internet Trading", and its broker page lists
// "Trading on Dhaka Stock Exchange", "Trading on Chittagong Stock Exchange"
// and "I-trading in both stock exchanges".
//
//   https://dhakabanksecurities.com/products/our-services/online-service/
//   https://dhakabanksecurities.com/products/our-services/broker-service/
//
// The Chittagong place stays out: the Chittagong Stock Exchange's own list
// of its members (https://www.cse.com.bd/stockbroker/all, 160 TREC holders
// in October 2026) does not name Dhaka Bank Securities, and the broker-list
// row gives the DSE only. The pages exclude no board, segment or category,
// so the catalogue is the whole DSE (../mika/dseBook.mjs): main-board
// shares and SME-board shares (open only to qualified investors under the
// BSEC SME rules: a client condition, a remark, not a removal). The
// closed-end mutual funds are typed FUND by the book and dropped by
// stampRows; no ETF is listed in Dhaka. Bonds, debentures, sukuk, treasury
// bonds, the Alternative Trading Board, suspended and never-traded lines
// stay out. All in taka on XDHA.
//
// Fees: https://dhakabanksecurities.com/products/fees-charges/
// ("Brokerage Commission Tk. 0.50%" on the direct trading account; 0.40%
// on the margin account, 0.50% for non-residents)
//
//   node brokers/dhakabanksec/dhakabanksec_scraping.mjs

import { writeBangladeshCatalogue } from "../onesecurities/chittagongBook.mjs";

await writeBangladeshCatalogue(import.meta.url, "dhakabanksec-parsed.json", {
  places: ["DSE"],
  evidence: [
    {
      url: "https://dhakabanksecurities.com/products/our-services/broker-service/",
      patterns: [/Trading on Dhaka Stock Exchange/i, /I-trading in both stock exchanges/i],
    },
    {
      url: "https://dhakabanksecurities.com/products/our-services/online-service/",
      patterns: [/Real Time Internet Trading/i],
    },
    {
      url: "https://dhakabanksecurities.com/products/fees-charges/",
      patterns: [/Brokerage Commission Tk\. 0\.50%/i],
    },
  ],
});
