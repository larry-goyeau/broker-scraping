// What South Asian Bulls (NEPSE broker no. 43, Kuleshwor, Kathmandu) sells
// in shares, with no login. Its services page says: "SAB is authorized by
// Sebon and has taken membership from Nepse to work as a stockbroker", and
// the site links the exchange's TMS for online orders. It names no
// narrower set, and on TMS every member trades the whole board. So the
// book is every share NEPSE lets trade today, read from the exchange's
// company list by ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs
// (what is kept and left out is written there). The ticker on its home
// page prints NEPSE symbols but is no security list. broker-list.json
// gives one place, Nepal Stock Exchange, with no restriction. Everything
// trades in rupees.
//
// Fees: the site prints no tariff table; the share price calculator on
// the home page holds it in its inline script: 0.40% up to Rs 50,000, then
// 0.37%, 0.34%, 0.30% and 0.27%, plus the 0.015% SEBON fee and Rs 25 DP
// charge ("Commission Amount includes NEPSE Commission & SEBON Regularity
// Fee"). That is the SEBON schedule in force before 2024, above today's
// 0.36% top rate; the page is read raw.
//
//   https://southasianbulls.com/our-services/   (statement)
//   https://southasianbulls.com/                 (calculator, tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/southasianbulls/southasianbulls_scraping.mjs

import { writeNepseBook, getText } from "../thrive/nepseBook.mjs";

const SITE = "https://southasianbulls.com";

await writeNepseBook({
  broker: "South Asian Bulls",
  out: new URL("southasianbulls-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/our-services/`, pattern: /taken membership from Nepse to work as a stockbroker/i },
    { url: `${SITE}/`, pattern: /if\( ?50000 >= totalAmount\)\{\s*Commission = 0\.0040\s*\* totalAmount/, text: getText },
  ],
});
