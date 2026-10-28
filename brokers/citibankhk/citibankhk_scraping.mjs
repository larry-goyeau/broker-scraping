// What Citibank (Hong Kong) sells online in shares and ETFs, with no login:
// Hong Kong securities, US stocks, and Shanghai / Shenzhen A-shares through
// China Connect. The stock trading page: "In addition to making the most of
// the Hong Kong Stock Market, you can get exclusive access to trading
// opportunities worldwide with the US and China Connect – Shanghai and
// Shenzhen Stock Services"; the US page: "you can invest and trade US stock
// online or on your mobile". No list of titles is published.
//
// Fees (stock services fees and charges leaflet): Hong Kong "網上 / 流動理財
// 證券服務" 0.18%-0.25% by client tier, minimum HKD/CNY100; China Connect the
// same scale, minimum CNY100; US securities 1% to 0.50% by trade size,
// "最低收費USD30" (0.50% for Citigold Private Client).
//
// Hong Kong is HKEX's whole book of shares, REITs and ETPs
// (../primehk/hkexBook.mjs; HKD, USD and RMB counters as their own codes):
// no page names an HKEX board or kind of security that is not traded.
//
// China Connect is HKEX's Northbound buy-and-sell lists
// (../bocomhk/connectBook.mjs), less the board Citibank names:
//   "*Citibank does not offer shares listed on the ChiNext Board of SZSE"
// so SZSE 300xxx-302xxx shares are left out. STAR Market shares stay with a
// remark (Stock Connect rule: institutional professional investors only;
// the Citibank pages do not exclude the board).
//
// The US is the whole exchange book of the day (../wellstrade/usBook.mjs;
// one NBBO row per title, no OTC lines; the US page names no exchange),
// less the exceptions the US page names:
//   "From 29 July, 2022 onwards, Citibank will not accept any new purchase
//   or transfer-in of Publicly Traded Partnerships (PTP) securities"
//   → the lines of the PTP list EleBank publishes (../elebank/ptpList.mjs,
//   the IRC 1446(f) PTP symbols; Citibank publishes none) are left out;
//   "Citibank does not offer any buy order and transfer-in of Exchange
//   Traded Notes (ETN) & Exchange Traded Funds (ETF) with potential loss
//   absorption features" → no listed ETN or ETF is marked as such in any
//   source read, so none is removed for it;
//   "Stocks which can be cleared and settled by The Depository Trust &
//   Clearing Corporation (DTCC). In-scope products (e.g. US warrants ...)
//   under 871(m) ... are not included" → every exchange-listed line settles
//   at DTC; warrants are already out of usBook.
// broker-list.json names the same places (HKEX, United States, both
// Connects).
//
//   https://www.citibank.com.hk/english/wealth-management/investment/stock-trading/
//   https://www.citibank.com.hk/english/wealth-management/investment/stock-trading/us-stock/
//   https://www.citibank.com.hk/english/wealth-management/investment/stock-trading/shanghai-hongkong-stock-connect/
//
// Fees: https://www.citibank.com.hk/english/investment/pdf/Stock_fees_and_charges_leaflet.pdf
//
//   node brokers/citibankhk/citibankhk_scraping.mjs

import { evidence, hkCatalogue } from "../bocomhk/hkCatalogue.mjs";
import { ptpList } from "../elebank/ptpList.mjs";

const SITE = "https://www.citibank.com.hk/english/wealth-management/investment/stock-trading";

await evidence(`${SITE}/`, [/with the US and China Connect – Shanghai and Shenzhen Stock Services/, /Stock_fees_and_charges_leaflet\.pdf|stock services fees and charges/]);
await evidence(`${SITE}/us-stock/`, [
  /invest and trade US stocks? online or on your mobile/,
  /will not accept any new purchase or transfer-in of Publicly Traded Partnerships \(PTP\) securities/,
  /does not offer any buy order and transfer-in of Exchange Traded Notes \(ETN\) & Exchange Traded Funds \(ETF\) with potential loss absorption features/,
]);
await evidence(`${SITE}/shanghai-hongkong-stock-connect/`, [/Citibank does not offer shares listed on the ChiNext Board of SZSE/]);
const { symbols } = await ptpList();

async function withoutPtp(rows) {
  const left = { "US PTP (no new purchase since 29 July 2022)": [] };
  const kept = rows.filter((row) => !symbols.has(row.ticker) || (left["US PTP (no new purchase since 29 July 2022)"].push(`${row.mic}:${row.ticker}`), false));
  return { kept, left };
}

await hkCatalogue({
  folder: "citibankhk",
  connect: { STAR: "remark", ChiNext: "drop" },
  us: { mics: null, filter: withoutPtp },
  least: { HKEX: 2500, connect: 2800, US: 10000 },
});
