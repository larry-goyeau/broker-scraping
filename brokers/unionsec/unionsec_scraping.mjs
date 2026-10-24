// What Union Securities (聯邦證券, Union Bank of Taiwan group; not the bank's
// own foreign shelf, which is ../unionbank) sells in shares and ETFs, with no
// login.
//
// The firm is a domestic broker: its site offers Taiwan shares, futures and
// funds, no sub-brokerage of foreign shares, and prints no security list of
// its own. Its pages tie the account to the listed market:
// - the Taiwan-shares page: "台股係指於臺灣證券交易所及櫃買中心掛牌交易之有價證券，
//   包含上市、上櫃股票、ETF 及相關商品" and "提供上市、上櫃股票之買賣交易服務";
// - the FAQ, to "什麼是ETF商品，聯邦證券能否交易？", answers that clients trade
//   them like ordinary shares ("客戶可跟買賣一般股票一樣，在證券交易市場上進行交易");
// - the FAQ tariff: "成交金額 x 千分之1.425元(整股交易者，不滿20元以20元計，零股
//   則是最低1元起)", with the online discount refunded the next month.
// So the catalogue is every share, preferred share, TDR, REIT and ETF listed
// on the Taiwan Stock Exchange and the Taipei Exchange, read by
// ../banktaiwan/twBook.mjs. Leveraged and inverse ETFs stay in: the FAQ says
// they need a signed risk notice, not that they are refused. The
// foreign-currency lines of the dual-currency ETFs (00625K and the like)
// settle in renminbi or dollars and stay out: no page offers a foreign
// settlement account.
//
// Emerging Stock Board (興櫃): broker-list.json gives it, and the FAQ shows
// clients order there. Its trading answer explains why an order may not
// fill: "是否為興櫃之股票，興櫃股票為議價交易，就算價格出現低於投資人買進價或高於其
// 賣出價，也不一定會成交" (an emerging-board share is negotiated, so it may not
// fill even at the price), and it says the board's gold lines can be bought
// ("在興櫃市場上也有AU9901與AU9902兩檔黃金現貨標的…可買賣"). So the board's
// shares and TDR are added on their own place (twBook.mjs, emerging: true).
// The board's signed risk notice depends on the client, not the title.
// Checked on 2026-10-24.
//
//   https://www.usot.com.tw/stock.htm
//   https://www.usot.com.tw/faq.htm
//
//   node brokers/unionsec/unionsec_scraping.mjs

import { writeTwBook } from "../banktaiwan/twBook.mjs";

const SITE = "https://www.usot.com.tw";

await writeTwBook({
  broker: "Union Securities",
  out: new URL("unionsec-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/stock.htm`, pattern: /台股係指於臺灣證券交易所及櫃買中心掛牌交易之有價證券，\s*包含上市、上櫃股票、ETF/ },
    { url: `${SITE}/faq.htm`, pattern: /什麼是ETF商品，聯邦證券能否交易？/ },
    { url: `${SITE}/faq.htm`, pattern: /成交金額 x 千分之1\.425元/ },
    { url: `${SITE}/faq.htm`, pattern: /是否為興櫃之股票，興櫃股票為議價交易/ },
  ],
  emerging: true,
});
