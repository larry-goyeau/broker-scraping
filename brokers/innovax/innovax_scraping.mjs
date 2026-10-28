// What Innovax Securities (創升證券, Hong Kong), now Austrax Securities
// (南強證券; innovax.hk redirects to austrax.com, the group still listed as
// 2680.HK), sells online in shares and ETFs, with no login: Hong Kong
// securities and US stocks. It publishes no list of titles.
//
// Fees (收费标准, two images): "Hong Kong Stock Trading Fee Schedule
// (Effective from 25 September 2026)": commission 0.25%, minimum HK$100;
// "US Stock Trading Fee Schedule (Effective from 2 April 2026)": "Commission
// Fee (Electronic Channels) US$0.0068 per share", minimum US$2, plus a
// platform fee of US$0.006 per share (electronic channels).
//
// Hong Kong: the FAQ says "网上交易平台为客户提供香港股票、窝轮、牛熊证及交易所买卖
// 基金等买卖服务", naming no board or kind of share left out, so the catalogue
// is HKEX's whole book of shares, REITs and ETPs (../primehk/hkexBook.mjs;
// HKD, USD and RMB counters as their own codes). Warrants and CBBCs are not
// shares or ETFs and stay out.
//
// United States: the US fee schedule prices electronic-channel orders and
// names no exchange and no kind of share or fund that cannot be bought (it
// prices PTP withholding on sales and a CAT fee for "US Stock (OTC)"), so
// the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs, one NBBO row per title). OTC: the same
// electronic-channel schedule charges the CAT fee on "US Stock (OTC)" and
// names no OTC tier, so the OTC Markets lines of the four tiers with a
// public quote, OTCQX, OTCQB, OTCID and Pink Limited, are added
// (../moomoous/otcBook.mjs, owner rule: the tiers the broker names, else
// all of them).
//
// broker-list.json lists HKEX only (its note cites a 2025 US Stock
// Application Form); the US place here rests on the US fee schedule above.
//
// Client-dependent, so not a removal: HKEX's leveraged and inverse
// products need an SFC derivatives-knowledge assessment.
//
//   https://www.austrax.com/customer-service/faq/
//   https://www.austrax.com/brokerage/securities-trading/
//
// Fees: https://www.austrax.com/customer-service/fee-schedule/
//   https://www.austrax.com/images/service/fee-schedule/hk1.png, hk2.png
//   https://www.austrax.com/images/service/fee-schedule/us1.png
//
//   node brokers/innovax/innovax_scraping.mjs

import { evidence, hkCatalogue } from "../bocomhk/hkCatalogue.mjs";
import { OTC_PUBLIC } from "../moomoous/otcBook.mjs";

await evidence("https://www.austrax.com/customer-service/fee-schedule/", [/香港股票交易服务收费标准/, /美国股票交易服务收费标准/]);
await evidence("https://www.austrax.com/customer-service/faq/", [/网上交易平台为客户提供香港股票、窝轮、牛熊证及交易所买卖基金等买卖服务/]);

await hkCatalogue({
  folder: "innovax",
  us: { mics: null, otc: OTC_PUBLIC },
  least: { HKEX: 2500, US: 20000 },
});
