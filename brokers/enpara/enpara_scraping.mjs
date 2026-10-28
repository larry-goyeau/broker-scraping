// What Enpara.com (QNB's online bank) sells, with no login: the shares of
// Borsa Istanbul, its only place, with no exchange-traded funds. Its
// shares page: "Borsa İstanbul hisse senedi işlemlerinizi Cep Şubemiz
// üzerinden kolayca gerçekleştirebilirsiniz", and its FAQ gives the whole
// product list: "Borsa İstanbul'da bulunan hisse senetlerine, Enpara
// fonlarına ve TEFAS'ta işlem gören yatırım fonlarına yatırım yapabilirsiniz".
// Borsa yatırım fonları (BYF) trade on the exchange, not on TEFAS, and are
// not in that list, so the exchange's ETFs are left out. Orders go to the
// exchange through QNB Invest ("QNB Invest üzerinden ilgili platformlara
// iletilmektedir"). No page names a market segment it does not serve, so
// every segment stays in. US shares are not offered ("Amerikan
// hisselerine yatırım yapabilir miyim? Şu an için hayır").
//
// The list is the exchange's (../halkyatrm/bistBook.mjs): KAP's listed
// companies with TradingView's names and ISINs, checked against the
// exchange's end-of-day equity bulletin, which drops suspended lines
// (UMPAS on 2026-10-23) and lines no longer traded. ISATR and ISKUR (İş
// Bankası A and founders' shares) are open for orders but rarely trade;
// they stay in. Warrants, rights, certificates and bonds stay out.
//
// The investor profile test (temkinli/dengeli/atak) can make a client
// accept a risk notice before buying shares; that depends on the client
// and removes nothing.
//
//   https://www.enpara.com/yatirim-hesabi/hisse-senedi
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//
// Fees: https://www.enpara.com/yatirim-hesabi/hisse-senedi ("BİST hisse
// senedi işlemlerinizi komisyonsuz") and https://www.enpara.com/ucretler
// ("BİST alış/satış işlem komisyonu %0 (Komisyonsuz)")
//
//   node brokers/enpara/enpara_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistBook } from "../halkyatrm/bistBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet, bulletinDate, notShares, missing, kapCodes } = await bistBook();
const funds = rows.filter((row) => row.type !== "STOCK").map((row) => row.ticker);
const kept = stampRows(withoutObligations(rows.filter((row) => row.type === "STOCK")));
for (const row of kept) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("enpara-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

console.error(
  `enpara: ${kept.length} rows, BIST STOCK; ISIN ${kept.filter((row) => row.isin).length}; ` +
    `KAP ${kapCodes} codes; bulletin ${bulletinDate}; ETFs left out ${funds.length}; ` +
    `dropped ${dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
    `no trade in the session: ${quiet.join(" ") || "none"}; ` +
    `not a share ${notShares.length}; not on TradingView ${missing.length} (${missing.join(" ") || "none"})`
);
