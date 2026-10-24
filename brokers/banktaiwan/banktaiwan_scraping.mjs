// What BankTaiwan Securities (臺銀證券, Bank of Taiwan group) sells in shares
// and ETFs, with no login. broker-list.json has the firm twice, as
// "BankTaiwan Securities" (twfhcsec.com.tw) and "Bank of Taiwan Securities"
// (its XQ trading help); this folder is the first row.
//
// The firm is a domestic broker: its site offers brokerage on the Taiwan
// market only (no sub-brokerage of foreign shares), and prints no security
// list of its own. Its pages tie the account to the listed market:
// - the FAQ prices any listed security the same way, Q6 "買賣有價證券之手續費
//   計算方式？ 手續費：成交金額＊股數＊0.1425％（電子下單優惠，請洽所屬營業員），
//   不足20元以20元計收", and Q24 says ETFs cost the same, "買賣ETF的成本包括了
//   一般的交易成本（手續費、證交稅），手續費與股票相同";
// - Q53 opens the Taiwan Innovation Board to every client who signs the
//   risk notice online ("本公司採線上簽署「096臺灣創新板上市有價證券風險預告書」");
// - the business page gives the tariff (0.1425% up to NT$10 million a month,
//   down to 0.1% above NT$150 million, "電子下單手續費 0.0498%", "手續費每筆至少
//   20元") and says the settlement account is a TWD account only, "交割銀行僅限
//   臺灣銀行新臺幣存款帳戶".
// So the catalogue is every share, preferred share, TDR, REIT and ETF listed
// on the Taiwan Stock Exchange and the Taipei Exchange (the two places in
// broker-list.json, no restriction there), read by ./twBook.mjs. The
// foreign-currency lines of the dual-currency ETFs (00625K and the like)
// settle in renminbi or dollars and stay out: the account settles in TWD only.
// Altered-trading (全額交割) shares stay in: Q10 says they are bought through
// the salesperson, not online ("目前本公司僅開放透過電子交易系統賣出全額交割股，
// 若要買進全額交割股請洽營業員").
//
//   https://www.twfhcsec.com.tw/Home/faq
//   https://www.twfhcsec.com.tw/Activity/BusinessIntro
//
//   node brokers/banktaiwan/banktaiwan_scraping.mjs

import { writeTwBook } from "./twBook.mjs";

const SITE = "https://www.twfhcsec.com.tw";

await writeTwBook({
  broker: "BankTaiwan Securities",
  out: new URL("banktaiwan-parsed.json", import.meta.url),
  evidence: [
    { url: `${SITE}/Home/faq`, pattern: /手續費：成交金額＊股數＊0\.1425％/ },
    { url: `${SITE}/Home/faq`, pattern: /買賣ETF的成本包括了一般的交易成本（手續費、證交稅），手續費與股票相同/ },
    { url: `${SITE}/Activity/BusinessIntro`, pattern: /交割銀行僅限臺灣銀行新臺幣存款帳戶/ },
    { url: `${SITE}/Activity/BusinessIntro`, pattern: /電子下單手續費 0\.0498%/ },
  ],
});
