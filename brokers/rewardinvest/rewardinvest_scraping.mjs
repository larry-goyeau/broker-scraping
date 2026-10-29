// What Reward Investments & Services sells online, with no login: every
// share and ETF on the Nigerian Exchange, its only place online. The firm
// is a "Member of the Nigerian Stock Exchange"; its site has an "Online
// Trading Form" to sign up for its portal, and its FAQ says a client can
// "place a sales or purchase mandate via our electronic channels (email,
// sms, portal)" and have it executed. No page excludes a board, a segment
// or ETFs, and none names a list of its own, so the book is the exchange's
// whole listing of the day, read by ../morgancapital/ngxWhole.mjs through
// ../armsec/ngxOnline.mjs (shares, listed REITs and ETFs; closed-end funds,
// suspended and delisting lines left out). Every line trades in naira.
//
// NASD OTC is left out: the header calls the firm a "Participating
// Institution of the NASD OTC Secutities [sic] & Exchange", but no page
// offers NASD securities on its portal or lists them.
//
// Fees: the FAQ, "For purchases, the total commission fees per transaction
// is 1.8555% For sales, the total commission fees per transaction is
// 2.1855%" (brokerage and statutory charges together). The run checks
// these sentences.
//
//   https://www.rewardinvestments.com/faq/
//   https://www.rewardinvestments.com/trading-form/
//
//   node brokers/rewardinvest/rewardinvest_scraping.mjs

import { ngxOnline } from "../armsec/ngxOnline.mjs";

await ngxOnline({
  folder: "rewardinvest",
  evidence: {
    "https://www.rewardinvestments.com/faq/": [
      /place a sales or purchase mandate via our electronic channels \(email, sms, portal\)/,
      /For purchases, the total commission fees per transaction is 1\.8555% For sales, the total commission fees per transaction is 2\.1855%/,
    ],
    "https://www.rewardinvestments.com/trading-form/": [/Online Trading Form Personal Details/],
  },
});
