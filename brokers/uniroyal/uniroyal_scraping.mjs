// Uniroyal Securities (uTrade) is a Dhaka Stock Exchange member: "a full
// service brokerage firm having Trec No. 089 with Dhaka Stock Exchange Plc".
// Its mission is "a platform for trading on the Dhaka Stock Exchange (DSE)";
// its pages name no Chittagong trading right, so the only venue is XDHA.
//   https://utrade.com.bd/#about
// It prints no list of its own. Its FAQ says "Stock, bonds and mutual fund
// trades" cost the same rate, and it offers "Online Trading of Equities &
// Bonds", so the book is the whole DSE: main-board shares, the closed-end
// mutual funds (listed and traded like shares; type FUND) and the SME
// board. Its pages name no board, segment or category it does not trade.
//   https://utrade.com.bd/#faq
//   https://utrade.com.bd/termsandconditions.html
// The shared DSE book (../mika/dseBook.mjs) reads the exchange directory and
// each company page and leaves out the debt boards (bonds, debentures,
// sukuk, treasury bonds), the Alternative Trading Board (unlisted and
// delisted securities), suspended lines (the five non-viable banks halted
// since November 2025, finance companies under resolution, exit-plan and
// wound-up lines) and lines with no trade in 52 weeks. No ETF is listed on
// the DSE today. SME-board lines are open only to qualified investors under
// the BSEC SME rules: a client condition, so a remark, not a removal.
// Every line trades in taka (BDT).
//
// Fees (0.50% of turnover, minimum BDT 10 per trade): https://utrade.com.bd/#faq
//
//   node brokers/uniroyal/uniroyal_scraping.mjs

import { writeDseCatalogue } from "../mika/dseBook.mjs";

await writeDseCatalogue(import.meta.url, "uniroyal-parsed.json");
