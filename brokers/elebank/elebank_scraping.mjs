// What EleBank (大象銀行, formerly Airstar Bank; a Hong Kong virtual bank)
// sells in shares and ETFs in its app, with no login: Hong Kong and US
// shares and ETFs ("股票 · 港美股"). It publishes no list of titles.
//
// Fees (stocks page): Hong Kong "一世免佣*" or "最低 HKD 3/筆 （0.03%*交易金額）"
// plus a "HKD 15/筆" platform fee; US "最低 USD 0.99/筆 （0.0049/股）" plus
// "最低 USD 1/筆 （0.005/股）".
//
// Hong Kong: the same page says odd lots "支援所有港股股票/ETF", so the
// catalogue is HKEX's whole book of shares, REITs and ETPs
// (../primehk/hkexBook.mjs; HKD, USD and RMB counters as their own codes).
//
// United States: the market introduction in the help centre says "美股主要
// 交易巿場分別有紐交所、納斯達克、美交所" (main markets, not the only ones; it
// cites VOO, IVV and SPY, listed on NYSE Arca), so the catalogue is the
// whole US exchange book of the day (../wellstrade/usBook.mjs, one NBBO row
// per title, no OTC lines), less the exception EleBank names: its PTP
// article says "鑒於 該扣税的複雜性，大象將禁止交易相關股票" and lists the
// symbols (./ptpList.mjs); those lines are left out. Its order notes
// ("訂單價格偏離市價40%以上 ... 拒絕下單", trading caps on micro-caps, orders on
// halted shares rejected) limit orders, not titles; halted lines are
// already out of usBook.
//
// broker-list.json lists HKEX, NYSE, Nasdaq and NYSE American; the US rows
// here also hold the NYSE Arca, Cboe BZX and Texas listings (see above).
//
//   https://www.elebank.com/zh-hk/stocks.html
//   https://support.platform.elebank.com/personal/zh-hk/topic15_386   (美股市場介紹)
//   https://support.platform.elebank.com/personal/zh-hk/topic15_771   (PTP)
//
// Fees: https://www.elebank.com/zh-hk/stocks.html
//
//   node brokers/elebank/elebank_scraping.mjs

import { evidence, hkCatalogue } from "../bocomhk/hkCatalogue.mjs";
import { ptpList } from "./ptpList.mjs";

await evidence("https://www.elebank.com/zh-hk/stocks.html", [/支援所有港股股票\/ETF/, /美股低至 USD 0\.0049\/股/]);
await evidence("https://support.platform.elebank.com/personal/zh-hk/topic15_386", [/美股主要交易巿場分別有紐交所、納斯達克、美交所/]);
const { symbols } = await ptpList();

async function withoutPtp(rows) {
  const left = { "US PTP (EleBank list)": [] };
  const kept = rows.filter((row) => !symbols.has(row.ticker) || (left["US PTP (EleBank list)"].push(`${row.mic}:${row.ticker}`), false));
  return { kept, left };
}

await hkCatalogue({
  folder: "elebank",
  us: { mics: null, filter: withoutPtp },
  least: { HKEX: 2500, US: 10000 },
});
