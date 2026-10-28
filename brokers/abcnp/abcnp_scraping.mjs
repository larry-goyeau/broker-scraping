// What ABC Securities (NEPSE broker no. 17, Kathmandu) sells in shares,
// with no login. Its services page says: "Broking Services includes
// securities such as shares, preference shares, bonds, debentures &
// equities", and of the secondary market: "To buy and sell shares of these
// listed companies, NEPSE authorizes licensed stock broker companies to
// assist investors by opening trading accounts." It names no narrower set,
// and clients order through the exchange's TMS (tms17.nepsetms.com.np), so
// the book is every share NEPSE lets trade today, read from the exchange's
// company list by ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs
// (what is kept and left out is written there). The broker publishes no
// security list of its own. broker-list.json gives one place, Nepal Stock
// Exchange, with no restriction. Everything trades in rupees. Trading
// accounts are for "residents of Nepal" only; that depends on the client,
// so it is a remark, not a removal. The tariff ("Fees And Commission",
// equity: 0.36% minimum Rs. 10 up to Rs. 50,000 down to 0.24%) is on the
// home page.
//
//   https://abc.com.np/services
//   https://abc.com.np/   (tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/abcnp/abcnp_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://abc.com.np";

await writeNepseBook({
  broker: "ABC Securities",
  out: new URL("abcnp-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services`, pattern: /Broking Services includes securities such as shares, preference shares/i },
    { url: `${SITE}/services`, pattern: /buy and sell shares of these listed companies/i },
    { url: `${SITE}/`, pattern: /0\.36% minimum Rs\. 10 for Up to Rs\. 50,000/i },
  ],
});
