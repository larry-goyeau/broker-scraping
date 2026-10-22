// What Kumari Securities sells in shares, with no login. Kumari Securities is
// NEPSE broker no. 1. Its clients order through the exchange's TMS, so
// the book is every security the Nepal Stock Exchange lets trade today.
// The broker's own search list (/api/mkt/stocks/choices) is the same list the
// Siprabi template serves (no type, matured debentures and merged banks
// kept, recent listings missing), so the exchange's list is read instead
// and the broker's list is fetched as a check that both describe the same
// market. The reading, what is kept (ordinary, promoter and perpetual
// preference shares open to trade, all in rupees) and what is left out
// (debentures, closed-end funds, suspended, delisted, legacy lines with
// no ISIN, orphan promoter lines; Nepal lists no ETF) and the remark on
// a bank's or insurer's promoter share (regulator vets the buyer) are in
// ../kumari/nepseShares.mjs, shared by the four brokers on this template.
// broker-list.json gives one place, Nepal Stock Exchange, with no
// restriction.
//
//   https://www.kumarisecurities.com/pages/services/brokerage   (equity tariff)
//   https://www.kumarisecurities.com/api/mkt/stocks/choices
//   https://www.kumarisecurities.com/pages/services/online
//   https://nepalstock.com.np/company
//   https://nepalstock.com.np/api/nots/company/list
//   https://nepalstock.com.np/api/nots/security?nonDelisted=true
//   https://nepalstock.com.np/api/nots/security/<id>
//
//   node brokers/kumari/kumari_scraping.mjs

import { writeNepseCatalogue } from "./nepseShares.mjs";

const rows = await writeNepseCatalogue({
  broker: "Kumari Securities",
  listUrl: "https://www.kumarisecurities.com/api/mkt/stocks/choices",
  out: new URL("kumari-parsed.json", import.meta.url),
});
// The book must keep the big names; a broken read fails here.
for (const ticker of ["NABIL", "NICA", "NTC", "CHCL"]) {
  if (!rows.some((row) => row.ticker === ticker && /^NP/.test(row.isin))) throw new Error(`${ticker} is missing from the Kumari Securities catalogue`);
}
