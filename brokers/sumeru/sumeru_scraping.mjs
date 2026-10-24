// What Sumeru Securities (NEPSE broker no. 39, Gyaneshwor, Kathmandu)
// sells in shares, with no login. Its basis is weaker than the other Nepal
// brokers: it has no services page that ties it to the NEPSE list, only
// its FAQ. The FAQ (a React site; the answers come from its public API)
// lists "Stock buying and selling through NEPSE" among its services and
// says: "You can buy as few as 10 shares (the minimum lot size) of any
// listed company." It names no narrower set, and clients order through
// the exchange's TMS (tms39.nepsetms.com.np), where every member trades
// the whole board. So the book is every share NEPSE lets trade today, read
// from the exchange's company list by ../thrive/nepseBook.mjs and
// ../kumari/nepseShares.mjs (what is kept and left out is written there).
// The broker's own stock search (/api/market/stocks?q=) returns at most 20
// matches and nothing for an empty query, so it cannot be listed.
// broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction. Everything trades in rupees.
//
// The FAQ's tariff is a shortened SEBON table: "0.36% for amounts up to
// NPR 50,000, 0.33% for NPR 50,001 to 5,00,000, and 0.24% for above NPR
// 5,00,000", with the SEBON fee and DP charge on top. It skips the 0.31%
// and 0.27% bands.
//
//   https://www.sumerusecurities.com/faqs
//   https://www.sumerusecurities.com/api/faqs/public   (statement and tariff)
//   https://nepalstock.com.np/company
//
//   node brokers/sumeru/sumeru_scraping.mjs

import { writeNepseBook, getText } from "../thrive/nepseBook.mjs";

const FAQ = "https://www.sumerusecurities.com/api/faqs/public";

// The FAQ answers, joined; the API must still answer with its list.
async function faqWords(url) {
  const body = JSON.parse(await getText(url));
  if (!body.success || !Array.isArray(body.data) || body.data.length < 20) throw new Error(`${url} changed shape`);
  return body.data.map((faq) => `${faq.question} ${faq.answer}`).join(" ").replace(/\s+/g, " ");
}

await writeNepseBook({
  broker: "Sumeru Securities",
  out: new URL("sumeru-parsed.json", import.meta.url),
  evidence: [
    { url: FAQ, pattern: /Stock buying and selling through NEPSE/i, text: faqWords },
    { url: FAQ, pattern: /as few as 10 shares \(the minimum lot size\) of any listed company/i, text: faqWords },
    { url: FAQ, pattern: /0\.36% for amounts up to NPR 50,000/i, text: faqWords },
  ],
});
