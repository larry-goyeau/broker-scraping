// What Trishakti Securities (NEPSE broker no. 48, Kathmandu) sells in
// shares, with no login. Its stock trading page says: "trade NEPSE-listed
// securities through TMS from wherever you are", with "a wide range of
// listed securities". It names no narrower set, and every client orders
// through the exchange's TMS, where each member trades the whole board. So
// the book is every share NEPSE lets trade today, read from the exchange's
// company list by ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs
// (what is kept and left out is written there). The broker publishes no
// security list of its own. broker-list.json gives one place, Nepal Stock
// Exchange, with no restriction. Everything trades in rupees.
//
// The tariff is the share calculator's settings, printed in the page as
// JSON (calc-config: 0.36% up to Rs 50,000 down to 0.24%, minimum Rs 10,
// SEBON fee 0.015%, DP charge Rs 25), so that page is read raw.
//
//   https://trishakti.com.np/services/stock-trading
//   https://trishakti.com.np/tools/share   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/trishakti/trishakti_scraping.mjs

import { writeNepseBook, getText } from "../thrive/nepseBook.mjs";

const SITE = "https://trishakti.com.np";

await writeNepseBook({
  broker: "Trishakti Securities",
  out: new URL("trishakti-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services/stock-trading`, pattern: /trade NEPSE-listed securities through TMS/i },
    { url: `${SITE}/tools/share`, pattern: /"tiers":\[\{"upTo":50000,"percent":0\.36\}/, text: getText },
  ],
});
