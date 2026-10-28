// What S.P.S.A. Securities (NEPSE broker, Kathmandu, licensed by SEBON in
// 2080 B.S.) sells in shares, with no login. Its stock brokerage page says:
// "Brokerage Service includes buying and selling shares on behalf of
// clients and doing settlements" and "SPSA Securities offers Online Trading
// through Trade Management System (TMS)." It names no narrower set of
// shares, and every client orders through the exchange's TMS, where each
// member trades the whole board. So the book is every share NEPSE lets
// trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there; bonds and mutual funds are left out there,
// like in the other Nepal catalogues). Its margin lending service is a
// financing remark, not a limit on what can be bought. The broker publishes
// no security list of its own. broker-list.json gives one place, Nepal
// Stock Exchange, with no restriction. Everything trades in rupees.
//
// The tariff page is in Nepali (0.36% up to Rs 50,000, down to 0.24% above
// Rs 1 crore).
//
//   https://spsasecurities.com.np/service/stock-brokerage-services
//   https://spsasecurities.com.np/broker-charges   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/spsasecurities/spsasecurities_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://spsasecurities.com.np";

await writeNepseBook({
  broker: "S.P.S.A. Securities",
  out: new URL("spsasecurities-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/service/stock-brokerage-services`, pattern: /buying and selling shares on behalf of clients/i },
    { url: `${SITE}/service/stock-brokerage-services`, pattern: /offers Online Trading through Trade Management System \(TMS\)/i },
    { url: `${SITE}/broker-charges`, pattern: /धितोपत्र दलाली बापत लिन पाउने सेवा शुल्क रु\. ५०,०००।– सम्म ०\.३६ %/ },
  ],
});
