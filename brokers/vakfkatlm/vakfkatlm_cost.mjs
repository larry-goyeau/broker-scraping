// What one round trip costs at Vakıf Katılım Bankası: buy n shares at price
// p on Borsa İstanbul, sell them back at once, through its İnternet and
// Mobil Şube, in dollars. Shares of the BIST Katılım index only (the
// catalogue). Orders go to the exchange through Vakıf Yatırım; the other
// shares, traded by phone on the Vakıf Yatırım Emir Hattı or on Vakıf
// Yatırım's own channels, are Vakıf Yatırım's tariff, not this file.
//
// Hisse Senedi page, read on 2026-10-26:
//
//   Commission     "Dijital müşterilerimize özel on binde 5 hisse senedi
//                  alış-satış komisyonu": 0.05 % each way, the online rate.
//                  No minimum and no volume scale are printed.
//   BSMV           not printed with the rate. 5 % is the statutory rate on a
//                  brokerage commission (the bank's own fee table prints
//                  "BSMV Dahil" lines at 5 %), so it is added.
//   Levies         the page and the bank's "Finansal Tüketici Ürün ve Hizmet
//                  Ücret Tablosu" (21.01.2026) name no BIST borsa payı or
//                  Takasbank fee passed on: none added (as Ziraat, HSBC).
//   Not this trip  the BIST order-cancellation fee ("İptal ve kötüleştirme
//                  işlemlerinde Borsa İstanbul'un belirlediği iptal
//                  komisyonu"), MKK custody. No lot fractions ("Bankamızda
//                  lot altı işlem yapılmamaktadır").
//
// Formula: book + 2 × 0.05 % × amount × 1.05 + tax map (no TR rows).
// Cash is lira (the investment account is funded from the lira current
// account), every line is lira: no conversion. Book: Borsa İstanbul through
// spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://www.vakifkatilim.com.tr/tr/kendim-icin/yatirim/sermaye-piyasasi-urunleri/hisse-senedi
//   https://www.vakifkatilim.com.tr/documents/UrunHizmetUcretleri/finansal_tuketici_urun_ve_hizmet_ucret_tablosu_21012026.pdf
//
//   node brokers/vakfkatlm/vakfkatlm_cost.mjs TKFEN BIST TRY --shares=10 --price=4840
//   node brokers/vakfkatlm/vakfkatlm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "vakfkatlm",
  broker: "Vakıf Katılım",
  entity: "Vakıf Katılım Bankası A.Ş.",
  url: "https://www.vakifkatilim.com.tr/tr/kendim-icin/yatirim/sermaye-piyasasi-urunleri/hisse-senedi",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://www.vakifkatilim.com.tr/tr/kendim-icin/yatirim/sermaye-piyasasi-urunleri/hisse-senedi",
    fees: "https://www.vakifkatilim.com.tr/documents/UrunHizmetUcretleri/finansal_tuketici_urun_ve_hizmet_ucret_tablosu_21012026.pdf",
  },
  rate: 0.0005,
  levies: "none",
  bsmvPrinted: false,
  remark: "",
  onlineBuy: true,
  cash: ["TRY"],
  types: ["STOCK"],
  basis:
    "Vakıf Katılım, page Hisse Senedi : « Dijital müşterilerimize özel on binde 5 hisse senedi alış-satış komisyonu », 0,05 % par sens en ligne, sans minimum imprimé",
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
