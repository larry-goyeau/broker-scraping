// What Bulgan Broker sells in shares, with no login. Bulgan Broker
// ("МХБ ГИШҮҮН ҮЦК", a securities company member of the MSE) takes its
// clients' orders to the Mongolian Stock Exchange's one order book, so the
// book is every share and ETF the MSE lets trade today, in tugriks.
// The home page says it sells "Монголын Хөрөнгийн Биржид бүртгэлтэй
// хувьцаа, бонд, ETF‑ийг" (shares, bonds and ETFs listed on the Mongolian
// Stock Exchange), and the fee page prices "Хувьцаа худалдан авалт / зарах"
// (share buy / sell) and "ETF (Биржийн сан)". No page names a board,
// segment or security left out, so nothing is removed for the broker.
// The site's public quote list (https://api.bulganbroker.mn/api/stocks)
// shows 15 sample lines, three of them (HAS, API, DHN) not MSE symbols;
// it is a display sample, not a list of what can be traded, and is not
// used. broker-list.json gives one place, Mongolian Stock Exchange.
// The reading of the exchange, what is kept (listed company shares, the
// two exchange-traded funds ALTT and FTI) and what is left out (suspended,
// delisted and never-traded lines, the closed-end funds MFG and XOC,
// bonds, asset-backed and government securities) are in
// ../invescore/mseBook.mjs, shared with InvesCore Capital.
//
// Fees (the site is a single-page app; the tariff is in its script): shares
// 0.50% with a 1,000 ₮ minimum, ETF 0.40% with a 1,000 ₮ minimum, plus the
// MSE fee 0.07% and the MCSD clearing fee 0.03%.
//   https://bulganbroker.mn/fees   (tariff)
//   https://bulganbroker.mn/
//   https://mse.mn/trade-history
//   https://mse.mn/suspended-companies
//
//   node brokers/bulgan/bulgan_scraping.mjs

import { writeMseCatalogue } from "../invescore/mseBook.mjs";

const rows = await writeMseCatalogue({
  broker: "Bulgan Broker",
  out: new URL("bulgan-parsed.json", import.meta.url),
});
// The book must keep the big names; a broken read fails here.
for (const ticker of ["APU", "KHAN", "GLMT", "TTL", "MSE"]) {
  if (!rows.some((row) => row.ticker === ticker && /^MN/.test(row.isin))) throw new Error(`${ticker} is missing from the Bulgan Broker catalogue`);
}
