// What one round trip costs at Hayat Finans Katılım Bankası: buy n shares at
// price p on Borsa İstanbul, sell them back at once, in its mobile app, in
// dollars. Shares of the BIST Katılım index only (the catalogue). The bank
// is the agent of OYAK Yatırım Menkul Değerler ("Hayat Finans Katılım
// Bankası, Oyak Yatırım Menkul Değerler'in acentesidir").
//
// Read on 2026-10-26:
//
//   Commission     shares page FAQ "Komisyon oranınız nedir? Komisyon oranı:
//                  0,002 (binde 2)", and the Ürün ve Hizmet Ücretleri table,
//                  Menkul Kıymet İşlemleri, "Hisse Senedi - Komisyon ...
//                  Alım satım işlem tutarı üzerinden binde 2 oranında ücret
//                  tahsis edilir" (31.12.2025): 0.2 % each way, no minimum
//                  ("Asgari Tutar -").
//   BSMV           not printed on the commission line (the account-fee line
//                  next to it says "BSMV dahildir"). 5 % is the statutory
//                  rate on a brokerage commission, so it is added.
//   Levies         no BIST borsa payı or Takasbank fee passed on is named on
//                  either page: none added (as Ziraat, HSBC).
//   Not this trip  "Hisse Senedi - Hesap İşletim Ücreti ... Aylık 15 TL BSMV
//                  dahildir" (about 0.31 USD a month, an account fee, not a
//                  trade cost), the one-off MKK account-opening fee, the BIST
//                  order-cancellation fee, MKK custody.
//
// Formula: book + 2 × 0.2 % × amount × 1.05 + tax map (no TR rows).
// Cash is lira, every line is lira: no conversion. Book: Borsa İstanbul
// through spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://hayatfinans.com.tr/yatirim-ve-birikim/hisse-senedi-islemleri-yatirim-ve-birikim
//   https://hayatfinans.com.tr/urun-ve-hizmet-ucretleri
//
//   node brokers/hayatfinanskatlm/hayatfinanskatlm_cost.mjs TKFEN BIST TRY --shares=10 --price=4840
//   node brokers/hayatfinanskatlm/hayatfinanskatlm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "hayatfinanskatlm",
  broker: "Hayat Finans",
  entity: "Hayat Finans Katılım Bankası A.Ş. (acente d'OYAK Yatırım Menkul Değerler A.Ş.)",
  url: "https://hayatfinans.com.tr/urun-ve-hizmet-ucretleri",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://hayatfinans.com.tr/urun-ve-hizmet-ucretleri",
    shares: "https://hayatfinans.com.tr/yatirim-ve-birikim/hisse-senedi-islemleri-yatirim-ve-birikim",
  },
  rate: 0.002,
  levies: "none",
  bsmvPrinted: false,
  remark: "",
  onlineBuy: true,
  cash: ["TRY"],
  types: ["STOCK"],
  basis:
    "Hayat Finans, Ürün ve Hizmet Ücretleri : « Hisse Senedi - Komisyon … binde 2 oranında ücret tahsis edilir », 0,2 % par sens, sans minimum",
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
