// What Neev Securities (NEPSE broker no. 47, Pulchowk, Lalitpur) sells in
// shares, with no login. Its services page says: "Trade with us in equity,
// mutual fund, bond and debenture listed in Nepal Stock Exchange." It does
// not say "all" word for word, but names no narrower set, and clients
// order through the exchange's TMS (tms47.nepsetms.com.np), where every
// member trades the whole board. So the book is every share NEPSE lets
// trade today, read from the exchange's company list by
// ../thrive/nepseBook.mjs and ../kumari/nepseShares.mjs (what is kept and
// left out is written there). The broker publishes no security list of its
// own. broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
// The tariff on the same page ("Brokerage Fee*") prints an older slab
// table (0.40%, 0.37%, 0.34%, 0.3%, 0.27%) with two rows both labelled
// "50,001 to 5,00,000"; the scraper only checks that a tariff is there.
//
//   https://neevsecurities.com/services   (statement and equity tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/neev/neev_scraping.mjs

import { writeNepseBook } from "../thrive/nepseBook.mjs";

const SITE = "https://neevsecurities.com";

await writeNepseBook({
  broker: "Neev Securities",
  out: new URL("neev-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/services`, pattern: /equity, mutual fund, bond and debenture listed in Nepal Stock Exchange/i },
    { url: `${SITE}/services`, pattern: /Brokerage Fee\*.*Flat Rs 10 or 0\.\d+%/i },
  ],
});
