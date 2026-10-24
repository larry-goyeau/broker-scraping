// What Netwealth Share Trading (sharetrading.netwealth.com.au, run by
// Australian Investment Exchange Limited, AUSIEX, AFSL 241400) sells: the
// shares and ETFs quoted on the ASX, on the ASX and on Cboe Australia.
// There is no list of its own: the client searches any ASX code.
//
//   "With over 2,200 companies from a large number of industries listed on
//   the ASX, you can invest across a diverse range of securities."
//     https://www.sharetrading.netwealth.com.au/Public/Trading/AustralianShares.aspx
//   "Code: Enter the security code. You can search for the security code
//   by simply typing the company name in the search box."
//     https://www.sharetrading.netwealth.com.au/Public/ContactAndSupport/SupportHub/SupportHub.aspx?id=PlaceATrade
//   Fees: internet brokerage on "Equities and Warrants", Standard account,
//   "$17.99 per trade for transactions up to $5,001" ... "0.11% per trade
//   for all transactions above $25,001".
//     https://www.sharetrading.netwealth.com.au/Public/FeesAndCharges/FeesAndCharges.aspx
//
// ETFs are kept: nothing on the site leaves them out, and an ETF is an ASX
// code traded like a share.
//
// Places: AUSIEX is "a Market Participant of ASX Limited and Cboe Australia
// Pty Ltd" (footer of every page). Its Best Execution Policy: "AUSIEX may
// connect to and submit orders to any of the following order books at its
// discretion: ASX TradeMatch, ASX Centre Point, Cboe Australia." and "Some
// financial products are only quoted on one execution venue, or with one
// licensed market operator, including ASX or Cboe". So an ASX line that
// Cboe also matches gets an ASX row and a Cboe Australia row, and a fund
// listed on Cboe alone gets a Cboe Australia row (../netwealth/australia.mjs
// says how each list is read).
//   https://www.sharetrading.netwealth.com.au/media/86140/netw1020_best_execution_policy.pdf
//
// Left out: options, warrants and government bonds (the site's other
// products), and international shares, which this site does not offer
// (its menu and site map list Australian Shares, Options, Warrants and
// Government Bonds only). Currency: AUD only ("you can only transfer AUD
// at this point", Australian Shares FAQ).
//
//   node brokers/netwealth/netwealth_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { australianRows, fetchWith, logCounts, pageText } from "./australia.mjs";

const SITE = "https://www.sharetrading.netwealth.com.au";
const EVIDENCE = [
  [`${SITE}/Public/Trading/AustralianShares.aspx`, /over 2,?\d{3} companies from a large number of industries listed on the ASX, you can invest across/i],
  [`${SITE}/Public/FeesAndCharges/FeesAndCharges.aspx`, /Market Participant of ASX Limited and Cboe Australia/i],
  [`${SITE}/Public/FeesAndCharges/FeesAndCharges.aspx`, /Equities and Warrants \$\d+\.\d{2} per trade for transactions up to/i],
  [`${SITE}/Public/HomePage/Sitemap.aspx`, /Trading Australian Shares Options Warrants Government Bonds Trading Tools/i],
];
const SITE_MAP = `${SITE}/Public/HomePage/Sitemap.aspx`;

const pages = new Map();
for (const [url, sentence] of EVIDENCE) {
  if (!pages.has(url)) pages.set(url, pageText(await fetchWith(url)));
  if (!sentence.test(pages.get(url))) throw new Error(`${url} no longer says ${sentence}`);
}
if (/International (Shares|Equities|Trading)|US Shares|Global Shares/i.test(pages.get(SITE_MAP))) {
  throw new Error(`${SITE_MAP} now lists foreign shares: look for a list`);
}

const { rows, dropped } = await australianRows({ places: ["ASX", "Cboe Australia"] });
for (const [ticker, exchange] of [["BHP", "ASX"], ["BHP", "Cboe Australia"], ["VAS", "ASX"], ["NWSLV", "ASX"], ["AEAE", "Cboe Australia"]]) {
  if (!rows.some((row) => row.ticker === ticker && row.exchange === exchange)) throw new Error(`${ticker} is missing on ${exchange}`);
}

fs.writeFileSync(new URL("netwealth-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
logCounts(rows, dropped);
