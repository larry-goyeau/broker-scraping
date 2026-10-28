// What Başkent Menkul Değerler (Başkent Yatırım) sells, with no login: every
// share and exchange-traded fund on Borsa Istanbul, its only place. Its FAQ
// lists what a client trades: "Pay Piyasası'nda hisse senetleri, VİOP ...
// sözleşmeleri, yatırım fonları ve varantlarda işlem gerçekleştirebilirsiniz".
// Its tariff prices orders "Pay Piyasası'ndaki tüm pazarlarda" (every market
// of the equity market, so the Watchlist market and the Pre-Market Trading
// Platform stay in) and carries the exchange-traded fund lines of custody
// and settlement ("BYF ve varantlar", "Borsa Yatırım Fonu Takas Ücreti").
// No page says it does not take BYF orders, so the funds stay in. The same
// tariff row leaves "varant ve sertifika ve BYF işlemleri" out of its
// sliding share rate and gives no other rate for them (a remark for the
// cost file, not a removal).
//
// The list is the exchange's (../halkyatrm/bistBook.mjs): KAP's listed
// companies and BYF funds with TradingView's names and ISINs, checked
// against the exchange's end-of-day equity bulletin, which drops suspended
// lines (UMPAS on 2026-10-23) and lines no longer traded. ISATR and ISKUR
// (İş Bankası A and founders' shares) are open for orders but rarely trade;
// they stay in. Warrants, rights, certificates and bonds stay out.
//
// No foreign shares: the site's products (Borsa Aracılık Hizmetleri,
// Yatırım Fonları) and the tariff cover only Borsa Istanbul, VİOP, the debt
// and money markets, TEFAS funds.
//
//   https://www.baskentmenkul.com.tr/tr/yardim-merkezi/sikca-sorulan-sorular
//   https://www.baskentmenkul.com.tr/tr/bireysel-hizmetlerimiz/borsa-aracilik-hizmetleri
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.kap.org.tr/tr/YatirimFonlari/BYF
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://www.baskentmenkul.com.tr/tr/yardim-merkezi/ucret-ve-komisyonlar
//
//   node brokers/baskentmenkul/baskentmenkul_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet, bulletinDate, notShares, missing, kapCodes, kapFunds } = await bistBook();
const kept = stampRows(withoutObligations(rows));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("baskentmenkul-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `baskentmenkul: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}; KAP ${kapCodes} codes, ${kapFunds} funds; bulletin ${bulletinDate}; ` +
    `dropped ${dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `no trade in the session: ${quiet.join(" ") || "none"}; ` +
    `not a share ${notShares.length}; not on TradingView ${missing.length} (${missing.join(" ") || "none"})`
);
