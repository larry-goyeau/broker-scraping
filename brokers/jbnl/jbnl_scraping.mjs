// What JBNL Securities (NEPSE broker no. 89) sells in shares, with no
// login. The firm now trades as Global IME Securities (gisl.com.np, whose
// TMS link is tms89.nepsetms.com.np; SEBON's broker register lists Global
// IME Securities and no JBNL). Its stock brokerage page says: "NEPSE lists
// various companies, and investors can buy and sell shares of these listed
// companies through brokers registered with the exchange", and the FAQ
// sends new clients to the TMS online registration. It names no narrower
// set, and on TMS every member trades the whole board. So the book is every
// share NEPSE lets trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there). The broker publishes no security list of
// its own. broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
// Fees: the home page's "Service Charge" table, "Equity (EQ)": "1 to
// 50,000 0.36" down to 0.24 (percent).
//
//   https://gisl.com.np/                           (TMS 89, equity tariff)
//   https://gisl.com.np/stock-brokerage-service/   (statement)
//   https://nepalstock.com.np/company
//
//   node brokers/jbnl/jbnl_scraping.mjs

import { writeNepseBook, getText } from "../thrive/nepseBook.mjs";

const SITE = "https://gisl.com.np";

await writeNepseBook({
  broker: "JBNL Securities (Global IME Securities)",
  out: new URL("jbnl-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/`, pattern: /tms89\.nepsetms\.com\.np/, text: getText },
    { url: `${SITE}/stock-brokerage-service/`, pattern: /investors can buy and sell shares of these listed companies through brokers registered with the exchange/i },
    { url: `${SITE}/`, pattern: /Equity \(EQ\)[\s\S]{0,200}?Transaction Amount Brokerages Commission \(%\) 1 to 50,000 0\.36/i },
  ],
});
