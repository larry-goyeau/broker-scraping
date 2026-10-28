// What InvesCore Capital sells in shares, with no login. InvesCore Capital
// is a member broker of the Mongolian Stock Exchange; its clients order on
// the exchange's one order book through https://trade.icapital.mn/, so the
// book is every share and ETF the MSE lets trade today, in tugriks.
// The broker page says: "You can invest in shares, bonds, asset-backed
// securities, investment funds, and other investment instruments traded on
// the Mongolian stock market". Its FAQ, terms of service and broker page
// name no board, segment or security left out, so nothing is removed for
// the broker. broker-list.json gives one place, Mongolian Stock Exchange.
// The reading of the exchange, what is kept (listed company shares, the
// two exchange-traded funds ALTT and FTI) and what is left out (suspended,
// delisted and never-traded lines, the closed-end funds MFG and XOC,
// bonds, asset-backed and government securities) are in ./mseBook.mjs,
// shared with Bulgan Broker.
//
// Fees: the FAQ says "There is a 1% commission for trading." and
// "Commission is charged only when the order is executed".
//   https://icapital.mn/help-us/%d1%82%d2%af%d0%b3%d1%8d%d1%8d%d0%bc%d1%8d%d0%bb-%d0%b0%d1%81%d1%83%d1%83%d0%bb%d1%82-%d1%85%d0%b0%d1%80%d0%b8%d1%83%d0%bb%d1%82?lang=en   (FAQ, tariff)
//   https://icapital.mn/service/%d0%b1%d1%80%d0%be%d0%ba%d0%b5%d1%80?lang=en   (broker service)
//   https://icapital.mn/1310?lang=en   (terms of service)
//   https://mse.mn/trade-history
//   https://mse.mn/suspended-companies
//
//   node brokers/invescore/invescore_scraping.mjs

import { writeMseCatalogue } from "./mseBook.mjs";

const rows = await writeMseCatalogue({
  broker: "InvesCore Capital",
  out: new URL("invescore-parsed.json", import.meta.url),
});
// The book must keep the big names; a broken read fails here.
for (const ticker of ["APU", "KHAN", "GLMT", "TTL", "MSE"]) {
  if (!rows.some((row) => row.ticker === ticker && /^MN/.test(row.isin))) throw new Error(`${ticker} is missing from the InvesCore Capital catalogue`);
}
