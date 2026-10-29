// Padma Bank Securities (a subsidiary of Padma Bank; DSE member, CSE TREC
// 151) sells online through one channel, the Dhaka Stock Exchange's own app:
// "The app allows users to access their trading accounts from Padma Bank
// Securities PLC directly from their mobile phones", and "investors can view
// their portfolio, place and track orders". Its own order management system
// was still out to tender in 2026 ("Tender for Order management System
// (OMS)"). It prints no list of its own.
//
//   https://padmasecurities.com.bd/newsdetails.php?sbp=4180
//   https://padmasecurities.com.bd/newsdetails.php?sbp=4181
//
// Padma is a Chittagong member too (https://www.cse.com.bd/stockbroker/all,
// broker-list places), but DSE Mobile reaches the Dhaka book only and its
// pages name no online route to Chittagong: a Chittagong order goes through
// its traders, so the CSE stays out (online only). The pages exclude no
// board, segment or category, so the catalogue is the whole DSE
// (../mika/dseBook.mjs): main-board shares and SME-board shares (open only
// to qualified investors under the BSEC SME rules: a client condition, a
// remark, not a removal). The closed-end mutual funds are typed FUND by the
// book and dropped by stampRows; no ETF is listed in Dhaka. Bonds,
// debentures, sukuk, treasury bonds, the Alternative Trading Board,
// suspended and never-traded lines stay out. All in taka on XDHA.
//
// Fees: https://padmasecurities.com.bd/newsdetails.php?sbp=4179
// ("Standard Commission Rate for Client trading": 0.40 up to 25 lac of
// portfolio or 1 crore of monthly volume, down to 0.25; take 0.40%)
//
//   node brokers/padmabanksec/padmabanksec_scraping.mjs

import { writeBangladeshCatalogue } from "../onesecurities/chittagongBook.mjs";

await writeBangladeshCatalogue(import.meta.url, "padmabanksec-parsed.json", {
  places: ["DSE"],
  evidence: [
    {
      url: "https://padmasecurities.com.bd/newsdetails.php?sbp=4180",
      patterns: [/access their trading accounts from Padma Bank Securities/i, /place and track orders/i],
    },
    {
      url: "https://padmasecurities.com.bd/newsdetails.php?sbp=4179",
      patterns: [/Standard Commission Rate for Client trading/i, /Up to 25 Lac 0\.40/i],
    },
  ],
});
